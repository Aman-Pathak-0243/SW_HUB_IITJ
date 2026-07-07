// Achievement CONTRIBUTION CREDITS service (M4, DL-081) — the standalone mapping
// crediting an achievement to a MEMBER (app_user) or a CLUB (org_unit_lineage), so a
// member's and a club's contributions are trackable within/across a year (feeds the
// M6 profiles + the per-club Wall-of-Fame slice).
//
// The achievement CONTENT (content_item + content_revision + achievement_payload with
// its hybrid ordered blocks) flows through the ORDINARY CMS service (lib/cms/content.mjs)
// — there is NO parallel content pipeline. This module owns ONLY the relational credits:
//   • authorize FIRST at the achievement's (year) scope, reusing `content.update`
//     (DL-037/082: achievements reuse the CMS permission set — no new permission).
//     Achievements are NOT org-bound, so the scope carries no lineage — a staff/admin/
//     content editor with an unscoped content.update passes; a unit-scoped coordinator
//     grant does NOT (central curation).
//   • ONE semantic audit row per set (a bulk replace writes ONE summary row);
//   • JSON-safe shapes; DB guards (the one-target CHECK, the per-target unique) via
//     mapDbError. AchievementCredit is in AUTO_AUDIT_SKIP (audited semantically here).
import prisma from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { creditTargetKind, normalizeCreditRole } from "./forms.mjs";

const ENTITY = "achievement_credit";
export const ACHIEVEMENT_TYPE = "achievement";

const WITH_USER = { user: { select: { id: true, email: true, name: true } } };

// PURE JSON-safe shape for a credit row (with the joined user, when loaded).
export function shapeCredit(c) {
  if (!c) return null;
  return {
    id: c.id,
    achievementItemId: c.achievementItemId,
    kind: c.userId ? "user" : "club",
    userId: c.userId ?? null,
    userEmail: c.user?.email ?? null,
    userName: c.user?.name ?? null,
    orgUnitLineageKey: c.orgUnitLineageKey ?? null,
    role: c.role ?? null,
    sortOrder: c.sortOrder ?? 0,
  };
}

// Load an achievement content_item → its (year) scope for authorization. Rejects a
// non-achievement item so this service can never mutate credits against another type.
async function loadAchievementOrThrow(itemId, client = prisma) {
  if (!itemId) throw new CmsValidationError("An achievement item id is required.");
  const item = await client.contentItem.findUnique({
    where: { id: itemId },
    select: { id: true, contentType: true, academicYearId: true },
  });
  if (!item) throw new CmsNotFoundError(`Achievement ${itemId} not found.`);
  if (item.contentType !== ACHIEVEMENT_TYPE) {
    throw new CmsValidationError(`Content item ${itemId} is not an achievement.`);
  }
  return item;
}

// Resolve one credit descriptor → { userId, orgUnitLineageKey } (exactly one set).
// Emails resolve to an EXISTING account (missing → 422, never auto-created, like
// memberships); a club resolves by lineage key (must exist). Org units + accounts are
// looked up post-authorize (the caller has already passed the content.update gate).
async function resolveCreditTarget(input, client) {
  const kind = creditTargetKind(input); // throws on both / neither (DL-081)
  if (kind === "user") {
    if (input.userId) {
      const u = await client.user.findUnique({ where: { id: input.userId }, select: { id: true } });
      if (!u) throw new CmsValidationError("Unknown account (userId).");
      return { userId: u.id, orgUnitLineageKey: null };
    }
    const email = normalizeEmail(input.email);
    if (!email) throw new CmsValidationError("A valid email is required to credit a member.");
    const u = await client.user.findUnique({ where: { email }, select: { id: true } });
    if (!u) throw new CmsValidationError(`No account exists for ${email}. Create the account first (M0), then credit it.`);
    return { userId: u.id, orgUnitLineageKey: null };
  }
  const lin = await client.orgUnitLineage.findUnique({ where: { lineageKey: input.orgUnitLineageKey }, select: { lineageKey: true } });
  if (!lin) throw new CmsValidationError("Unknown org-unit lineage.");
  return { userId: null, orgUnitLineageKey: lin.lineageKey };
}

// REPLACE the full credit set for an achievement (idempotent by target). Authorizes
// content.update at the achievement's year scope FIRST, resolves every target, then
// swaps the credits in ONE transaction and writes ONE semantic audit summary row.
// Each credit is { userId? | email? | orgUnitLineageKey, role?, sortOrder? }.
export async function setAchievementCredits(itemId, credits = [], actor = {}) {
  const item = await loadAchievementOrThrow(itemId);
  await assertActorPermission(actor, "content.update", { academicYearId: item.academicYearId }); // authorize FIRST
  if (!Array.isArray(credits)) throw new CmsValidationError("credits must be an array.");

  // Resolve every target up front (disclosure only AFTER authorize), deduped by target
  // so a duplicate member/club in the input can't trip the per-target unique.
  const seen = new Set();
  const rows = [];
  for (const c of credits) {
    const target = await resolveCreditTarget(c ?? {}, prisma);
    const key = target.userId ? `u:${target.userId}` : `c:${target.orgUnitLineageKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    rows.push({
      achievementItemId: item.id,
      userId: target.userId,
      orgUnitLineageKey: target.orgUnitLineageKey,
      role: normalizeCreditRole(c?.role),
      sortOrder: Number.isFinite(c?.sortOrder) ? Math.trunc(c.sortOrder) : rows.length,
      createdById: actor?.userId ?? null,
    });
  }

  const { credits: saved } = await auditedMutation(
    actor,
    async (tx) => {
      await tx.achievementCredit.deleteMany({ where: { achievementItemId: item.id } });
      if (rows.length) await tx.achievementCredit.createMany({ data: rows });
      const saved = await tx.achievementCredit.findMany({
        where: { achievementItemId: item.id },
        orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
        include: WITH_USER,
      });
      return { credits: saved };
    },
    ({ credits: saved }) => ({
      action: "update",
      entityType: ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      after: {
        achievementItemId: item.id,
        count: saved.length,
        users: saved.filter((c) => c.userId).length,
        clubs: saved.filter((c) => c.orgUnitLineageKey).length,
      },
      summary: `Set ${saved.length} contribution credit(s) on achievement ${item.id}`,
    })
  );
  return { credits: saved.map(shapeCredit) };
}

// Read an achievement's credits, ordered (sortOrder, then created). Public display
// data (the credited members/clubs appear on the public Wall of Fame), so it is an
// UNGATED read reused by both the public read layer and the admin editor.
export async function listCreditsForAchievement(itemId, { client = prisma } = {}) {
  if (!itemId) return [];
  const rows = await client.achievementCredit.findMany({
    where: { achievementItemId: itemId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: WITH_USER,
  });
  return rows.map(shapeCredit);
}
