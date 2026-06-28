import { describe, it, expect } from "vitest";
import {
  CONTENT_TYPE_DEFS,
  CONTENT_TYPE_HANDLERS,
  getContentTypeHandler,
} from "../lib/cms/content-types.mjs";

// The payload tables that actually exist as Prisma models / DB tables.
const VALID_PAYLOAD_TABLES = new Set([
  "club_profile_payload",
  "hostel_profile_payload",
  "mess_profile_payload",
  "event_payload",
  "announcement_payload",
  "flagship_event_payload",
  "resource_payload",
  "page_block_payload",
]);

describe("content-type registry ↔ handler map (the 'every type has a handler' guarantee)", () => {
  it("every content_type_def row has a routing handler", () => {
    for (const def of CONTENT_TYPE_DEFS) {
      const handler = getContentTypeHandler(def.contentType);
      expect(handler, `no handler for content_type '${def.contentType}'`).toBeTruthy();
    }
  });

  it("every handler maps to a real payload table that matches its def", () => {
    const defByType = new Map(CONTENT_TYPE_DEFS.map((d) => [d.contentType, d]));
    for (const [type, handler] of Object.entries(CONTENT_TYPE_HANDLERS)) {
      expect(VALID_PAYLOAD_TABLES.has(handler.payloadTable), `bad payload table for ${type}`).toBe(true);
      const def = defByType.get(type);
      expect(def, `handler '${type}' has no content_type_def row`).toBeTruthy();
      expect(handler.payloadTable).toBe(def.payloadTable);
    }
  });

  it("def and handler key sets are identical (no orphans either way)", () => {
    const defTypes = new Set(CONTENT_TYPE_DEFS.map((d) => d.contentType));
    const handlerTypes = new Set(Object.keys(CONTENT_TYPE_HANDLERS));
    expect([...defTypes].sort()).toEqual([...handlerTypes].sort());
  });

  it("content_type keys are unique and payload_table is always set", () => {
    const types = CONTENT_TYPE_DEFS.map((d) => d.contentType);
    expect(new Set(types).size).toBe(types.length);
    for (const d of CONTENT_TYPE_DEFS) {
      expect(d.payloadTable).toBeTruthy();
      expect(typeof d.isYearScoped).toBe("boolean");
      expect(typeof d.isOrgBound).toBe("boolean");
    }
  });

  it("returns null for an unknown content type", () => {
    expect(getContentTypeHandler("does_not_exist")).toBeNull();
  });
});
