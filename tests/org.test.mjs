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

  it("has 5 councils and 30 clubs (6+5+8+11+0) — Technical Council starts empty (copy of Academic)", () => {
    expect(plan.councils).toHaveLength(5);
    expect(allClubs).toHaveLength(30);
    expect(plan.councils.map((c) => c.clubs.length)).toEqual([6, 5, 8, 11, 0]);
  });

  it("has 6 hostels and 5 messes", () => {
    expect(plan.hostels).toHaveLength(6);
    expect(plan.messes).toHaveLength(5);
    expect(HOSTELS).toHaveLength(6);
    expect(MESSES).toHaveLength(5);
  });

  it("uses the V2 'Technical Secretary' title for the Academic council", () => {
    const academic = plan.councils.find((c) => c.key === "academic");
    expect(academic.secretary.titleOverride).toBe("Technical Secretary");
    // and no council still carries the old 'Academic Secretary' label
    expect(plan.councils.some((c) => c.secretary?.titleOverride === "Academic Secretary")).toBe(false);
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
      for (const club of c.clubs) {
        if (club.pic) used.add(club.pic.positionKey);
        club.coordinators.forEach((co) => used.add(co.positionKey));
      }
    }
    plan.hostels.forEach((h) => h.roles.forEach((r) => used.add(r.positionKey)));
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

  it("the mess committee has exactly one singleton mess_secretary", () => {
    const secs = plan.messCommittee.filter((m) => m.positionKey === "mess_secretary");
    expect(secs).toHaveLength(1);
    expect(secs[0].name).toBe("Ujjwal Gupta");
    expect(MESS_COMMITTEE).toHaveLength(17);
  });

  it("Sports clubs carry coordinators but no PIC (faithful to V1)", () => {
    const sports = plan.councils.find((c) => c.key === "sports");
    expect(sports.clubs.every((c) => c.pic === null)).toBe(true);
    expect(sports.clubs.every((c) => c.coordinators.length >= 1)).toBe(true);
  });
});

describe("public: profile-type mapping has CMS handlers", () => {
  it("every org-unit-type profile content type is handled", () => {
    for (const ct of Object.values(PROFILE_TYPE_BY_UNIT_TYPE)) {
      expect(getContentTypeHandler(ct)).toBeTruthy();
    }
  });
});
