// Content-type registry (capability 9). content_type is a text-PK LOOKUP TABLE
// (content_type_def), NOT an enum (DECISION_LOG DL-006), so adding a module is
// pure DATA + one payload table — no `ALTER TYPE`. This file is BOTH the seed
// for content_type_def AND the in-code routing map. A unit test
// (tests/content-types.test.mjs) asserts every CONTENT_TYPE_DEFS row has a
// handler and every handler has a def — the "every content_type has a handler"
// startup guarantee from the schema design.

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

// In-code routing map: content_type -> { payloadTable, payloadModel }.
// payloadModel is the Prisma Client accessor (camelCase) for the payload table.
// Session 3 attaches typed read/write handlers here.
export const CONTENT_TYPE_HANDLERS = {
  council_profile: { payloadTable: "club_profile_payload", payloadModel: "clubProfilePayload" },
  club_profile: { payloadTable: "club_profile_payload", payloadModel: "clubProfilePayload" },
  hostel_profile: { payloadTable: "hostel_profile_payload", payloadModel: "hostelProfilePayload" },
  mess_profile: { payloadTable: "mess_profile_payload", payloadModel: "messProfilePayload" },
  event: { payloadTable: "event_payload", payloadModel: "eventPayload" },
  announcement: { payloadTable: "announcement_payload", payloadModel: "announcementPayload" },
  flagship_event: { payloadTable: "flagship_event_payload", payloadModel: "flagshipEventPayload" },
  resource: { payloadTable: "resource_payload", payloadModel: "resourcePayload" },
  team_page: { payloadTable: "page_block_payload", payloadModel: "pageBlockPayload" },
  page_block: { payloadTable: "page_block_payload", payloadModel: "pageBlockPayload" },
};

export function getContentTypeHandler(contentType) {
  return CONTENT_TYPE_HANDLERS[contentType] ?? null;
}
