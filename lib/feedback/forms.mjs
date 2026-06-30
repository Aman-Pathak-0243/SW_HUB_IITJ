// Feedback / support-ticket constants + a PURE, client-safe validator (M7, DL-070).
// The single source of truth for the category/status vocabularies and the create
// form's validation, mirrored by the server service (lib/feedback/service.mjs) so
// the public form shows inline errors before it POSTs without being the authority
// (the DL-051 pattern). No DB / server-only imports.

export const FEEDBACK_CATEGORIES = ["bug", "issue", "query", "suggestion"];
// The status workflow (CHECK-guarded at the DB). open → triaged → in_progress →
// resolved; or → dismissed. open/triaged/in_progress are the "live" states.
export const FEEDBACK_STATUSES = ["open", "triaged", "in_progress", "resolved", "dismissed"];
export const OPEN_FEEDBACK_STATUSES = ["open", "triaged", "in_progress"];
export const FEEDBACK_RESOLUTION_STATUSES = ["triaged", "in_progress", "resolved", "dismissed"];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SUBJECT_MAX = 200;
const BODY_MAX = 5000;
const COMPONENT_MAX = 120;

// Validate a public feedback submission. `email` is optional (an authenticated
// submitter is linked by id server-side; an anonymous one may leave an email).
export function validateFeedbackForm(input = {}) {
  const errors = {};
  const value = {};

  const category = String(input.category ?? "").trim();
  if (!category) errors.category = "Choose a category.";
  else if (!FEEDBACK_CATEGORIES.includes(category)) errors.category = "Unknown category.";
  else value.category = category;

  const subject = String(input.subject ?? "").trim();
  if (!subject) errors.subject = "A subject is required.";
  else if (subject.length > SUBJECT_MAX) errors.subject = `Keep the subject under ${SUBJECT_MAX} characters.`;
  else value.subject = subject;

  const body = String(input.body ?? "").trim();
  if (!body) errors.body = "Describe the issue.";
  else if (body.length > BODY_MAX) errors.body = `Keep the message under ${BODY_MAX} characters.`;
  else value.body = body;

  if (input.component !== undefined && String(input.component).trim()) {
    const component = String(input.component).trim();
    if (component.length > COMPONENT_MAX) errors.component = `Component id too long (max ${COMPONENT_MAX}).`;
    else value.component = component;
  }

  if (input.email !== undefined && String(input.email).trim()) {
    const email = String(input.email).trim();
    if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    else value.email = email;
  }

  return { ok: Object.keys(errors).length === 0, errors, value };
}
