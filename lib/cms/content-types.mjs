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
import { normalizeAchievementPayload } from "../achievements/forms.mjs";
import { normalizeEventPayload } from "../events/forms.mjs";

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
  // M3 (DL-076): a club's "Miscellaneous" MARKDOWN docs. A year-scoped, ORG-BOUND
  // content type that REUSES page_block_payload (blockKind='markdown', body=markdown)
  // — no new payload table (DL-006/037). Each doc mints its OWN content lineage
  // (DL-041 pattern), so a club can hold many docs. Permitted stakeholders CRUD it
  // through the CMS service scoped to the club's lineage (content.* + DL-066); the
  // public club page renders published docs via lib/markdown/render.mjs.
  { contentType: "club_doc", label: "Club Document", isYearScoped: true, supportsPublish: true, isOrgBound: true, payloadTable: "page_block_payload" },
  // M4 (DL-080): the Wall of Fame. A year-scoped, NOT-org-bound content type with its
  // OWN payload table (achievement_payload) holding typed scalars + a `blocks` JSONB of
  // HYBRID ordered blocks (markdown / markdown+image / banner / link / gallery). Club
  // association is a SEPARATE mapping (achievement_credit, DL-081), not orgUnitId, so an
  // achievement can credit MANY clubs + members. Managed via content.* (no new
  // permission); markdown rendered safely via lib/markdown/render.mjs (DL-077).
  { contentType: "achievement", label: "Achievement", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "achievement_payload" },
  // M5 (DL-089): the "Events Organized" curated markdown doc — a year-scoped, NOT-org-bound
  // content type REUSING page_block_payload (blockKind='markdown', body=markdown), like
  // club_doc (DL-076). Admin/staff/dev edit it via the CMS content.* actions, so every
  // add/update is audited (before/after itemSnapshot) + fully version-diffable; the M8
  // dev-dashboard change-history tab surfaces + exports that history (DL-089).
  { contentType: "events_organized", label: "Events Organized (curated)", isYearScoped: true, supportsPublish: true, isOrgBound: false, payloadTable: "page_block_payload" },
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
    // M5 (DL-084): problemStatement/eligibility (markdown), category (facet), blocks
    // (hybrid ordered-block JSONB) added to the versioned event content.
    scalarFields: ["body", "eventDate", "location", "audience", "publishFrom", "publishUntil", "coverMediaId", "problemStatement", "eligibility", "category", "blocks"],
    requiredFields: [],
    lists: [],
    // Validate + normalize the hybrid blocks + trim the markdown/text fields BEFORE
    // storage (mirrored client-safe in lib/events/forms.mjs, DL-051). Existing scalars
    // (body / dates / audience / cover) pass through untouched. Throws 422 on a bad block.
    coercePayload: (payload) => normalizeEventPayload(payload),
  },
  announcement_payload: {
    payloadModel: "announcementPayload",
    // syncToCentral (M3, DL-078): a club announcement opts in to the central board.
    scalarFields: ["body", "audience", "publishFrom", "publishUntil", "coverMediaId", "syncToCentral"],
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
  achievement_payload: {
    payloadModel: "achievementPayload",
    scalarFields: ["category", "achievementDate", "heroMediaId", "blocks"],
    requiredFields: [],
    lists: [],
    // Validate + normalize the hybrid ordered blocks + the date BEFORE storage
    // (mirrored client-safe in lib/achievements/forms.mjs, DL-051). Throws a 422
    // CmsValidationError on a malformed block — so the ordinary CMS service enforces
    // the achievement's block schema with NO parallel pipeline.
    coercePayload: (payload) => normalizeAchievementPayload(payload),
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
  const { payloadModel, scalarFields, requiredFields, lists, coercePayload } = config;

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
      // Type-specific validate + normalize (e.g. the achievement hybrid blocks). Runs
      // on create AND edit so stored data is always clean; throws a 422 on bad input.
      const clean = coercePayload ? coercePayload(payload, { isCreate }) : payload;
      const scalars = pickScalars(scalarFields, clean);
      if (isCreate) {
        // Fresh revision (createDraft) or a full copy (copyPayload/restore): the whole
        // payload is supplied, so create-or-replace.
        await tx[payloadModel].upsert({
          where: { revisionId },
          create: { revisionId, ...scalars },
          update: scalars,
        });
      } else {
        // Partial edit: the payload row ALWAYS pre-exists (created at draft creation or
        // by copyPayload when a new draft is opened), so UPDATE in place. Using upsert
        // here would break for a partial patch, because Prisma statically requires the
        // `create` branch to carry every NOT-NULL payload column (e.g. announcement
        // body) even though only `update` would ever run — surfaced by the M3 live suite.
        await tx[payloadModel].update({ where: { revisionId }, data: scalars });
      }
      for (const list of lists) {
        const rows = Array.isArray(clean[list.key]) ? clean[list.key] : null;
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

// The payload field SPEC for a content type — the scalar field names, which are
// required, and the normalized list children — so a generic, registry-driven
// editor (Session-9 admin panel) can render inputs for any type with no per-type
// screen. PURE; safe to import from a Client Component (no prisma).
export function getContentTypeFieldSpec(contentType) {
  const def = CONTENT_TYPE_DEF_BY_TYPE[contentType];
  if (!def) return null;
  const cfg = PAYLOAD_CONFIGS[def.payloadTable];
  return {
    contentType,
    label: def.label,
    isYearScoped: def.isYearScoped,
    isOrgBound: def.isOrgBound,
    scalarFields: cfg?.scalarFields ?? [],
    requiredFields: cfg?.requiredFields ?? [],
    lists: (cfg?.lists ?? []).map((l) => ({ key: l.key, fields: l.fields })),
  };
}
