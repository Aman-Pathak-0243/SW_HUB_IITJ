// PURE, client-safe helpers for INLINE EDIT-ON-PUBLIC-PAGE (Session 15, DL-103).
// A logged-in stakeholder with scoped content.update/publish can fix a wrong detail
// directly on a public page (event / club-or-council profile / wall-of-fame achievement)
// through a small modal that posts the EXISTING content.edit(+publish) actions — the
// service re-authorizes at the item's (year, org-lineage) scope, so this adds an
// affordance, never a new capability. NO server-only imports here: this module is shared
// by the client <InlineEditor> AND the server (page capability + the audited service),
// mirrored + unit-tested so the field set never drifts (DL-051).

// Which fields each editable content type exposes inline. `path` is 'title' | 'summary'
// (content_revision scalars) or 'payload.<field>' (the typed payload). Kept intentionally
// SMALL + safe: plain text/markdown scalars only — media, list fields, dates, and the
// hybrid blocks stay in the full admin editor (DL-011). club_profile + council_profile
// share the club_profile_payload shape.
const CLUB_FIELDS = [
  { key: "vision", label: "Vision", type: "textarea", path: "payload.vision" },
  { key: "instagramUrl", label: "Instagram URL", type: "text", path: "payload.instagramUrl" },
];

export const INLINE_FIELD_SPECS = {
  event: [
    { key: "title", label: "Title", type: "text", path: "title", required: true },
    { key: "summary", label: "Summary", type: "textarea", path: "summary" },
    { key: "location", label: "Location", type: "text", path: "payload.location" },
    { key: "body", label: "Details", type: "textarea", path: "payload.body" },
  ],
  club_profile: CLUB_FIELDS,
  council_profile: CLUB_FIELDS,
  achievement: [
    { key: "title", label: "Title", type: "text", path: "title", required: true },
    { key: "summary", label: "Summary", type: "textarea", path: "summary" },
    { key: "category", label: "Category", type: "text", path: "payload.category" },
  ],
};

export function getInlineFields(contentType) {
  return INLINE_FIELD_SPECS[contentType] ?? [];
}

export function isInlineEditable(contentType) {
  return getInlineFields(contentType).length > 0;
}

// PURE: build the editDraft patch ({ title?, summary?, payload?, changeNote }) from a flat
// { fieldKey: value } map. Only fields present in `values` for this content type are
// included; strings are trimmed; an empty optional value → null (clears it). A `required`
// field whose value is blank is OMITTED (never written empty — e.g. title cannot be blanked
// here; the client also blocks it). Mirrors what lib/cms/content.mjs#editDraft consumes.
export function buildEditPatch(contentType, values = {}) {
  const fields = getInlineFields(contentType);
  const patch = {};
  const payload = {};
  let hasPayload = false;
  for (const f of fields) {
    if (!(f.key in values)) continue;
    let v = values[f.key];
    if (v === undefined || v === null) v = "";
    if (typeof v === "string") v = v.trim();
    const isEmpty = v === "" || v === null;
    if (f.required && isEmpty) continue; // never blank a required scalar (e.g. title)
    if (f.path.startsWith("payload.")) {
      payload[f.path.slice("payload.".length)] = isEmpty ? null : v;
      hasPayload = true;
    } else {
      patch[f.path] = isEmpty ? null : v; // title/summary revision scalars
    }
  }
  if (hasPayload) patch.payload = payload;
  patch.changeNote = "Inline edit (public page)";
  return patch;
}

// PURE: does a patch carry any actual field change (beyond the changeNote)? Lets the
// client short-circuit a no-op save.
export function patchHasChanges(patch = {}) {
  return ["title", "summary"].some((k) => k in patch) || (!!patch.payload && Object.keys(patch.payload).length > 0);
}
