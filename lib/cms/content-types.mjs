// Content-type registry + the GENERIC, schema-driven editing layer (capability 9
// / DL-006 / DL-011). content_type is a text-PK LOOKUP TABLE (content_type_def),
// NOT an enum, so adding a module is pure DATA + one payload table — no
// `ALTER TYPE`. This file is the single source of truth on the code side:
//   • CONTENT_TYPE_DEFS  — the rows seeded into content_type_def.
//   • CONTENT_TYPE_HANDLERS — the in-code routing map: content_type → a handler
//     that knows how to write / read / copy that type's typed payload (+ its
//     normalized list children). The content service (lib/cms/content.mjs) is
//     payload-shape-agnostic; it routes every payload operation through here.
//
// tests/content-types.test.mjs asserts the "every content_type_def row has a
// handler (and vice-versa)" startup guarantee.
import { CmsValidationError } from "./errors.mjs";

// Rows for content_type_def (DB columns only).
export const CONTENT_TYPE_DEFS = [
  { contentType: "council_profile", label: "Council Profile", isYearScoped: true, supportsPublish: true, isOrgBound: true, payloadTable: "club_profile_payload" },
  { contentType: "club_profile", label: "Club Profile", isYearScoped: true, supportsPublish: true, isOrgBound: true, payloadTable: "club_profile_payload" },
  { contentType: "hostel_profile", label: "Hostel Profile", isYearScoped: true, supportsPublish: true, isOrgBound: true, payloadTable: "hostel_profile_payload" },
  { contentType: "mess_profile", label: "Mess Profile", isYearScoped: true, supportsPublish: true, isOrgBound: true, payloadTable: "mess_profile_payload" },
  { contentType: "event", label: "Event", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "event_payload" },
  { contentType: "announcement", label: "Announcement", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "announcement_payload" },
  { contentType: "flagship_event", label: "Flagship Event", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "flagship_event_payload" },
  { contentType: "resource", label: "Resource", isYearScoped: true, supportsPublish: true, isOrgBound: true, payloadTable: "resource_payload" },
  { contentType: "team_page", label: "Team Page", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "page_block_payload" },
  { contentType: "page_block", label: "Page Block", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "page_block_payload" },
];

// ── Payload shapes ──
// Each config declares the typed payload's scalar columns, any NORMALIZED list
// children (3NF child tables, not JSON arrays), and which scalars are NOT NULL
// in the DB (validated app-side so callers get a friendly 422 instead of a raw
// constraint error). `payloadModel` / list `model` are Prisma Client accessors.
const PAYLOAD_CONFIGS = {
  club_profile_payload: {
    payloadModel: "clubProfilePayload",
    scalarFields: ["vision", "instagramUrl", "logoMediaId", "heroMediaId", "detailDriveUrl"],
    requiredFields: [],
    lists: [
      { key: "missionPoints", model: "clubMissionPoint", fields: ["text", "sortOrder"], orderBy: { sortOrder: "asc" } },
    ],
  },
  hostel_profile_payload: {
    payloadModel: "hostelProfilePayload",
    scalarFields: ["buildingMediaId", "officeEmail", "officePhone", "infrastructurePdfMediaId", "detailDriveUrl"],
    requiredFields: [],
    lists: [],
  },
  mess_profile_payload: {
    payloadModel: "messProfilePayload",
    scalarFields: ["location", "capacity", "imageMediaId", "infrastructurePdfMediaId", "detailDriveUrl"],
    requiredFields: [],
    lists: [
      { key: "mealTimings", model: "messMealTiming", fields: ["meal", "startTime", "endTime", "wrapsMidnight", "sortOrder"], orderBy: { sortOrder: "asc" } },
    ],
  },
  event_payload: {
    payloadModel: "eventPayload",
    scalarFields: ["body", "eventDate", "location", "audience", "publishFrom", "publishUntil", "coverMediaId"],
    requiredFields: [],
    lists: [],
  },
  announcement_payload: {
    payloadModel: "announcementPayload",
    scalarFields: ["body", "audience", "publishFrom", "publishUntil", "coverMediaId"],
    requiredFields: ["body"],
    lists: [],
  },
  flagship_event_payload: {
    payloadModel: "flagshipEventPayload",
    scalarFields: ["description", "imageMediaId", "category"],
    requiredFields: [],
    lists: [],
  },
  resource_payload: {
    payloadModel: "resourcePayload",
    scalarFields: ["resourceKind", "fileMediaId", "externalUrl", "description"],
    requiredFields: ["resourceKind"],
    lists: [],
  },
  page_block_payload: {
    payloadModel: "pageBlockPayload",
    scalarFields: ["blockKind", "body", "data", "primaryMediaId"],
    requiredFields: ["blockKind"],
    lists: [],
  },
};

// Pick only the declared scalar fields from a caller-supplied payload object.
function pickScalars(scalarFields, payload) {
  const out = {};
  for (const f of scalarFields) {
    if (payload[f] !== undefined) out[f] = payload[f];
  }
  return out;
}

// Build a generic handler for a payload table from its config. The handler is
// fully data-driven, so a new content type usually needs only a new config row
// (+ the new payload table in a migration) — no new code path.
function makeHandler(payloadTable, config) {
  const { payloadModel, scalarFields, requiredFields, lists } = config;

  return {
    payloadTable,
    payloadModel,
    scalarFields,
    requiredFields,
    lists,

    // Validate caller input app-side (friendly 422 vs raw NOT NULL violation).
    // Only enforced on create — partial edits keep existing values.
    validate(payload, { isCreate }) {
      if (!isCreate) return;
      for (const f of requiredFields) {
        const v = payload?.[f];
        if (v === undefined || v === null || v === "") {
          // A real CmsValidationError (422/CMS_VALIDATION) so it passes through
          // mapDbError unchanged when thrown inside a service transaction.
          throw new CmsValidationError(`Missing required field '${f}' for ${payloadTable}.`);
        }
      }
    },

    // Create or replace the 1:1 payload row + its list children for a revision.
    // `isCreate` toggles required-field validation. Replaces list children
    // wholesale (delete + recreate) so edits are deterministic.
    async writePayload(tx, revisionId, payload = {}, { isCreate = false } = {}) {
      this.validate(payload, { isCreate });
      const scalars = pickScalars(scalarFields, payload);
      await tx[payloadModel].upsert({
        where: { revisionId },
        create: { revisionId, ...scalars },
        update: scalars,
      });
      for (const list of lists) {
        const rows = Array.isArray(payload[list.key]) ? payload[list.key] : null;
        if (rows === null) continue; // omitted => leave existing children untouched
        await tx[list.model].deleteMany({ where: { revisionId } });
        if (rows.length) {
          await tx[list.model].createMany({
            data: rows.map((r, i) => {
              const row = { revisionId };
              for (const f of list.fields) {
                if (f === "sortOrder") row.sortOrder = r.sortOrder ?? i;
                else if (r[f] !== undefined) row[f] = r[f];
              }
              return row;
            }),
          });
        }
      }
    },

    // Read the normalized payload object (scalars + ordered list children).
    async readPayload(client, revisionId) {
      const row = await client[payloadModel].findUnique({ where: { revisionId } });
      if (!row) return null;
      const out = {};
      for (const f of scalarFields) out[f] = row[f] ?? null;
      for (const list of lists) {
        const children = await client[list.model].findMany({
          where: { revisionId },
          orderBy: list.orderBy,
        });
        out[list.key] = children.map((c) => {
          const o = {};
          for (const f of list.fields) o[f] = c[f] ?? null;
          return o;
        });
      }
      return out;
    },

    // Clone a revision's full payload (scalars + children) onto another revision.
    // Used by restore and (later) the Transition Wizard's copy_content.
    async copyPayload(tx, fromRevisionId, toRevisionId) {
      const src = await this.readPayload(tx, fromRevisionId);
      if (!src) return;
      await this.writePayload(tx, toRevisionId, src, { isCreate: true });
    },
  };
}

// content_type → handler. Multiple content types can share one payload table
// (e.g. club/council share club_profile_payload), each getting its own handler
// instance bound to the same config.
export const CONTENT_TYPE_HANDLERS = Object.fromEntries(
  CONTENT_TYPE_DEFS.map((def) => [def.contentType, makeHandler(def.payloadTable, PAYLOAD_CONFIGS[def.payloadTable])])
);

export function getContentTypeHandler(contentType) {
  return CONTENT_TYPE_HANDLERS[contentType] ?? null;
}

// Lookup helper for the content service: the def row (flags) for a type.
export const CONTENT_TYPE_DEF_BY_TYPE = Object.fromEntries(
  CONTENT_TYPE_DEFS.map((d) => [d.contentType, d])
);

export function getContentTypeDef(contentType) {
  return CONTENT_TYPE_DEF_BY_TYPE[contentType] ?? null;
}
