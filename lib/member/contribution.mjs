// M6 — per-stakeholder INSTITUTE CONTRIBUTION aggregation across a year (DL-090).
// SERVER-ONLY. Aggregates what a MEMBER / a CLUB / a custom ENTITY contributed in an
// academic year, keyed on the DURABLE ids M4/M5 store:
//   • achievement_credit.userId | orgUnitLineageKey            (M4, DL-081)
//   • event_organizer's three targets (userId | orgUnitLineageKey | entityId) (M5, DL-085)
//   • event_registration.userId / event_score.userId          (M5, DL-087)
// It reuses the M4 read layer (listClubAchievements / listMemberAchievements) + M3
// (getMembershipCountForUnit) and never introduces a new table (M6 is read-only, DL-090).
//
// READS ARE BATCHED + PII-MINIMIZED (Neon latency): the stakeholder's own organizer /
// registration rows are bounded by the stakeholder, so we fetch those first, then resolve
// only the in-year subset of events (+ titles) in ONE query. "Participants reached" is a
// single distinct-count query over the stakeholder's organized events — no member PII
// (a count, not a roster). Gating is at the surface (`user.read` for the admin explorer).
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { listClubAchievements, listMemberAchievements } from "../achievements/public.mjs";
import { getMembershipCountForUnit } from "../memberships/service.mjs";
import { listEventEntities } from "../events/organizers.mjs";
import { normalizeEmail } from "../auth/email.mjs";

// Resolve which of `eventItemIds` are events in `year` → Map(id → { slug, title, status }).
// One content_item fetch (+ one revision fetch for titles), scoped to the year. When
// `year` is null, all event items are in scope (all-time).
async function resolveInYearEvents(client, eventItemIds, year) {
  const ids = [...new Set((eventItemIds ?? []).filter(Boolean))];
  if (!ids.length) return new Map();
  const items = await client.contentItem.findMany({
    where: { id: { in: ids }, contentType: "event", ...(year ? { academicYearId: year } : {}) },
    select: { id: true, slug: true, status: true, publishedRevisionId: true },
  });
  if (!items.length) return new Map();
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];
  const revs = revIds.length ? await client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true } }) : [];
  const titleByRev = new Map(revs.map((r) => [r.id, r.title]));
  return new Map(items.map((i) => [i.id, { slug: i.slug ?? null, title: i.publishedRevisionId ? titleByRev.get(i.publishedRevisionId) ?? null : null, status: i.status }]));
}

// Distinct CONFIRMED participants reached across a set of (in-year) events — a reach
// metric, no PII (a count of distinct userIds). ONE query.
async function countParticipantsReached(client, inYearEventIds) {
  if (!inYearEventIds.length) return 0;
  const rows = await client.eventRegistration.findMany({
    where: { eventItemId: { in: inYearEventIds }, status: "confirmed" },
    select: { userId: true },
    distinct: ["userId"],
  });
  return rows.length;
}

// ── MEMBER contribution ──
// A member's contribution in `year` (defaults to current): events organized/collaborated
// on (tagged directly), events participated in, achievements credited, and roles held.
// `_achievements` (internal): a pre-fetched achievements list injected by
// getMemberProfileView so the heavy hydrate runs ONCE per profile page (review); when
// undefined, this fetches its own.
export async function getMemberContribution(userId, { yearId, client = prisma, _achievements } = {}) {
  if (!userId) return null;
  const year = yearId ?? (await getCurrentYearId(client));
  const account = await client.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true, status: true } });
  if (!account) return null;

  const [orgRows, regRows, roleRows, achievements] = await Promise.all([
    client.eventOrganizer.findMany({ where: { userId }, select: { eventItemId: true, kind: true, role: true } }),
    client.eventRegistration.findMany({ where: { userId, status: { not: "cancelled" } }, select: { eventItemId: true, status: true } }),
    client.roleAssignment.findMany({
      where: { userId, revokedAt: null, role: { status: "active" } },
      select: { orgUnitLineageKey: true, academicYearId: true, role: { select: { key: true, name: true } } },
    }),
    _achievements ?? listMemberAchievements(userId, { yearId: year, client }),
  ]);

  const inYear = await resolveInYearEvents(client, [...orgRows.map((r) => r.eventItemId), ...regRows.map((r) => r.eventItemId)], year);

  const organized = orgRows
    .filter((r) => inYear.has(r.eventItemId))
    .map((r) => ({ eventItemId: r.eventItemId, slug: inYear.get(r.eventItemId).slug, title: inYear.get(r.eventItemId).title, kind: r.kind, role: r.role ?? null }));
  const participated = regRows
    .filter((r) => inYear.has(r.eventItemId))
    .map((r) => ({ eventItemId: r.eventItemId, slug: inYear.get(r.eventItemId).slug, title: inYear.get(r.eventItemId).title, status: r.status }));
  // A role applies to the year iff it is unscoped-by-year (institute-wide) OR scoped to it.
  const roles = roleRows
    .filter((r) => !year || r.academicYearId == null || r.academicYearId === year)
    .map((r) => ({ key: r.role?.key ?? null, name: r.role?.name ?? null, orgUnitLineageKey: r.orgUnitLineageKey ?? null, academicYearId: r.academicYearId ?? null }));

  return {
    kind: "member",
    yearId: year ?? null,
    subject: { userId: account.id, name: account.name, email: account.email, status: account.status },
    eventsOrganized: { count: organized.length, items: organized },
    eventsParticipated: { count: participated.length, items: participated },
    achievements: { count: achievements.length, items: achievements.map((a) => ({ id: a.id, slug: a.slug, title: a.title })) },
    roles: { count: roles.length, items: roles },
  };
}

// ── CLUB contribution ──
// A club's contribution in `year` by its DURABLE lineage: events organized, achievements
// credited (the M4 club slice), current member count, and participants reached.
export async function getClubContribution(orgUnitLineageKey, { yearId, client = prisma } = {}) {
  if (!orgUnitLineageKey) return null;
  const year = yearId ?? (await getCurrentYearId(client));

  const [orgRows, achievements, memberCount, unit] = await Promise.all([
    client.eventOrganizer.findMany({ where: { orgUnitLineageKey }, select: { eventItemId: true, kind: true, role: true } }),
    listClubAchievements(orgUnitLineageKey, { yearId: year, client }),
    getMembershipCountForUnit(orgUnitLineageKey, { client }),
    year
      ? client.orgUnit.findFirst({ where: { lineageKey: orgUnitLineageKey, academicYearId: year, status: "published", archivedAt: null }, select: { name: true, slug: true, orgUnitType: { select: { key: true } } } })
      : null,
  ]);

  const inYear = await resolveInYearEvents(client, orgRows.map((r) => r.eventItemId), year);
  const organized = orgRows
    .filter((r) => inYear.has(r.eventItemId))
    .map((r) => ({ eventItemId: r.eventItemId, slug: inYear.get(r.eventItemId).slug, title: inYear.get(r.eventItemId).title, kind: r.kind, role: r.role ?? null }));
  const participantsReached = await countParticipantsReached(client, organized.map((o) => o.eventItemId));

  return {
    kind: "club",
    yearId: year ?? null,
    subject: { orgUnitLineageKey, name: unit?.name ?? null, slug: unit?.slug ?? null, typeKey: unit?.orgUnitType?.key ?? null },
    eventsOrganized: { count: organized.length, items: organized },
    achievements: { count: achievements.length, items: achievements.map((a) => ({ id: a.id, slug: a.slug, title: a.title })) },
    members: { count: memberCount },
    participantsReached: { count: participantsReached },
  };
}

// ── custom ENTITY contribution ──
// A custom entity's (syndicate / external partner) contribution in `year`: events
// organized + participants reached. Entities carry no memberships/achievements.
export async function getEntityContribution(entityId, { yearId, client = prisma } = {}) {
  if (!entityId) return null;
  const year = yearId ?? (await getCurrentYearId(client));
  const entity = await client.eventEntity.findUnique({ where: { id: entityId }, select: { id: true, name: true, kind: true, status: true } });
  if (!entity) return null;

  const orgRows = await client.eventOrganizer.findMany({ where: { entityId }, select: { eventItemId: true, kind: true, role: true } });
  const inYear = await resolveInYearEvents(client, orgRows.map((r) => r.eventItemId), year);
  const organized = orgRows
    .filter((r) => inYear.has(r.eventItemId))
    .map((r) => ({ eventItemId: r.eventItemId, slug: inYear.get(r.eventItemId).slug, title: inYear.get(r.eventItemId).title, kind: r.kind, role: r.role ?? null }));
  const participantsReached = await countParticipantsReached(client, organized.map((o) => o.eventItemId));

  return {
    kind: "entity",
    yearId: year ?? null,
    subject: { entityId: entity.id, name: entity.name, entityKind: entity.kind ?? null, status: entity.status },
    eventsOrganized: { count: organized.length, items: organized },
    participantsReached: { count: participantsReached },
  };
}

// Picker data for the admin contribution explorer — the current-year published org
// units (durable lineage + display name) + the active custom entities. Ungated
// (public-display names); no member PII. Batched.
export async function listContributionStakeholders({ yearId, client = prisma } = {}) {
  const year = yearId ?? (await getCurrentYearId(client));
  const [units, entities] = await Promise.all([
    year
      ? client.orgUnit.findMany({
          where: { academicYearId: year, status: "published", archivedAt: null },
          select: { lineageKey: true, name: true, orgUnitType: { select: { key: true } } },
          orderBy: { name: "asc" },
        })
      : [],
    listEventEntities({ status: "active", client }),
  ]);
  return {
    clubs: units.map((u) => ({ orgUnitLineageKey: u.lineageKey, name: u.name, typeKey: u.orgUnitType?.key ?? null })),
    entities: entities.map((e) => ({ id: e.id, name: e.name, kind: e.kind ?? null })),
  };
}

// Dispatcher for the admin contribution explorer. `input`: { kind:'member'|'club'|'entity',
// userId? | email? | orgUnitLineageKey? | entityId?, yearId? }. Resolves a member by email
// when only an email is given. Returns null when the subject can't be resolved.
export async function getStakeholderContribution(input = {}, { client = prisma } = {}) {
  const { kind, yearId } = input;
  if (kind === "club") return getClubContribution(input.orgUnitLineageKey, { yearId, client });
  if (kind === "entity") return getEntityContribution(input.entityId, { yearId, client });
  // default: member
  let userId = input.userId ?? null;
  if (!userId && input.email) {
    const email = normalizeEmail(input.email);
    const u = email ? await client.user.findUnique({ where: { email }, select: { id: true } }) : null;
    userId = u?.id ?? null;
  }
  if (!userId) return null;
  return getMemberContribution(userId, { yearId, client });
}
