import { describe, it, expect } from "vitest";
import {
  CONTENT_TYPE_DEFS,
  CONTENT_TYPE_HANDLERS,
  getContentTypeHandler,
  getContentTypeDef,
} from "../lib/cms/content-types.mjs";

// ── the generic handler API every content type must expose ──
describe("generic editing layer: handler API completeness", () => {
  it("every content_type_def has a handler with the full read/write/copy API", () => {
    for (const def of CONTENT_TYPE_DEFS) {
      const h = getContentTypeHandler(def.contentType);
      expect(h, `no handler for ${def.contentType}`).toBeTruthy();
      expect(typeof h.writePayload).toBe("function");
      expect(typeof h.readPayload).toBe("function");
      expect(typeof h.copyPayload).toBe("function");
      expect(Array.isArray(h.scalarFields)).toBe(true);
      expect(Array.isArray(h.lists)).toBe(true);
      expect(h.payloadModel).toBeTruthy();
      expect(h.payloadTable).toBe(def.payloadTable);
    }
  });

  it("required fields are declared where the DB column is NOT NULL", () => {
    expect(getContentTypeHandler("announcement").requiredFields).toContain("body");
    expect(getContentTypeHandler("resource").requiredFields).toContain("resourceKind");
    expect(getContentTypeHandler("page_block").requiredFields).toContain("blockKind");
  });

  it("club/council share the club payload; team_page/page_block share page_block", () => {
    expect(getContentTypeDef("council_profile").payloadTable).toBe("club_profile_payload");
    expect(getContentTypeDef("club_profile").payloadTable).toBe("club_profile_payload");
    expect(getContentTypeHandler("team_page").payloadModel).toBe("pageBlockPayload");
    expect(getContentTypeHandler("page_block").payloadModel).toBe("pageBlockPayload");
  });
});

// ── an in-memory fake of the Prisma surface the handlers touch ──
// (upsert / findUnique / findMany / deleteMany / createMany on payload + list
// models). Lets us exercise the generic write/read/copy logic with no DB.
function makeFakeTx() {
  const tables = {};
  const tbl = (name) => (tables[name] ??= []);
  const match = (row, where) => Object.entries(where ?? {}).every(([k, v]) => row[k] === v);
  const model = (name, pk) => ({
    async upsert({ where, create, update }) {
      const rows = tbl(name);
      const i = rows.findIndex((r) => match(r, where));
      if (i >= 0) {
        Object.assign(rows[i], update);
        return rows[i];
      }
      const row = { ...create };
      rows.push(row);
      return row;
    },
    async findUnique({ where }) {
      return tbl(name).find((r) => r[pk] === where[pk]) ?? null;
    },
    async findMany({ where, orderBy }) {
      let res = tbl(name).filter((r) => match(r, where));
      if (orderBy) {
        const [k, dir] = Object.entries(orderBy)[0];
        res = [...res].sort((a, b) => (a[k] > b[k] ? 1 : a[k] < b[k] ? -1 : 0) * (dir === "desc" ? -1 : 1));
      }
      return res;
    },
    async deleteMany({ where }) {
      const rows = tbl(name);
      const before = rows.length;
      tables[name] = rows.filter((r) => !match(r, where));
      return { count: before - tables[name].length };
    },
    async createMany({ data }) {
      for (const d of data) tbl(name).push({ ...d });
      return { count: data.length };
    },
  });
  return {
    tables,
    clubProfilePayload: model("clubProfilePayload", "revisionId"),
    clubMissionPoint: model("clubMissionPoint", "id"),
    eventPayload: model("eventPayload", "revisionId"),
  };
}

describe("generic editing layer: write/read/copy round-trip (fake DB)", () => {
  it("club_profile: writes scalars + replaces the mission-point list, reads back normalized", async () => {
    const tx = makeFakeTx();
    const h = getContentTypeHandler("club_profile");
    await h.writePayload(
      tx,
      "rev-A",
      {
        vision: "Build things",
        instagramUrl: "https://insta/x",
        missionPoints: [{ text: "ship" }, { text: "learn", sortOrder: 5 }],
      },
      { isCreate: true }
    );
    const read = await h.readPayload(tx, "rev-A");
    expect(read.vision).toBe("Build things");
    expect(read.instagramUrl).toBe("https://insta/x");
    expect(read.logoMediaId).toBeNull();
    expect(read.missionPoints).toEqual([
      { text: "ship", sortOrder: 0 },
      { text: "learn", sortOrder: 5 },
    ]);
  });

  it("editing replaces list children wholesale (no leftovers)", async () => {
    const tx = makeFakeTx();
    const h = getContentTypeHandler("club_profile");
    await h.writePayload(tx, "rev-A", { missionPoints: [{ text: "a" }, { text: "b" }] }, { isCreate: true });
    await h.writePayload(tx, "rev-A", { missionPoints: [{ text: "only" }] }, { isCreate: false });
    const read = await h.readPayload(tx, "rev-A");
    expect(read.missionPoints).toEqual([{ text: "only", sortOrder: 0 }]);
  });

  it("omitting a list leaves existing children untouched", async () => {
    const tx = makeFakeTx();
    const h = getContentTypeHandler("club_profile");
    await h.writePayload(tx, "rev-A", { vision: "v1", missionPoints: [{ text: "keep" }] }, { isCreate: true });
    await h.writePayload(tx, "rev-A", { vision: "v2" }, { isCreate: false }); // no missionPoints key
    const read = await h.readPayload(tx, "rev-A");
    expect(read.vision).toBe("v2");
    expect(read.missionPoints).toEqual([{ text: "keep", sortOrder: 0 }]);
  });

  it("copyPayload clones scalars + lists onto a new revision", async () => {
    const tx = makeFakeTx();
    const h = getContentTypeHandler("club_profile");
    await h.writePayload(tx, "rev-A", { vision: "src", missionPoints: [{ text: "m1" }] }, { isCreate: true });
    await h.copyPayload(tx, "rev-A", "rev-B");
    const b = await h.readPayload(tx, "rev-B");
    expect(b.vision).toBe("src");
    expect(b.missionPoints).toEqual([{ text: "m1", sortOrder: 0 }]);
  });

  it("validates required fields only on create (friendly 422)", async () => {
    const tx = makeFakeTx();
    const ann = getContentTypeHandler("announcement");
    // announcement.body is required; fake tx doesn't have announcementPayload but
    // validation throws before any DB call.
    await expect(ann.writePayload(tx, "rev-X", {}, { isCreate: true })).rejects.toMatchObject({ code: "CMS_VALIDATION", status: 422 });
  });

  it("readPayload returns null for a revision with no payload row", async () => {
    const tx = makeFakeTx();
    const h = getContentTypeHandler("event");
    expect(await h.readPayload(tx, "missing")).toBeNull();
  });
});
