// The events captured in the Session-1 MongoDB backup (DATA_MIGRATION_REPORT §2)
// — `backups/incoming/mongo/test__events.json`, the V1 `test.events` collection
// (3 documents). These are the ONLY events that existed in V1 (everything else
// was hardcoded). Kept here VERBATIM (title / description / date / image) so the
// migration is auditable against the backup; the pure `buildEventImportPlan()`
// normalizes them into the importer-ready shape (slug, parsed eventDate). No DB.
//
// All three V1 docs have an EMPTY image (`""`) — so the migration creates zero
// media rows in practice; the importer's base64/URL handling (KNOWN_ISSUES #5,
// via classifyMedia) exists for completeness and is covered by a unit test.
import { slugify } from "../org/normalize.mjs";

// Verbatim V1 `test.events` documents (Extended-JSON dates flattened to ISO).
export const V1_EVENTS = [
  { title: "Udyamitsav", description: "Entrepreneurship Fest", date: "2026-02-07T00:00:00.000Z", image: "" },
  { title: "Pragyaan", description: "Academic and Research Conclave", date: "2026-02-07T00:00:00.000Z", image: "" },
  { title: "Anhad", description: "Techno-Cultural Fest", date: "2026-04-01T00:00:00.000Z", image: "" },
];

// Normalize one V1 event document → an importer plan node. `date` → eventDate
// (the occurrence date, an event_payload column); `description` → body; `image`
// → a media ref the importer turns into a media_asset (never an inline blob).
// V1 events carry no publish window, so publishFrom/publishUntil stay null
// (always visible once published); audience defaults to 'public'.
export function planEvent(doc) {
  return {
    title: doc.title,
    slug: slugify(doc.title),
    body: doc.description ?? null,
    eventDate: doc.date ? new Date(doc.date) : null,
    image: doc.image || null, // "" (all 3 V1 docs) → no cover
    audience: "public",
    publishFrom: null,
    publishUntil: null,
  };
}

// The full, pure import plan for the backed-up events (defaults to V1_EVENTS).
// Pass a custom list (same doc shape) for a bounded test fixture.
export function buildEventImportPlan(events = V1_EVENTS) {
  return events.map(planEvent);
}
