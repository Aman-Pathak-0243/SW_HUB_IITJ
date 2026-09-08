// Static (no-DB) tests for the Session-5 organization model: the PURE
// normalization helpers, the V1 dataset → import-plan transform, and the
// cross-module invariants the importer relies on (every plan position key is a
// seeded position; every profile content type has a CMS handler). Runs under the
// default `npm test` with no database.
import { describe, it, expect } from "vitest";
import {
  slugify,
  cleanName,
  personKey,
  inferPersonType,
  classifyMedia,
  mediaKey,
  mealType,
  parseClock,
  parseTimingRange,
  buildMealTimings,
  parseCapacity,
  coordinatorPositionKey,
  appointmentKey,
  toTimeDate,
  formatTime,
} from "../lib/org/normalize.mjs";
import { buildImportPlan, PLAN_POSITION_KEYS, COUNCILS, HOSTELS, MESSES, MESS_COMMITTEE } from "../lib/org/data/index.mjs";
import { POSITIONS } from "../lib/org/structure.mjs";
import { PROFILE_TYPE_BY_UNIT_TYPE } from "../lib/org/public.mjs";
import { getContentTypeHandler } from "../lib/cms/content-types.mjs";

describe("normalize: slugify", () => {
  it("lowercases, hyphenates, strips punctuation", () => {
    expect(slugify("Nature and Adventure Club")).toBe("nature-and-adventure-club");
    expect(slugify("RE4M Club")).toBe("re4m-club");
    expect(slugify("E-Sports Club")).toBe("e-sports-club");
    expect(slugify("Annapurna Mess (2nd Floor)")).toBe("annapurna-mess-2nd-floor");
  });
  it("expands ampersands and collapses repeats", () => {
    expect(slugify("Arts & Crafts")).toBe("arts-and-crafts");
    expect(slugify("  Spaced   Out  ")).toBe("spaced-out");
  });
});

describe("normalize: people", () => {
  it("cleans whitespace and keys case-insensitively", () => {
    expect(cleanName("  Shivam   Yadav ")).toBe("Shivam Yadav");
    expect(personKey("  Shivam   Yadav ")).toBe(personKey("shivam yadav"));
  });
  it("infers person type from honorific, else falls back", () => {
    expect(inferPersonType("Dr. Sumit Kumar Pandey")).toBe("faculty");
    expect(inferPersonType("Prof. X")).toBe("faculty");
    expect(inferPersonType("Mr. Ankush Kumar")).toBe("staff");
    expect(inferPersonType("Ms. Pooja Devi")).toBe("staff");
    expect(inferPersonType("Soham Kakkar")).toBe("student"); // default fallback
    expect(inferPersonType("Majid Bashir", "staff")).toBe("staff"); // caretaker fallback
    expect(inferPersonType("Krishna Mohan Gupta", "faculty")).toBe("faculty"); // warden fallback
  });
});

describe("normalize: media classification", () => {
  it("treats absolute URLs as external and /public paths as local", () => {
    expect(classifyMedia("https://res.cloudinary.com/x/a.jpg")).toEqual({ storageProvider: "external", url: "https://res.cloudinary.com/x/a.jpg", originalPath: null, kind: "image" });
    expect(classifyMedia("/coding.jpg")).toEqual({ storageProvider: "local", url: "/coding.jpg", originalPath: "/coding.jpg", kind: "image" });
    expect(classifyMedia("logo.png").originalPath).toBe("/logo.png"); // bare → rooted
    expect(classifyMedia("/x.pdf").kind).toBe("pdf");
    expect(classifyMedia("")).toBeNull();
    expect(classifyMedia(null)).toBeNull();
  });
  it("dedup key prefers the local path, else the url", () => {
    expect(mediaKey(classifyMedia("/coding.jpg"))).toBe("/coding.jpg");
    expect(mediaKey(classifyMedia("https://x/a.jpg"))).toBe("https://x/a.jpg");
    expect(mediaKey(null)).toBeNull();
  });
});

describe("normalize: meal timings", () => {
  it("parses 12h clocks to canonical 24h", () => {
    expect(parseClock("7:20 AM")).toBe("07:20:00");
    expect(parseClock("12:20 PM")).toBe("12:20:00");
    expect(parseClock("5:30 PM")).toBe("17:30:00");
    expect(parseClock("12:00 AM")).toBe("00:00:00");
    expect(parseClock("nonsense")).toBeNull();
  });
  it("parses a range and flags midnight-wrapping windows", () => {
    expect(parseTimingRange("7:20 AM – 9:20 AM")).toEqual({ startTime: "07:20:00", endTime: "09:20:00", wrapsMidnight: false });
    expect(parseTimingRange("10:00 PM - 1:00 AM").wrapsMidnight).toBe(true);
    expect(parseTimingRange("garbage")).toBeNull();
  });
  it("maps labels and builds an ordered list", () => {
    expect(mealType("Evening Snacks")).toBe("snacks");
    expect(mealType("Breakfast")).toBe("breakfast");
    expect(mealType("Brunch")).toBeNull();
    const list = buildMealTimings([
      { label: "Breakfast", time: "7:20 AM – 9:20 AM" },
      { label: "Bogus", time: "x" },
      { label: "Dinner", time: "7:30 PM – 9:30 PM" },
    ]);
    expect(list).toHaveLength(2);
    expect(list[0]).toMatchObject({ meal: "breakfast", sortOrder: 0 });
    expect(list[1]).toMatchObject({ meal: "dinner", sortOrder: 1 });
  });
  it("converts to/from the Prisma @db.Time Date shape", () => {
    const d = toTimeDate("07:20:00");
    expect(d).toBeInstanceOf(Date);
    expect(d.getUTCHours()).toBe(7);
    expect(d.getUTCMinutes()).toBe(20);
    expect(toTimeDate("bad")).toBeNull();
    expect(formatTime(d)).toBe("07:20");
    expect(formatTime("17:30:00")).toBe("17:30");
    expect(formatTime(null)).toBe("");
  });
});

describe("normalize: misc", () => {
  it("parses capacity integers and rejects negatives/garbage", () => {
    expect(parseCapacity("360 students")).toBe(360);
    expect(parseCapacity("470")).toBe(470);
    expect(parseCapacity("none")).toBeNull();
    expect(parseCapacity("-5")).toBeNull();
  });
  it("maps coordinator role text to a position key", () => {
    expect(coordinatorPositionKey("Co-Coordinator")).toBe("co_coordinator");
    expect(coordinatorPositionKey("Coordinator")).toBe("coordinator");
    expect(coordinatorPositionKey(undefined)).toBe("coordinator");
  });
  it("builds a stable appointment dedup key", () => {
    expect(appointmentKey("u", "p", "x")).toBe("u:p:x");
  });
});

describe("import plan: shape & integrity", () => {
  const plan = buildImportPlan();
  const allClubs = plan.councils.flatMap((c) => c.clubs);

  it("has 5 councils and 33 clubs (6+0+9+13+5) — AY 2026-27 adds Sangam, Hockey and Squash", () => {
    expect(plan.councils).toHaveLength(5);
    expect(allClubs).toHaveLength(33);
    expect(plan.councils.map((c) => c.clubs.length)).toEqual([6, 0, 9, 13, 5]);
    // The Academic Council runs no clubs — its five technical clubs sit under the
    // Technical Council, with the Technical Secretary who is listed over them.
    expect(plan.councils.find((c) => c.key === "academic").clubs).toHaveLength(0);
    expect(plan.councils.find((c) => c.key === "technical").clubs.map((c) => c.name)).toEqual([
      "Coding Club", "SAE Club", "Robo-sapiens Club", "Astriaza Club", "FinTech Club",
    ]);
    // Clubs chartered for 2026-27 (notification paras 6 + the Sports coordinator list).
    expect(allClubs.map((c) => c.name)).toEqual(expect.arrayContaining(["Sangam (Media) Club", "Hockey Club", "Squash Club"]));
  });

  it("has 6 hostels and 5 messes", () => {
    expect(plan.hostels).toHaveLength(6);
    expect(plan.messes).toHaveLength(5);
    expect(HOSTELS).toHaveLength(6);
    expect(MESSES).toHaveLength(5);
  });

  it("gives every council its own 2026-27 secretary", () => {
    // council_secretary is a singleton per council, so the Academic Secretary and the
    // Technical Secretary must sit on DIFFERENT councils.
    const academic = plan.councils.find((c) => c.key === "academic");
    const technical = plan.councils.find((c) => c.key === "technical");
    expect(academic.secretary.titleOverride).toBe("Academic Secretary (UG)");
    expect(technical.secretary.titleOverride).toBe("Technical Secretary");
    expect(plan.councils.every((c) => c.secretary)).toBe(true);
    expect(academic.secretary.name).not.toBe(technical.secretary.name);
    // every council secretary title is distinct — no post is claimed twice
    const titles = plan.councils.map((c) => c.secretary?.titleOverride).filter(Boolean);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it("plans a PIC and a club_associate for each of the 20 notified clubs", () => {
    // Notification IITJMU/SW/11-17/2/2026/187 names a PIC + associate for 20 clubs;
    // every one of them is a non-sports club, so exactly those carry both.
    const withAssociates = allClubs.filter((c) => c.associates.length > 0);
    expect(withAssociates).toHaveLength(20);
    expect(withAssociates.every((c) => c.associates.every((a) => a.positionKey === "club_associate"))).toBe(true);
    expect(withAssociates.every((c) => c.pic && !/_pic$/.test(c.pic.name))).toBe(true);
    expect(PLAN_POSITION_KEYS).toContain("club_associate");
  });

  it("plans the Sports Council's PG representative", () => {
    const reps = plan.councils.flatMap((c) => c.representatives);
    expect(reps).toHaveLength(1);
    expect(reps[0]).toMatchObject({ name: "Punit Kumar", positionKey: "pg_representative", titleOverride: "PG Representative" });
    expect(PLAN_POSITION_KEYS).toContain("pg_representative");
  });

  it("gives every mess its own secretary and keeps the committee free of one", () => {
    // 2026-27 assigns the mess secretary posts by AREA, so mess_secretary (a singleton)
    // is held once per mess unit rather than once campus-wide.
    expect(plan.messes.every((m) => m.secretary?.positionKey === "mess_secretary")).toBe(true);
    expect(plan.messCommittee.filter((m) => m.positionKey === "mess_secretary")).toHaveLength(0);
    expect(MESS_COMMITTEE).toHaveLength(16);
  });

  it("leaves no club role empty — an unfilled slot carries a conspicuous placeholder", () => {
    // Every club has at least one coordinator, and every club that HAS a PIC slot
    // fills it; roles the roster sheet did not name use "<Club Name>_pic/_coordinator"
    // markers rather than a stale prior-year person.
    for (const club of allClubs) {
      expect(club.coordinators.length).toBeGreaterThanOrEqual(1);
    }
    const placeholders = allClubs.flatMap((c) => [c.pic, ...c.coordinators]).filter((p) => p && /_(pic|coordinator)$/.test(p.name));
    // A placeholder is a name-only marker: no email, no photo to render.
    expect(placeholders.every((p) => !p.email && !p.photo)).toBe(true);
  });

  it("every org-unit slug is unique across the whole year", () => {
    const slugs = [
      ...plan.councils.map((c) => c.slug),
      ...allClubs.map((c) => c.slug),
      ...plan.hostels.map((h) => h.slug),
      ...plan.messes.map((m) => m.slug),
    ];
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("only references position keys that are seeded", () => {
    const seeded = new Set(POSITIONS.map((p) => p.key));
    for (const k of PLAN_POSITION_KEYS) expect(seeded.has(k)).toBe(true);

    const used = new Set();
    for (const c of plan.councils) {
      if (c.secretary) used.add(c.secretary.positionKey);
      c.representatives.forEach((r) => used.add(r.positionKey));
      for (const club of c.clubs) {
        if (club.pic) used.add(club.pic.positionKey);
        club.coordinators.forEach((co) => used.add(co.positionKey));
        club.associates.forEach((a) => used.add(a.positionKey));
      }
    }
    plan.hostels.forEach((h) => h.roles.forEach((r) => used.add(r.positionKey)));
    plan.messes.forEach((m) => m.secretary && used.add(m.secretary.positionKey));
    plan.messCommittee.forEach((m) => used.add(m.positionKey));
    for (const k of used) expect(seeded.has(k)).toBe(true);
  });

  it("mess meal timings parse to 4 valid, non-wrapping windows", () => {
    const timings = plan.messes[0].mealTimings;
    expect(timings).toHaveLength(4);
    expect(timings.map((t) => t.meal)).toEqual(["breakfast", "lunch", "snacks", "dinner"]);
    timings.forEach((t) => {
      expect(t.wrapsMidnight).toBe(false);
      expect(t.endTime > t.startTime).toBe(true);
    });
    expect(plan.messes.every((m) => m.capacity > 0)).toBe(true);
  });

  it("Sports clubs carry coordinators but no PIC", () => {
    // Neither V1 nor the 2026-27 PIC notification appoints a PIC for a sports club.
    const sports = plan.councils.find((c) => c.key === "sports");
    expect(sports.clubs.every((c) => c.pic === null)).toBe(true);
    expect(sports.clubs.every((c) => c.coordinators.length >= 1)).toBe(true);
    // Several are split by team, which the appointment title records.
    const titles = sports.clubs.flatMap((c) => c.coordinators.map((x) => x.titleOverride)).filter(Boolean);
    expect(titles).toEqual(expect.arrayContaining(["Coordinator (Boys)", "Coordinator (Girls)"]));
  });
});

describe("public: profile-type mapping has CMS handlers", () => {
  it("every org-unit-type profile content type is handled", () => {
    for (const ct of Object.values(PROFILE_TYPE_BY_UNIT_TYPE)) {
      expect(getContentTypeHandler(ct)).toBeTruthy();
    }
  });
});
