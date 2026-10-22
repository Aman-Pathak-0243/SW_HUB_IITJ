// Editor WIDGET specs for the generic admin content editor (Session 15).
//
// WHY this exists. lib/cms/content-types.mjs#getContentTypeFieldSpec returns a
// type's payload SCALARS — the storage shape. The editor used that list directly
// and rendered one plain <input type="text"> per field, which made the three
// curated pages effectively uneditable by a non-developer:
//   • an image meant typing a media_asset UUID into a text box,
//   • `syncToCentral` (a boolean) was a text box,
//   • an achievement's `blocks` (ordered-block JSONB) was a text box of raw JSON,
//   • publishFrom/publishUntil sat in the middle of the form at equal weight to
//     the announcement body.
// This file maps each field to the WIDGET that actually fits it, and splits the
// form into the handful of fields an editor touches every time (`primary`) and
// the rest (`advanced`, behind a disclosure).
//
// INVARIANT — every payload scalar lands in exactly one of primary/advanced. A
// field is hidden behind the disclosure, NEVER dropped: removing it from the form
// would make stored data unreachable through the UI. tests/field-widgets.test.mjs
// asserts this against the live content-type registry, so adding a payload column
// without placing it here fails the suite rather than silently vanishing.
//
// PURE + client-safe: no prisma, no server-only imports. The editor (a Client
// Component) imports this directly.
import { AUDIENCE_TYPES } from "../admin/forms.mjs";

// The widgets the editor knows how to render. A field whose widget is absent
// from this list falls back to "text" (the old behaviour).
export const WIDGETS = ["text", "textarea", "date", "datetime", "select", "checkbox", "media", "json"];

// Per-content-type field specs, in display order.
//   field     the payload scalar name
//   widget    one of WIDGETS
//   label     the human label (replaces the camelCase-to-words fallback)
//   help      optional one-line hint under the input
//   options   for widget:"select"
//   advanced  true → rendered inside the "Advanced" disclosure, not the main form
//   mediaKind for widget:"media" — the media_asset kind a picker should register
const SPECS = {
  announcement: [
    { field: "body", widget: "textarea", label: "Announcement", help: "The text people read. Required.", rows: 6 },
    { field: "coverMediaId", widget: "media", label: "Image (optional)", mediaKind: "image", help: "Pick one already in the site's public folder, or upload a new one." },
    { field: "audience", widget: "select", label: "Who can see it", options: AUDIENCE_TYPES, help: "“public” shows it to everyone, signed in or not." },
    { field: "syncToCentral", widget: "checkbox", label: "Also show on the central announcements board", help: "Off = it stays on this club's own page." },
    { field: "publishFrom", widget: "datetime", label: "Show from", advanced: true, help: "Leave empty to show as soon as it is published." },
    { field: "publishUntil", widget: "datetime", label: "Show until", advanced: true, help: "Leave empty to show indefinitely." },
  ],
  flagship_event: [
    { field: "description", widget: "textarea", label: "Description", help: "The paragraph shown beside the poster on /Flagship-events.", rows: 6 },
    { field: "imageMediaId", widget: "media", label: "Poster image (optional)", mediaKind: "image", help: "Existing posters are already set — leave this alone unless you are replacing one." },
    { field: "category", widget: "text", label: "Category", help: "The orange pill on the card, e.g. Cultural, Technical, Sports." },
  ],
  achievement: [
    { field: "category", widget: "text", label: "Category", help: "e.g. Hackathon, Sports, Research." },
    { field: "achievementDate", widget: "date", label: "Date" },
    { field: "heroMediaId", widget: "media", label: "Image (optional)", mediaKind: "image" },
    // The hybrid ordered-block JSONB (lib/achievements/forms.mjs validates it on
    // write). A real block editor is a separate piece of work; until then this stays
    // behind Advanced as raw JSON so the data remains reachable but does not confront
    // someone who only wants to add a line to the Wall of Fame.
    { field: "blocks", widget: "json", label: "Rich content blocks", advanced: true, help: "Advanced: ordered blocks as JSON. A malformed block is rejected with a 422 on save." },
  ],
};

// Fields the editor should never render as an ordinary input even on the fallback
// path, because they are *_MediaId foreign keys — a UUID text box is never the
// right control. Anything matching gets the media picker automatically.
const MEDIA_FIELD_RE = /MediaId$/;

// Payload scalars that are NOT NULL in Postgres but carry a DB DEFAULT, so the
// right behaviour for an emptied input is to OMIT the field (keep what is stored /
// let the default apply) rather than send null, which would violate the constraint.
//
// This matters because the form now sends null for a cleared field — the fix for
// "a value that had been set could never be unset" — and null is exactly wrong for
// these. Verified against prisma/schema.prisma: the only NOT NULL payload scalars
// are `audience` on announcement_payload and event_payload (both
// `AudienceType @default(public)`), plus resource_payload.resourceKind and
// page_block_payload.blockKind, which are already in their types' requiredFields
// and so are caught by the required-field check instead.
const NOT_NULL_WITH_DEFAULT = new Set(["audience"]);

// Build the editor spec for a content type from its payload scalars.
//
//   getEditorSpec("announcement", ["body", "audience", ...])
//     → { primary: [descriptor…], advanced: [descriptor…], hasSpec: true }
//
// `scalarFields` is the authoritative list (from getContentTypeFieldSpec), so a
// payload column added later still surfaces: it is appended to `advanced` with an
// inferred widget rather than being silently dropped. A type with no entry in
// SPECS gets every field in `primary` as text/media — the pre-Session-15
// behaviour, so no other content type changes.
export function getEditorSpec(contentType, scalarFields = [], requiredFields = []) {
  const spec = SPECS[contentType];
  const declared = new Map((spec ?? []).map((d) => [d.field, d]));
  const out = [];

  // Declared fields first, in their authored order, but only those the registry
  // actually has (so a renamed/removed payload column drops out of the form too).
  for (const d of spec ?? []) {
    if (scalarFields.includes(d.field)) out.push(d);
  }
  // Then anything the registry has that this file does not mention.
  for (const f of scalarFields) {
    if (declared.has(f)) continue;
    out.push({
      field: f,
      widget: MEDIA_FIELD_RE.test(f) ? "media" : "text",
      mediaKind: MEDIA_FIELD_RE.test(f) ? "image" : undefined,
      label: labelize(f),
      // With no spec for the type, keep the old flat form; with one, an unmentioned
      // field is by definition not part of the simplified form.
      advanced: !!spec,
    });
  }

  const withRequired = out.map((d) => ({
    ...d,
    required: requiredFields.includes(d.field),
    notNull: NOT_NULL_WITH_DEFAULT.has(d.field),
  }));
  return {
    hasSpec: !!spec,
    primary: withRequired.filter((d) => !d.advanced),
    advanced: withRequired.filter((d) => d.advanced),
  };
}

// camelCase → "Camel case" (the editor's original label fallback, kept here so
// there is one implementation).
export function labelize(field) {
  return String(field)
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

// Is this field a media reference? Used by the editor and by the tests.
export function isMediaField(field) {
  return MEDIA_FIELD_RE.test(String(field));
}

// ── value coercion ────────────────────────────────────────────────────────────

// Turn a widget's form value into what the CMS payload expects. The editor used
// to send every field as a string and skip empties, which meant a checkbox sent
// "true"/"" and a cleared field could never be cleared (an empty string was
// dropped from the patch instead of nulling the column).
//
// Returns the value to send, or the symbol OMIT to leave the field out entirely.
export const OMIT = Symbol("omit");

export function coerceWidgetValue(descriptor, raw) {
  const { widget } = descriptor;
  if (widget === "checkbox") return !!raw;
  // `undefined` means "the editor never touched it" → omit.
  if (raw === undefined) return OMIT;

  const isEmpty = raw === null || (typeof raw === "string" && raw.trim() === "");
  if (isEmpty) {
    // A NOT NULL column would reject null outright, so an empty input has to mean
    // something other than "write null" for these two cases.
    if (descriptor.required) {
      // NOT NULL with no default (announcement body, resourceKind, blockKind):
      // refuse in the form rather than posting null and getting a constraint error.
      const err = new Error("This field is required.");
      err.field = descriptor.field;
      throw err;
    }
    // NOT NULL *with* a default (audience): leave it out and keep the stored value.
    if (descriptor.notNull) return OMIT;
    // Everything else is nullable, and an emptied field must reach the service as
    // null so the column actually clears — the old form dropped empty strings from
    // the patch, which made a value that had been set impossible to unset.
    return null;
  }
  if (widget === "json") {
    // Parsed here so a syntax error is an inline form error rather than a 422 from
    // the service. The service re-validates the SHAPE regardless.
    try {
      return JSON.parse(raw);
    } catch {
      const err = new Error("This field must be valid JSON.");
      err.field = descriptor.field;
      throw err;
    }
  }
  return raw;
}

// Build the payload patch for a whole form. `values` is { field: rawValue }.
// Throws an Error carrying `.field` when a json widget does not parse.
export function buildPayloadPatch(descriptors, values) {
  const payload = {};
  for (const d of descriptors) {
    const v = coerceWidgetValue(d, values[d.field]);
    if (v !== OMIT) payload[d.field] = v;
  }
  return payload;
}
