// Admin Panel form validation (Session 9) — PURE, client-safe validators that
// mirror the server-side checks so a form can show inline errors BEFORE it POSTs
// (the service remains the authoritative validator — these never replace it, they
// just save a round-trip and improve UX). No DB / server-only imports.
//
// Each validator returns { ok, errors: { field: message }, value } where `value`
// is the cleaned payload to send when ok. The regexes intentionally match the
// service's (lib/users/admin.mjs#normalizeEmail / normalizeRoleKey,
// lib/year/context.mjs#createYear) so client and server agree.

import { validatePasswordPolicy, passwordRequirements, PASSWORD_POLICY } from "../auth/password-policy.mjs";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ROLE_KEY_RE = /^[a-z][a-z0-9_]*$/;
const YEAR_LABEL_RE = /^\d{4}-\d{2}$/;
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Re-export the password policy (M0) so the client forms validate identically to
// the server (lib/auth/password-policy.mjs is the single source of truth).
export { validatePasswordPolicy, passwordRequirements, PASSWORD_POLICY };

export const MIN_PASSWORD_LENGTH = 8; // argon2id hashing floor (lib/auth/password.mjs)
export const USER_STATUSES = ["active", "suspended", "invited", "disabled"];
export const MEDIA_KINDS = ["image", "pdf", "svg", "gif"];
export const STORAGE_PROVIDERS = ["cloudinary", "local", "external"];
export const AUDIENCE_TYPES = ["public", "students", "faculty", "staff", "internal"];

function result(errors, value) {
  return { ok: Object.keys(errors).length === 0, errors, value };
}

// USER create/edit. isCreate requires email; password (when present) must meet the
// min length; status (when present) must be a known value.
export function validateUserForm(input = {}, { isCreate = false } = {}) {
  const errors = {};
  const value = {};
  if (isCreate) {
    const email = String(input.email ?? "").trim();
    if (!email) errors.email = "Email is required.";
    else if (!EMAIL_RE.test(email)) errors.email = "Enter a valid email address.";
    else value.email = email;
  }
  if (input.name !== undefined) {
    const name = String(input.name ?? "").trim();
    if (!isCreate && !name) errors.name = "Display name cannot be empty.";
    if (name) value.name = name;
  }
  if (input.password !== undefined && input.password !== "") {
    const pw = String(input.password);
    const { ok, errors: pwErrs } = validatePasswordPolicy(pw);
    if (!ok) errors.password = `Password must: ${pwErrs.join("; ")}.`;
    else value.password = pw;
  }
  if (input.status !== undefined) {
    if (!USER_STATUSES.includes(input.status)) errors.status = "Unknown status.";
    else value.status = input.status;
  }
  if (input.isDeveloper !== undefined) value.isDeveloper = !!input.isDeveloper;
  if (input.mustChangePassword !== undefined) value.mustChangePassword = !!input.mustChangePassword;
  return result(errors, value);
}

// Self-service / forced change-password form (mirrors the server policy in
// lib/users/admin.mjs#changeOwnPassword). `requireCurrent` is false only for tooling.
export function validateChangePasswordForm(input = {}, { requireCurrent = true } = {}) {
  const errors = {};
  const value = {};
  if (requireCurrent) {
    if (!input.currentPassword) errors.currentPassword = "Enter your current password.";
    else value.currentPassword = String(input.currentPassword);
  }
  const pw = String(input.newPassword ?? "");
  const { ok, errors: pwErrs } = validatePasswordPolicy(pw);
  if (!ok) errors.newPassword = `Password must: ${pwErrs.join("; ")}.`;
  else value.newPassword = pw;
  if (input.confirm !== undefined && String(input.confirm) !== pw) {
    errors.confirm = "Passwords do not match.";
  }
  if (requireCurrent && value.currentPassword && value.newPassword && value.currentPassword === value.newPassword) {
    errors.newPassword = "Choose a password different from your current one.";
  }
  return result(errors, value);
}

// ROLE create/edit. isCreate requires a slug key; name required; permissionKeys
// (when present) must be an array of strings.
export function validateRoleForm(input = {}, { isCreate = false } = {}) {
  const errors = {};
  const value = {};
  if (isCreate) {
    const key = String(input.key ?? "").trim().toLowerCase();
    if (!key) errors.key = "A role key is required.";
    else if (!ROLE_KEY_RE.test(key)) errors.key = "Use lowercase letters, digits and underscores (e.g. club_editor).";
    else value.key = key;
  }
  if (isCreate || input.name !== undefined) {
    const name = String(input.name ?? "").trim();
    if (!name) errors.name = "A role name is required.";
    else value.name = name;
  }
  if (input.description !== undefined) value.description = String(input.description ?? "").trim() || null;
  if (input.permissionKeys !== undefined) {
    if (!Array.isArray(input.permissionKeys)) errors.permissionKeys = "Permissions must be a list.";
    else value.permissionKeys = input.permissionKeys.map((k) => String(k));
  }
  if (input.status !== undefined) {
    if (!["active", "archived"].includes(input.status)) errors.status = "Unknown status.";
    else value.status = input.status;
  }
  return result(errors, value);
}

// GRANT a role to a user.
export function validateGrantForm(input = {}) {
  const errors = {};
  const value = {};
  if (!input.userId) errors.userId = "Select a user.";
  else value.userId = String(input.userId);
  if (!input.roleId && !input.roleKey) errors.roleId = "Select a role.";
  else {
    if (input.roleId) value.roleId = String(input.roleId);
    if (input.roleKey) value.roleKey = String(input.roleKey);
  }
  if (input.orgUnitLineageKey) value.orgUnitLineageKey = String(input.orgUnitLineageKey);
  if (input.academicYearId) value.academicYearId = String(input.academicYearId);
  return result(errors, value);
}

// PER-EMAIL permission OVERRIDE (M2) — mirrors lib/users/admin.mjs#setUserOverride.
// mode ∈ {grant, deny}; a permission key is required; scope fields are optional.
export const OVERRIDE_MODES = ["grant", "deny"];
export function validateOverrideForm(input = {}) {
  const errors = {};
  const value = {};
  if (!input.userId) errors.userId = "Select a user.";
  else value.userId = String(input.userId);
  const mode = String(input.mode ?? "");
  if (!OVERRIDE_MODES.includes(mode)) errors.mode = "Choose grant or deny.";
  else value.mode = mode;
  const permissionKey = String(input.permissionKey ?? "").trim();
  if (!permissionKey) errors.permissionKey = "Select a permission.";
  else value.permissionKey = permissionKey;
  if (input.orgUnitLineageKey) value.orgUnitLineageKey = String(input.orgUnitLineageKey);
  if (input.academicYearId) value.academicYearId = String(input.academicYearId);
  if (input.reason !== undefined) value.reason = String(input.reason ?? "").trim() || null;
  return result(errors, value);
}

// CONTENT create. A title is always required; a year-scoped/org-bound type's
// binding is checked server-side (we don't have the type-def here), but we surface
// an obvious slug-format hint.
export function validateContentForm(input = {}, { isCreate = false } = {}) {
  const errors = {};
  const value = {};
  if (isCreate) {
    if (!input.contentType) errors.contentType = "Choose a content type.";
    else value.contentType = String(input.contentType);
  }
  if (isCreate || input.title !== undefined) {
    const title = String(input.title ?? "").trim();
    if (!title) errors.title = "A title is required.";
    else value.title = title;
  }
  if (input.slug !== undefined && input.slug !== "") {
    const slug = String(input.slug).trim();
    if (!SLUG_RE.test(slug)) errors.slug = "Slug must be lowercase words separated by hyphens.";
    else value.slug = slug;
  }
  if (input.summary !== undefined) value.summary = String(input.summary ?? "");
  if (input.pinned !== undefined) value.pinned = !!input.pinned;
  return result(errors, value);
}

// ACADEMIC YEAR create (mirrors lib/year/context.mjs#createYear).
export function validateYearForm(input = {}) {
  const errors = {};
  const value = {};
  const label = String(input.label ?? "").trim();
  if (!label) errors.label = "A year label is required.";
  else if (!YEAR_LABEL_RE.test(label)) errors.label = "Use 'YYYY-YY' format (e.g. 2026-27).";
  else value.label = label;
  if (!input.startDate) errors.startDate = "Start date is required.";
  else value.startDate = String(input.startDate);
  if (!input.endDate) errors.endDate = "End date is required.";
  else value.endDate = String(input.endDate);
  if (value.startDate && value.endDate && new Date(value.endDate) <= new Date(value.startDate)) {
    errors.endDate = "End date must be after the start date.";
  }
  return result(errors, value);
}

// MEDIA asset registration (mirrors lib/media/service.mjs#createMediaAsset).
export function validateMediaForm(input = {}) {
  const errors = {};
  const value = {};
  const url = String(input.url ?? "").trim();
  if (!url) errors.url = "A media URL is required.";
  else value.url = url;
  const kind = input.kind ?? "image";
  if (!MEDIA_KINDS.includes(kind)) errors.kind = "Unknown media kind.";
  else value.kind = kind;
  const storageProvider = input.storageProvider ?? "external";
  if (!STORAGE_PROVIDERS.includes(storageProvider)) errors.storageProvider = "Unknown storage provider.";
  else value.storageProvider = storageProvider;
  if (input.altText !== undefined) value.altText = String(input.altText ?? "");
  return result(errors, value);
}
