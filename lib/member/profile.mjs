// M6 — MEMBER PROFILE read layer (DL-090). SERVER-ONLY (imports prisma). Aggregates a
// member's identity + roles/category + affiliations (+ derived syndicate) + full event
// involvement (participated / registered / upcoming, category-mapped) + their credited
// achievements into ONE JSON-safe shape the profile surfaces render.
//
// M6 is READ-ONLY over the DURABLE ids M4/M5 already store (no new table, no new
// permission, no mutation — DL-090). It reuses the M4/M5 read layers where they fit
// (listMemberAchievements) and adds only the cross-event aggregation a profile needs.
//
// GATING is at the SURFACE (like every M4/M5 read): the self page calls requireMember()
// then getMemberProfile(member.id) (own data); the admin page gates the Users module on
// `user.read` then calls getMemberProfile(anyUserId). These functions take a userId and
// never bypass anything — they just read.
//
// PERFORMANCE (Neon per-round-trip latency): every list is BATCHED. Event involvement is
// three parallel fetches (registrations / the member's scores / attendance) → ONE union
// of event ids → the events + their payloads in parallel → ONE more fetch of all scores
// for the scored events to compute the member's overall RANK. Never a per-event loop.
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { userEmailIdentity } from "../users/search.mjs";
import { rankEntries } from "../events/forms.mjs";
import { listMemberAchievements } from "../achievements/public.mjs";
import { getMemberContribution } from "./contribution.mjs";
import { pickSyndicate } from "./summary.mjs";

const iso = (d) => (d instanceof Date ? d.toISOString() : d ?? null);

// The member's ACTIVE role assignments = their "roles / category" (DL-063: a category IS
// a role). Scoped grants (coordinator→club, secretary→council) resolve the scope unit's
// current-year display name. Batched: one assignment fetch + one unit-name fetch + one
// year-label fetch.
async function getMemberRoles(client, userId, currentYearId) {
  const rows = await client.roleAssignment.findMany({
    where: { userId, revokedAt: null, role: { status: "active" } },
    select: {
      id: true,
      orgUnitLineageKey: true,
      academicYearId: true,
      role: { select: { key: true, name: true, grantsAll: true } },
    },
    orderBy: { grantedAt: "desc" },
  });
  if (!rows.length) return [];

  const lineageKeys = [...new Set(rows.map((r) => r.orgUnitLineageKey).filter(Boolean))];
  const yearIds = [...new Set(rows.map((r) => r.academicYearId).filter(Boolean))];
  const [units, years] = await Promise.all([
    lineageKeys.length && currentYearId
      ? client.orgUnit.findMany({
          where: { lineageKey: { in: lineageKeys }, academicYearId: currentYearId, status: "published", archivedAt: null },
          select: { lineageKey: true, name: true, slug: true, orgUnitType: { select: { key: true } } },
        })
      : [],
    yearIds.length ? client.academicYear.findMany({ where: { id: { in: yearIds } }, select: { id: true, label: true } }) : [],
  ]);
  const unitByLineage = new Map(units.map((u) => [u.lineageKey, u]));
  const labelByYear = new Map(years.map((y) => [y.id, y.label]));

  return rows.map((r) => {
    const unit = r.orgUnitLineageKey ? unitByLineage.get(r.orgUnitLineageKey) ?? null : null;
    return {
      assignmentId: r.id,
      key: r.role?.key ?? null,
      name: r.role?.name ?? null,
      grantsAll: !!r.role?.grantsAll,
      scope: {
        orgUnitLineageKey: r.orgUnitLineageKey ?? null,
        unitName: unit?.name ?? null,
        unitSlug: unit?.slug ?? null,
        unitTypeKey: unit?.orgUnitType?.key ?? null,
        academicYearId: r.academicYearId ?? null,
        academicYearLabel: r.academicYearId ? labelByYear.get(r.academicYearId) ?? null : null,
      },
    };
  });
}

// The member's club/society/chapter affiliations (club_membership) resolved to the
// current-year unit display name. Durable across years (lineage-keyed). Newest first.
// Batched: one membership fetch + one unit-name fetch.
async function getMemberAffiliations(client, userId, currentYearId) {
  const rows = await client.clubMembership.findMany({ where: { userId }, orderBy: { joinedAt: "desc" } });
  if (!rows.length) return [];
  const lineageKeys = [...new Set(rows.map((r) => r.orgUnitLineageKey))];
  const units = currentYearId
    ? await client.orgUnit.findMany({
        where: { lineageKey: { in: lineageKeys }, academicYearId: currentYearId, status: "published", archivedAt: null },
        select: { lineageKey: true, name: true, slug: true, orgUnitType: { select: { key: true, name: true } } },
      })
    : [];
  const unitByLineage = new Map(units.map((u) => [u.lineageKey, u]));
  return rows.map((r) => {
    const u = unitByLineage.get(r.orgUnitLineageKey) ?? null;
    return {
      orgUnitLineageKey: r.orgUnitLineageKey,
      name: u?.name ?? null,
      slug: u?.slug ?? null,
      typeKey: u?.orgUnitType?.key ?? null,
      typeName: u?.orgUnitType?.name ?? null,
      role: r.role ?? null,
      status: r.status,
      joinedAt: iso(r.joinedAt),
    };
  });
}

// A member's full EVENT INVOLVEMENT (participated / registered / upcoming), category-
// mapped, with their own points + overall rank + attendance per event. `yearId` (when
// given) scopes to that academic year's events; null = all-time involvement (durable —
// registrations/scores/attendance key on the durable event content_item). Batched.
export async function getMemberEventHistory(userId, { yearId = null, client = prisma } = {}) {
  if (!userId) return [];
  const [regs, myScores, atts] = await Promise.all([
    client.eventRegistration.findMany({
      where: { userId, status: { not: "cancelled" } },
      select: { eventItemId: true, status: true, teamName: true, registeredAt: true },
    }),
    client.eventScore.findMany({ where: { userId }, select: { eventItemId: true, points: true } }),
    client.eventAttendance.findMany({ where: { userId, present: true }, select: { eventItemId: true } }),
  ]);

  const regByEvent = new Map(regs.map((r) => [r.eventItemId, r]));
  const myPointsByEvent = new Map();
  for (const s of myScores) myPointsByEvent.set(s.eventItemId, (myPointsByEvent.get(s.eventItemId) ?? 0) + (s.points ?? 0));
  const attendedEvents = new Set(atts.map((a) => a.eventItemId));

  const eventIds = [...new Set([...regByEvent.keys(), ...myPointsByEvent.keys(), ...attendedEvents])];
  if (!eventIds.length) return [];

  const items = await client.contentItem.findMany({
    where: { id: { in: eventIds }, contentType: "event", ...(yearId ? { academicYearId: yearId } : {}) },
    select: { id: true, slug: true, status: true, academicYearId: true, publishedAt: true, publishedRevisionId: true },
  });
  if (!items.length) return [];
  const revIds = [...new Set(items.map((i) => i.publishedRevisionId).filter(Boolean))];
  const scoredEventIds = [...new Set([...myPointsByEvent.keys()].filter((id) => items.some((i) => i.id === id)))];

  const [revs, payloads, allScores] = await Promise.all([
    revIds.length ? client.contentRevision.findMany({ where: { id: { in: revIds } }, select: { id: true, title: true } }) : [],
    revIds.length ? client.eventPayload.findMany({ where: { revisionId: { in: revIds } }, select: { revisionId: true, category: true, eventDate: true } }) : [],
    // ONE fetch of every score across the events the member scored in → compute their
    // OVERALL rank per event in memory via the pure rankEntries (no per-event query).
    scoredEventIds.length ? client.eventScore.findMany({ where: { eventItemId: { in: scoredEventIds } }, select: { eventItemId: true, userId: true, points: true } }) : [],
  ]);
  const titleByRev = new Map(revs.map((r) => [r.id, r.title]));
  const payloadByRev = new Map(payloads.map((p) => [p.revisionId, p]));

  // Overall rank per scored event: sum each user's points in the event, rank, look up the
  // member. rankEntries needs a stable id for its tiebreak (kept internal, never returned).
  const sumsByEvent = new Map();
  for (const s of allScores) {
    let m = sumsByEvent.get(s.eventItemId);
    if (!m) { m = new Map(); sumsByEvent.set(s.eventItemId, m); }
    m.set(s.userId, (m.get(s.userId) ?? 0) + (s.points ?? 0));
  }
  const myRankByEvent = new Map();
  for (const [eid, m] of sumsByEvent) {
    const ranked = rankEntries([...m.entries()].map(([uid, points]) => ({ userId: uid, name: null, points })));
    const mine = ranked.find((e) => e.userId === userId);
    if (mine) myRankByEvent.set(eid, mine.rank);
  }

  const events = items.map((item) => {
    const reg = regByEvent.get(item.id) ?? null;
    const payload = item.publishedRevisionId ? payloadByRev.get(item.publishedRevisionId) ?? null : null;
    const scored = myPointsByEvent.has(item.id);
    return {
      eventItemId: item.id,
      slug: item.slug ?? null,
      title: item.publishedRevisionId ? titleByRev.get(item.publishedRevisionId) ?? null : null,
      category: payload?.category ?? null,
      eventDate: iso(payload?.eventDate),
      academicYearId: item.academicYearId,
      published: item.status === "published",
      registration: reg ? { status: reg.status, teamName: reg.teamName ?? null, registeredAt: iso(reg.registeredAt) } : null,
      attended: attendedEvents.has(item.id),
      points: scored ? myPointsByEvent.get(item.id) : null,
      rank: myRankByEvent.get(item.id) ?? null,
    };
  });
  // Most-recent-first by event date (undated last); the pure splitMemberEvents re-orders
  // upcoming vs past at the view layer.
  events.sort((a, b) => (b.eventDate ? new Date(b.eventDate).getTime() : -Infinity) - (a.eventDate ? new Date(a.eventDate).getTime() : -Infinity));
  return events;
}

// THE member profile. `userId` is the account to profile (own id for self, any id for an
// admin with user.read). `yearId` scopes achievements + (optionally) events; achievements
// are inherently the resolved year (M4 visibility). Events default to ALL-TIME (durable)
// unless `scopeEventsToYear` is set. Returns null if the account doesn't exist.
// `_achievements` (internal): a pre-fetched achievements list injected by
// getMemberProfileView so the heavy listMemberAchievements hydrate runs ONCE per page
// (review — the profile + contribution calls otherwise re-ran it); undefined = fetch here.
export async function getMemberProfile(userId, { yearId, scopeEventsToYear = false, client = prisma, _achievements } = {}) {
  if (!userId) return null;
  const account = await client.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, status: true, isDeveloper: true, allowNormalView: true, lastLoginAt: true, createdAt: true },
  });
  if (!account) return null;

  const year = yearId ?? (await getCurrentYearId(client));
  const [roles, affiliations, events, achievements] = await Promise.all([
    getMemberRoles(client, userId, year),
    getMemberAffiliations(client, userId, year),
    getMemberEventHistory(userId, { yearId: scopeEventsToYear ? year : null, client }),
    _achievements ?? listMemberAchievements(userId, { yearId: year, client }),
  ]);

  return {
    member: {
      id: account.id,
      email: account.email,
      name: account.name,
      status: account.status,
      isDeveloper: !!account.isDeveloper,
      allowNormalView: account.allowNormalView !== false,
      identity: userEmailIdentity(account) ?? null,
      lastLoginAt: iso(account.lastLoginAt),
      memberSince: iso(account.createdAt),
    },
    roles,
    affiliations,
    syndicate: pickSyndicate(affiliations),
    events,
    achievements,
    yearId: year ?? null,
  };
}

// The page-level composite for the profile SURFACES (self /member/profile + admin
// /admin/users/[id]) which show BOTH the profile AND the member's this-year contribution.
// Resolving the current year ONCE and hydrating the (heaviest) achievements read ONCE, then
// injecting both into the two aggregators, avoids the duplicate year + achievements-hydrate
// round-trips the two independent calls otherwise incur (review, Neon-latency discipline).
export async function getMemberProfileView(userId, { client = prisma } = {}) {
  if (!userId) return { profile: null, contribution: null };
  const year = await getCurrentYearId(client);
  const achievements = await listMemberAchievements(userId, { yearId: year, client });
  const [profile, contribution] = await Promise.all([
    getMemberProfile(userId, { yearId: year, client, _achievements: achievements }),
    getMemberContribution(userId, { yearId: year, client, _achievements: achievements }),
  ]);
  return { profile, contribution };
}
