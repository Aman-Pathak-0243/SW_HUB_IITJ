// Password POLICY (validated client AND server side — M0, DL-058).
//
// This module is PURE + client-safe (no node:crypto / no server-only imports) so
// the same rule runs in the browser (inline form errors, lib/admin/forms.mjs
// re-exports it) and on the server (the authoritative check in
// lib/users/admin.mjs#changeOwnPassword / setUserPassword). argon2id's
// MIN_PASSWORD_LENGTH (lib/auth/password.mjs) remains the hard hashing floor; this
// policy is the stricter, human-facing rule layered on top. The CSPRNG
// password GENERATOR lives in lib/auth/password-generator.mjs (server-only).

export const PASSWORD_POLICY = {
  minLength: 10,
  maxLength: 128,
  // requires at least one of each class below
  requireLower: true,
  requireUpper: true,
  requireDigit: true,
};

// PURE. Returns { ok, errors: string[] }. `errors` is human-readable and ordered
// so a form can show them as a checklist. Never throws.
export function validatePasswordPolicy(pw, policy = PASSWORD_POLICY) {
  const errors = [];
  const s = typeof pw === "string" ? pw : "";
  if (s.length < policy.minLength) errors.push(`Be at least ${policy.minLength} characters long`);
  if (s.length > policy.maxLength) errors.push(`Be at most ${policy.maxLength} characters long`);
  if (policy.requireLower && !/[a-z]/.test(s)) errors.push("Include a lowercase letter");
  if (policy.requireUpper && !/[A-Z]/.test(s)) errors.push("Include an uppercase letter");
  if (policy.requireDigit && !/[0-9]/.test(s)) errors.push("Include a digit");
  // a whitespace-only or all-identical string trivially defeats the class checks
  if (s.length > 0 && /^(.)\1*$/.test(s)) errors.push("Not be a single repeated character");
  return { ok: errors.length === 0, errors };
}

// The requirement checklist a form can render (the same text the validator emits).
export function passwordRequirements(policy = PASSWORD_POLICY) {
  const reqs = [`At least ${policy.minLength} characters`];
  if (policy.requireLower) reqs.push("A lowercase letter");
  if (policy.requireUpper) reqs.push("An uppercase letter");
  if (policy.requireDigit) reqs.push("A digit");
  return reqs;
}
