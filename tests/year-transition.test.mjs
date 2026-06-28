// PURE unit tests for the Transition Wizard's planning helpers — the idempotence
// and parent-remap logic — exercised without a database. The DB-backed behavior
// (real copies, the one-completed-per-pair unique, lock_guard) is covered by
// tests/year.db.test.mjs.
import { describe, it, expect } from "vitest";
import {
  partitionByExisting,
  indexByLineage,
  resolveTargetParentId,
  pickSourceRevision,
} from "../lib/year/transition.mjs";

describe("partitionByExisting (idempotence primitive)", () => {
  it("splits rows into copy vs skip by the existing-key set", () => {
    const rows = [{ k: "a" }, { k: "b" }, { k: "c" }];
    const { toCopy, toSkip } = partitionByExisting(rows, new Set(["b"]), (r) => r.k);
    expect(toCopy.map((r) => r.k)).toEqual(["a", "c"]);
    expect(toSkip.map((r) => r.k)).toEqual(["b"]);
  });

  it("accepts an array of keys (coerced to a Set)", () => {
    const rows = [{ k: "x" }, { k: "y" }];
    const { toCopy, toSkip } = partitionByExisting(rows, ["x"], (r) => r.k);
    expect(toCopy.map((r) => r.k)).toEqual(["y"]);
    expect(toSkip.map((r) => r.k)).toEqual(["x"]);
  });

  it("copies everything on a first run (no existing keys) and nothing on a full re-run", () => {
    const rows = [{ k: "a" }, { k: "b" }];
    const first = partitionByExisting(rows, new Set(), (r) => r.k);
    expect(first.toCopy).toHaveLength(2);
    const rerun = partitionByExisting(rows, new Set(["a", "b"]), (r) => r.k);
    expect(rerun.toCopy).toHaveLength(0);
    expect(rerun.toSkip).toHaveLength(2);
  });
});

describe("indexByLineage", () => {
  it("maps lineage_key → unit, last write wins on duplicates", () => {
    const map = indexByLineage([
      { id: "u1", lineageKey: "L1" },
      { id: "u2", lineageKey: "L2" },
    ]);
    expect(map.get("L1").id).toBe("u1");
    expect(map.get("L2").id).toBe("u2");
    expect(map.get("missing")).toBeUndefined();
  });
});

describe("resolveTargetParentId (parent remap across years)", () => {
  const sourceUnits = [
    { id: "s-council", lineageKey: "L-council", parentId: null },
    { id: "s-club", lineageKey: "L-club", parentId: "s-council" },
    { id: "s-orphan", lineageKey: "L-orphan", parentId: "s-gone" },
  ];
  const sourceById = new Map(sourceUnits.map((u) => [u.id, u]));
  const lineageToTarget = indexByLineage([
    { id: "t-council", lineageKey: "L-council" },
    { id: "t-club", lineageKey: "L-club" },
    { id: "t-orphan", lineageKey: "L-orphan" },
  ]);

  it("returns null for a root unit (no source parent)", () => {
    expect(resolveTargetParentId(sourceUnits[0], sourceById, lineageToTarget)).toBeNull();
  });

  it("remaps a child's parent to the target unit sharing the source parent's lineage", () => {
    expect(resolveTargetParentId(sourceUnits[1], sourceById, lineageToTarget)).toBe("t-council");
  });

  it("returns null when the source parent was not copied (becomes a target root)", () => {
    expect(resolveTargetParentId(sourceUnits[2], sourceById, lineageToTarget)).toBeNull();
  });
});

describe("pickSourceRevision (which revision to clone)", () => {
  const revs = [
    { id: "r1", revisionNo: 1 },
    { id: "r2", revisionNo: 2 },
    { id: "r3", revisionNo: 3 },
  ];

  it("prefers the live published revision when set", () => {
    const item = { publishedRevisionId: "r2" };
    expect(pickSourceRevision(item, revs).id).toBe("r2");
  });

  it("falls back to the highest revision number when nothing is published", () => {
    const item = { publishedRevisionId: null };
    expect(pickSourceRevision(item, revs).id).toBe("r3");
  });

  it("falls back to the latest when the published pointer is stale/missing from the set", () => {
    const item = { publishedRevisionId: "gone" };
    expect(pickSourceRevision(item, revs).id).toBe("r3");
  });

  it("returns null when the item has no revisions", () => {
    expect(pickSourceRevision({ publishedRevisionId: null }, [])).toBeNull();
  });

  it("clones the only revision when an item is draft-only (never published)", () => {
    const item = { publishedRevisionId: null };
    expect(pickSourceRevision(item, [{ id: "d1", revisionNo: 1 }]).id).toBe("d1");
  });

  it("keeps the accumulator on a revisionNo tie (deterministic)", () => {
    const item = { publishedRevisionId: null };
    const tied = [{ id: "a", revisionNo: 5 }, { id: "b", revisionNo: 5 }];
    expect(pickSourceRevision(item, tied).id).toBe("a");
  });
});
