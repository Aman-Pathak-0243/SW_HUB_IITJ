// Club / society / student-chapter MEMBERSHIP service (M3, DL-075) — a STANDALONE
// many-to-many between an account (app_user) and a LOGICAL org unit
// (org_unit_lineage), durable across academic years. One user can belong to many
// clubs; the importer syncs a coordinator-submitted email list, idempotent by
// (user, lineage) (DL-031).
//
// Conventions (the spine): authorize FIRST — `membership.manage` SCOPED to the
// unit's lineage (requireScopedPermission, DL-066) — before any account/membership
// disclosure; one semantic audit row per add/remove (a bulk CSV sync writes ONE
// summary row); JSON-safe shapes; DB guards via mapDbError. ClubMembership is in
// AUTO_AUDIT_SKIP, so these semantic writes are the sole audit source.
import prisma, { prismaBase } from "../prisma.mjs";
import { assertActorPermission, getCurrentYearId } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { recordAudit } from "../cms/audit.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { MEMBERSHIP_STATUS_SET, normalizeMembershipRole, parseMembershipCsv } from "./forms.mjs";

const ENTITY = "club_membership";
const MANAGE_PERM = "membership.manage";

const WITH_USER = { user: { select: { id: true, email: true, name: true, status: true } } };

// ── PURE ──
export function shapeMembership(m) {
  if (!m) return null;
  return {
    id: m.id,
    userId: m.userId,
    userEmail: m.user?.email ?? null,
    userName: m.user?.name ?? null,
    userStatus: m.user?.status ?? null,
    orgUnitLineageKey: m.orgUnitLineageKey,
    role: m.role ?? null,
    status: m.status,
    joinedAt: m.joinedAt instanceof Date ? m.joinedAt.toISOString() : m.joinedAt ?? null,
    createdAt: m.createdAt instanceof Date ? m.createdAt.toISOString() : m.createdAt ?? null,
  };
}

// PURE keyset cursor (createdAt + id; club_membership.id is a uuid, not monotonic).
export function encodeMembershipCursor(row) {
  if (!row) return null;
  const iso = row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt);
  return Buffer.from(`${iso}|${row.id}`, "utf8").toString("base64url");
}
export function decodeMembershipCursor(cursor) {
  if (!cursor) return null;
  const raw = Buffer.from(String(cursor), "base64url").toString("utf8");
  const i = raw.lastIndexOf("|");
  if (i < 0) throw new CmsValidationError(`Invalid cursor '${cursor}'.`);
  const createdAt = new Date(raw.slice(0, i));
  const id = raw.slice(i + 1);
  if (Number.isNaN(createdAt.getTime()) || !id) throw new CmsValidationError(`Invalid cursor '${cursor}'.`);
  return { createdAt, id };
}

// Resolve the target LINEAGE from any of { orgUnitLineageKey | orgUnitId | slug }.
// Org units are PUBLIC, so this lookup discloses nothing — safe to run before the
// authorize step (which needs the lineage as its scope). Returns the lineageKey.
async function resolveLineage(input = {}, client = prisma) {
  if (input.orgUnitLineageKey) {
    const lin = await client.orgUnitLineage.findUnique({
      where: { lineageKey: input.orgUnitLineageKey },
      select: { lineageKey: true },
    });
    if (!lin) throw new CmsValidationError("Unknown org-unit lineage.");
    return lin.lineageKey;
  }
  if (input.orgUnitId) {
    const u = await client.orgUnit.findUnique({ where: { id: input.orgUnitId }, select: { lineageKey: true } });
    if (!u) throw new CmsValidationError("Unknown org unit.");
    return u.lineageKey;
  }
  if (input.slug) {
    const year = input.academicYearId ?? (await getCurrentYearId(client));
    if (!year) throw new CmsValidationError("No academic year to resolve the unit slug in.");
    const u = await client.orgUnit.findFirst({ where: { academicYearId: year, slug: input.slug }, select: { lineageKey: true } });
    if (!u) throw new CmsValidationError(`No org unit with slug '${input.slug}' in the resolved year.`);
    return u.lineageKey;
  }
  throw new CmsValidationError("An org unit (orgUnitLineageKey, orgUnitId, or slug) is required.");
}

// The scope a membership operation authorizes at: the unit's lineage + the current
// year (so a coordinator scoped to (lineage, current year) or an unscoped grant
// passes; a grant for a different specific year does not — content-scoping parity).
async function manageScope(orgUnitLineageKey, client = prisma) {
  const academicYearId = await getCurrentYearId(client);
  return { orgUnitLineageKey, academicYearId: academicYearId ?? null };
}

async function resolveTargetUser(input = {}, client = prisma) {
  if (input.userId) {
    const u = await client.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, name: true } });
    if (!u) throw new CmsValidationError("Unknown account (userId).");
    return u;
  }
  const email = normalizeEmail(input.email);
  if (!email) throw new CmsValidationError("A userId or a valid email is required.");
  const u = await client.user.findUnique({ where: { email }, select: { id: true, email: true, name: true } });
  if (!u) throw new CmsValidationError(`No account exists for ${email}. Create the account first (M0), then add the membership.`);
  return u;
}

// ── mutations (audited; gated membership.manage SCOPED to the unit's lineage) ──

// Add (or idempotently update) a membership. input: { userId? | email?, one of
// orgUnitLineageKey|orgUnitId|slug, role?, status? }. Upserts by (user, lineage):
// re-adding an existing member updates role/status in place (no duplicate — the DB
// unique backstops it). One semantic audit row.
export async function addMembership(input = {}, actor = {}) {
  const orgUnitLineageKey = await resolveLineage(input);
  const scope = await manageScope(orgUnitLineageKey);
  await assertActorPermission(actor, MANAGE_PERM, scope); // authorize FIRST

  const status = input.status ?? "active";
  if (!MEMBERSHIP_STATUS_SET.has(status)) throw new CmsValidationError("Membership status must be 'active' or 'inactive'.");
  // "role omitted ⇒ leave the existing value" on an update (mirrors the CMS handler's
  // pickScalars + the importer's `?? existing`) — so a status-only re-add via the
  // membership.add action does NOT silently wipe a previously-set role.
  const roleProvided = input.role !== undefined;
  const role = normalizeMembershipRole(input.role);

  const user = await resolveTargetUser(input);
  const existing = await prisma.clubMembership.findUnique({
    where: { userId_orgUnitLineageKey: { userId: user.id, orgUnitLineageKey } },
    include: WITH_USER,
  });

  const update = { status };
  if (roleProvided) update.role = role;
  const { membership } = await auditedMutation(
    actor,
    async (tx) => ({
      membership: await tx.clubMembership.upsert({
        where: { userId_orgUnitLineageKey: { userId: user.id, orgUnitLineageKey } },
        create: { userId: user.id, orgUnitLineageKey, role, status, createdById: actor?.userId ?? null },
        update,
        include: WITH_USER,
      }),
    }),
    ({ membership }) => ({
      action: existing ? "update" : "create",
      entityType: ENTITY,
      entityId: membership.id,
      academicYearId: scope.academicYearId,
      before: existing ? { role: existing.role, status: existing.status } : undefined,
      after: { role: membership.role, status: membership.status },
      summary: `${existing ? "Updated" : "Added"} membership: ${user.email} → unit ${orgUnitLineageKey}`,
    })
  );
  return { membership: shapeMembership(membership), changed: !existing || existing.role !== membership.role || existing.status !== membership.status };
}

// Remove a membership (hard delete — memberships are not historized; the audit row
// records the removal with a before-snapshot). Gated at the membership's lineage scope.
export async function removeMembership(id, actor = {}) {
  const existing = await prisma.clubMembership.findUnique({ where: { id }, include: WITH_USER });
  if (!existing) throw new CmsNotFoundError(`Membership ${id} not found.`);
  const scope = await manageScope(existing.orgUnitLineageKey);
  await assertActorPermission(actor, MANAGE_PERM, scope);

  await auditedMutation(
    actor,
    async (tx) => {
      await tx.clubMembership.delete({ where: { id } });
      return { existing };
    },
    () => ({
      action: "delete",
      entityType: ENTITY,
      entityId: existing.id,
      academicYearId: scope.academicYearId,
      before: { role: existing.role, status: existing.status, userEmail: existing.user?.email },
      summary: `Removed membership: ${existing.user?.email ?? existing.userId} from unit ${existing.orgUnitLineageKey}`,
    })
  );
  return { removed: true, membership: shapeMembership(existing) };
}

// Soft-toggle a membership's status (active | inactive). Gated at its lineage scope.
export async function setMembershipStatus(id, status, actor = {}) {
  if (!MEMBERSHIP_STATUS_SET.has(status)) throw new CmsValidationError("Membership status must be 'active' or 'inactive'.");
  const existing = await prisma.clubMembership.findUnique({ where: { id }, include: WITH_USER });
  if (!existing) throw new CmsNotFoundError(`Membership ${id} not found.`);
  const scope = await manageScope(existing.orgUnitLineageKey);
  await assertActorPermission(actor, MANAGE_PERM, scope);
  if (existing.status === status) return { membership: shapeMembership(existing), changed: false };

  const { membership } = await auditedMutation(
    actor,
    async (tx) => ({
      membership: await tx.clubMembership.update({ where: { id }, data: { status }, include: WITH_USER }),
    }),
    ({ membership }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: membership.id,
      academicYearId: scope.academicYearId,
      before: { status: existing.status },
      after: { status: membership.status },
      summary: `Membership ${membership.user?.email ?? membership.userId} → ${status}`,
    })
  );
  return { membership: shapeMembership(membership), changed: true };
}

// ── reads ──

// Keyset-paginated member roster for one unit (PII — emails/names — so gated on
// membership.manage at the unit's lineage scope). { entries, nextCursor, hasMore }.
export async function listMembershipsForUnit(input = {}, actor = {}) {
  const orgUnitLineageKey = await resolveLineage(input);
  const scope = await manageScope(orgUnitLineageKey);
  await assertActorPermission(actor, MANAGE_PERM, scope);

  const n = Math.min(Math.max(Number(input.take) || 100, 1), 500);
  const where = { orgUnitLineageKey };
  if (input.status) where.status = input.status;
  if (input.cursor) {
    const c = decodeMembershipCursor(input.cursor);
    where.OR = [{ createdAt: { lt: c.createdAt } }, { createdAt: c.createdAt, id: { lt: c.id } }];
  }
  const rows = await prisma.clubMembership.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: n + 1,
    include: WITH_USER,
  });
  const hasMore = rows.length > n;
  const page = hasMore ? rows.slice(0, n) : rows;
  return {
    entries: page.map(shapeMembership),
    nextCursor: hasMore && page.length ? encodeMembershipCursor(page[page.length - 1]) : null,
    hasMore,
  };
}

// A public, NON-PII aggregate — how many ACTIVE members a unit's lineage has (for
// the club page's "Members" stat). No gate; never throws for a caller (returns 0 on
// a bad lineage). `status` defaults to 'active'.
export async function getMembershipCountForUnit(orgUnitLineageKey, { status = "active", client = prisma } = {}) {
  if (!orgUnitLineageKey) return 0;
  return client.clubMembership.count({ where: { orgUnitLineageKey, ...(status ? { status } : {}) } });
}

// A user's OWN memberships (their "My clubs"), each resolved to the current-year
// club's display name/slug/type when the logical unit is published this year. Called
// with the signed-in user's own id (self) — no permission gate (own data). Ordered
// newest-first. Returns [{ id, orgUnitLineageKey, role, status, joinedAt, unit }].
export async function listUserMemberships(userId, { client = prisma } = {}) {
  if (!userId) return [];
  const rows = await client.clubMembership.findMany({
    where: { userId },
    orderBy: { joinedAt: "desc" },
  });
  if (!rows.length) return [];
  const year = await getCurrentYearId(client);
  const lineageKeys = [...new Set(rows.map((r) => r.orgUnitLineageKey))];
  // Resolve each lineage → the current-year published unit (name/slug/type) for display.
  const units = year
    ? await client.orgUnit.findMany({
        where: { lineageKey: { in: lineageKeys }, academicYearId: year, status: "published", archivedAt: null },
        select: { lineageKey: true, name: true, slug: true, orgUnitType: { select: { key: true, name: true } } },
      })
    : [];
  const unitByLineage = new Map(units.map((u) => [u.lineageKey, u]));
  return rows.map((r) => {
    const u = unitByLineage.get(r.orgUnitLineageKey) ?? null;
    return {
      id: r.id,
      orgUnitLineageKey: r.orgUnitLineageKey,
      role: r.role ?? null,
      status: r.status,
      joinedAt: r.joinedAt instanceof Date ? r.joinedAt.toISOString() : r.joinedAt ?? null,
      unit: u ? { name: u.name, slug: u.slug, typeKey: u.orgUnitType?.key ?? null, typeName: u.orgUnitType?.name ?? null } : null,
    };
  });
}

// ── bulk CSV import / SYNC (idempotent by (user, lineage), DL-031) ──
// input: { one of orgUnitLineageKey|orgUnitId|slug, csv, defaultRole?, defaultStatus? }.
// Authorizes membership.manage at the unit's lineage scope ONCE, parses the CSV,
// resolves each email → account (missing accounts are REPORTED, not created — a
// membership needs an existing M0 account), and upserts the mapping. Writes ONE
// semantic summary audit row. Returns { created, updated, missing, failed, summary }.
export async function importClubMemberships(input = {}, actor = {}) {
  const orgUnitLineageKey = await resolveLineage(input);
  const scope = await manageScope(orgUnitLineageKey);
  await assertActorPermission(actor, MANAGE_PERM, scope); // authorize FIRST

  const defaultStatus = input.defaultStatus ?? "active";
  if (!MEMBERSHIP_STATUS_SET.has(defaultStatus)) throw new CmsValidationError("defaultStatus must be 'active' or 'inactive'.");
  const defaultRole = normalizeMembershipRole(input.defaultRole);

  const { rows, errors } = parseMembershipCsv(input.csv ?? "");

  // Prefetch the lineage's existing members so we can distinguish created vs updated.
  const existingRows = await prismaBase.clubMembership.findMany({ where: { orgUnitLineageKey }, select: { userId: true } });
  const existingUserIds = new Set(existingRows.map((r) => r.userId));

  const created = [];
  const updated = [];
  const missing = []; // emails with no account
  const failed = [...errors.map((e) => ({ email: e.email ?? null, reason: `Line ${e.line}: ${e.reason}` }))];

  for (const r of rows) {
    const email = normalizeEmail(r.email);
    if (!email) { failed.push({ email: r.email ?? null, reason: "Invalid email" }); continue; }
    const user = await prismaBase.user.findUnique({ where: { email }, select: { id: true } });
    if (!user) { missing.push({ email }); continue; }
    try {
      await prismaBase.clubMembership.upsert({
        where: { userId_orgUnitLineageKey: { userId: user.id, orgUnitLineageKey } },
        create: { userId: user.id, orgUnitLineageKey, role: r.role ?? defaultRole, status: defaultStatus, createdById: actor?.userId ?? null },
        // Non-destructive re-sync (consolidation review B5): on an EXISTING membership,
        // change the role ONLY when the CSV row explicitly supplies one, and NEVER flip an
        // admin-set status (the batch defaults apply to NEW members via `create` only).
        // Mirrors the addMembership role-preservation fix — a re-import must not wipe a
        // manually-set role or silently reactivate a member an admin had deactivated.
        update: r.role != null ? { role: r.role } : {},
      });
      (existingUserIds.has(user.id) ? updated : created).push(email);
    } catch (e) {
      failed.push({ email, reason: e?.message ?? "Upsert failed" });
    }
  }

  const summary = { created: created.length, updated: updated.length, missing: missing.length, failed: failed.length };
  // ONE semantic audit row for the whole sync (a cross-stakeholder bulk action).
  await recordAudit(prismaBase, {
    actorUserId: actor?.userId ?? null,
    action: "update",
    entityType: ENTITY,
    entityId: null,
    academicYearId: scope.academicYearId,
    after: { orgUnitLineageKey, ...summary },
    summary: `Imported memberships for unit ${orgUnitLineageKey}: +${summary.created}/~${summary.updated} (${summary.missing} missing, ${summary.failed} failed)`,
  }).catch((e) => console.warn("[audit] membership import failed:", e?.message ?? e));

  return { created, updated, missing, failed, summary };
}
