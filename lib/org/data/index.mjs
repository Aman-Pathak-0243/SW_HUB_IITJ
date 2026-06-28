// Org dataset entry point. Re-exports the raw V1 data and exposes ONE pure
// transform — buildImportPlan() — that normalizes it into the importer-ready
// shape (slugs, seeded position keys, parsed mission lists / meal timings /
// capacities). The importer (lib/org/import.mjs) consumes this plan; the static
// test suite (tests/org.test.mjs) asserts its shape (30 clubs, unique slugs,
// known positions, parsed timings) with no database. Keep it PURE.
import { COUNCILS } from "./councils.mjs";
import { HOSTELS, HOSTEL_INFRA_PDF } from "./hostels.mjs";
import { MESSES, MESS_COMMITTEE, MESS_MEAL_TIMINGS, MESS_INFRA_PDF } from "./messes.mjs";
import { slugify, cleanName, coordinatorPositionKey, buildMealTimings, parseCapacity } from "../normalize.mjs";

export { COUNCILS, HOSTELS, MESSES, MESS_COMMITTEE, MESS_MEAL_TIMINGS, HOSTEL_INFRA_PDF, MESS_INFRA_PDF };

// Map one V1 club to a normalized plan node (slug, parsed people + positions).
function planClub(club) {
  const coordinators = (club.coordinators ?? []).map((c) => ({
    name: cleanName(c.name),
    photo: c.photo ?? null,
    role: c.role ?? null,
    positionKey: coordinatorPositionKey(c.role),
  }));
  return {
    name: club.name,
    slug: slugify(club.name),
    instagram: club.instagram ?? null,
    logo: club.logo ?? null,
    vision: club.vision ?? null,
    mission: Array.isArray(club.mission) ? club.mission : [],
    pic: club.pic ? { name: cleanName(club.pic.name), profileUrl: club.pic.profileUrl ?? null, photo: club.pic.photo ?? null, positionKey: "pic" } : null,
    coordinators,
  };
}

// Normalize the whole V1 dataset into the structure the importer walks.
export function buildImportPlan() {
  const councils = COUNCILS.map((c) => ({
    key: c.key,
    name: c.name,
    slug: c.slug,
    secretary: c.secretary
      ? { name: cleanName(c.secretary.name), titleOverride: c.secretary.titleOverride ?? null, photo: c.secretary.photo ?? null, positionKey: "council_secretary" }
      : null,
    clubs: (c.clubs ?? []).map(planClub),
  }));

  const hostels = HOSTELS.map((h) => ({
    name: h.name,
    slug: h.slug,
    image: h.image ?? null,
    officeEmail: h.officeEmail ?? null,
    roles: (h.roles ?? []).map((r) => ({ positionKey: r.position, name: cleanName(r.name), phone: r.phone ?? null, photo: r.photo ?? null })),
  }));

  const mealTimings = buildMealTimings(MESS_MEAL_TIMINGS);
  const messes = MESSES.map((m) => ({
    name: m.name,
    slug: m.slug,
    location: m.location ?? null,
    capacity: parseCapacity(m.capacity),
    image: m.image ?? null,
    mealTimings,
  }));

  const messCommittee = MESS_COMMITTEE.map((c) => ({
    name: cleanName(c.name),
    titleOverride: c.title ?? null,
    positionKey: c.position,
    photo: c.photo ?? null,
  }));

  return { councils, hostels, messes, messCommittee, hostelInfraPdf: HOSTEL_INFRA_PDF, messInfraPdf: MESS_INFRA_PDF };
}

// Every position key the plan can reference — the importer validates these exist
// (and tests assert the plan only uses keys seeded by lib/org/structure.mjs).
export const PLAN_POSITION_KEYS = [
  "council_secretary",
  "pic",
  "coordinator",
  "co_coordinator",
  "warden",
  "wellness_warden",
  "hostel_secretary",
  "caretaker",
  "attendant",
  "mess_secretary",
  "mess_committee_member",
];
