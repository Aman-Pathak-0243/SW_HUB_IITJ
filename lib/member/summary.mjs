// M6 — PURE, dependency-free, CLIENT-SAFE helpers for member profiles & institute
// contribution (DL-090). No DB / no server-only imports, so BOTH the Server-Component
// read layer (lib/member/profile.mjs / contribution.mjs) AND the presentation layer
// import the SAME logic — the DL-051 "one authority, mirrored" rule. Everything here
// operates on the already-shaped, JSON-safe objects the service returns, so the split /
// grouping / totals are unit-tested without a database.

// A member "belongs to a syndicate" only insofar as they hold a membership to a logical
// org unit whose TYPE is a syndicate. The org model (councils/clubs/hostels/messes/
// committee) has no syndicate type today (a syndicate is an event_entity, DL-085), so
// this is a DERIVED, future-proof facet that is empty until such a unit type exists — we
// do NOT introduce a new member↔syndicate table (M6 is read-only over durable ids).
export const SYNDICATE_TYPE_KEY = "syndicate";
const UNCATEGORIZED = "Uncategorized";

const ms = (d) => {
  if (!d) return null;
  const t = new Date(d).getTime();
  return Number.isNaN(t) ? null : t;
};

// Pick the member's syndicate affiliation (the first active membership to a
// syndicate-typed unit), or null. PURE — the service uses it to set profile.syndicate
// and the view can re-derive it identically.
export function pickSyndicate(affiliations = []) {
  const list = Array.isArray(affiliations) ? affiliations : [];
  return list.find((a) => a && a.typeKey === SYNDICATE_TYPE_KEY) ?? null;
}

// Classify one shaped event-involvement row relative to `now`:
//   'upcoming' — a dated event in the future, OR an undated event the member is still
//                actively registered for (a not-yet-scheduled competition they're in);
//   'past'     — a dated event that has happened, OR an undated event with no active
//                registration (the member only has a score/attendance = it occurred).
// PURE. `now` defaults are injected by the caller for testability.
export function classifyEventInvolvement(ev, now = new Date()) {
  if (!ev) return "past";
  const t = ms(ev.eventDate);
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (t != null) return t >= nowMs ? "upcoming" : "past";
  // Undated: upcoming only while the member holds an active (non-cancelled) registration.
  return ev.registration && ev.registration.status ? "upcoming" : "past";
}

// Split a member's flat event-involvement list into { upcoming, past }. Upcoming is
// ordered soonest-first (undated last within upcoming); past is most-recent-first. PURE.
export function splitMemberEvents(events = [], now = new Date()) {
  const upcoming = [];
  const past = [];
  for (const ev of Array.isArray(events) ? events : []) {
    (classifyEventInvolvement(ev, now) === "upcoming" ? upcoming : past).push(ev);
  }
  upcoming.sort((a, b) => {
    const at = ms(a.eventDate);
    const bt = ms(b.eventDate);
    if (at == null && bt == null) return 0;
    if (at == null) return 1; // undated upcoming sinks below dated upcoming
    if (bt == null) return -1;
    return at - bt; // soonest first
  });
  past.sort((a, b) => (ms(b.eventDate) ?? -Infinity) - (ms(a.eventDate) ?? -Infinity));
  return { upcoming, past };
}

// Category-mapped participation: group a member's PARTICIPATED events by the event's
// `category` facet (DL-084) → [{ category, count }], most-frequent first then A→Z. A
// null/blank category folds into "Uncategorized". This is the M6 "category mapping" the
// profile/contribution surfaces render. PURE.
export function categoryBreakdown(events = []) {
  const counts = new Map();
  for (const ev of Array.isArray(events) ? events : []) {
    const cat = ev && ev.category != null && String(ev.category).trim() !== "" ? String(ev.category).trim() : UNCATEGORIZED;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count || a.category.localeCompare(b.category));
}

// A compact participation summary over a member's flat event list. PURE.
export function participationSummary(events = [], now = new Date()) {
  const list = Array.isArray(events) ? events : [];
  const { upcoming, past } = splitMemberEvents(list, now);
  return {
    total: list.length,
    upcoming: upcoming.length,
    past: past.length,
    attended: list.filter((e) => e && e.attended).length,
    scored: list.filter((e) => e && e.points != null).length,
    registered: list.filter((e) => e && e.registration && e.registration.status).length,
  };
}

// Format a parsed institute identity ({ year, level, branch, serial }) into a compact
// display label like "UG · ME · 2023", or null when the email isn't a student address.
// PURE.
export function formatIdentity(identity) {
  if (!identity) return null;
  const level = identity.level ? String(identity.level).toUpperCase() : null;
  const branch = identity.branch ? String(identity.branch).toUpperCase() : null;
  const parts = [level, branch, identity.year].filter((p) => p != null && p !== "");
  return parts.length ? parts.join(" · ") : null;
}

// Roll a shaped contribution object (member / club / entity) into flat totals + a single
// "touchpoints" number (the sum of the stakeholder's counted contributions in the year).
// PURE — the source of the headline numbers on the contribution surfaces.
export function contributionTotals(contribution) {
  const c = contribution ?? {};
  const totals = {
    eventsOrganized: c.eventsOrganized?.count ?? 0,
    eventsParticipated: c.eventsParticipated?.count ?? 0,
    achievements: c.achievements?.count ?? 0,
    members: c.members?.count ?? 0,
    participantsReached: c.participantsReached?.count ?? 0,
    roles: c.roles?.count ?? 0,
  };
  // "Touchpoints" = the stakeholder's direct contribution actions (organizing +
  // participating + achievements + roles). Members-count / participants-reached are
  // reach metrics, not double-counted into the headline.
  totals.touchpoints = totals.eventsOrganized + totals.eventsParticipated + totals.achievements + totals.roles;
  return totals;
}
