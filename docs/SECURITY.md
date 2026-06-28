# Security (As-Is + Required Actions)

This document records the current security posture **and** the critical findings
from the analysis. Items marked 🔴 are critical and should be addressed
regardless of the V2 timeline.

## 🔴 CRITICAL — Secrets committed to the repository

`README.md` contains what appear to be **live secrets**, in plaintext, in version
control:

- A 35-character token string: `UD9ky0m6Q4Zk0z5oiGBxXMdglatCqa2mfC`
- A **GitHub Personal Access Token** prefix: `ghp_i8…` (the `ghp_` prefix is the
  GitHub PAT format).

**Required actions (do these now, outside the V2 milestone flow):**
1. **Revoke/rotate** both credentials immediately (assume they are compromised —
   anything committed to Git history is exposed even after deletion).
2. Remove them from `README.md`.
3. Because they exist in Git history, also **purge history** (e.g. `git filter-repo`
   / BFG) or rotate so the leaked values are useless, then force-push (coordinate
   with the team).
4. Add secret-scanning (e.g. GitHub secret scanning, `gitleaks` pre-commit) to
   prevent recurrence.

> This finding is also listed in [KNOWN_ISSUES.md](../KNOWN_ISSUES.md) as the
> highest-priority item.

## 🔴 HIGH — Unauthenticated write API

`POST /api/events` performs **no session/role check**. The `/admin` UI is gated
by the email allowlist, but the endpoint itself is open: anyone who can reach the
route can create events (and store arbitrary, possibly very large, base64 blobs
in the database). See [API_SPECIFICATION.md](API_SPECIFICATION.md).

**Fix direction (V2 Milestone for events):** require an authenticated admin
session in the handler; validate and size-limit the payload.

## 🟠 MEDIUM — Authorization by hardcoded email allowlist

Admin access is defined by a two-email array in
`app/api/auth/[...nextauth]/route.js`. Changing admins requires a code change and
redeploy, and the list of privileged users lives in source control. V2 replaces
this with database-backed roles (see [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md)).

## 🟠 MEDIUM — User-supplied base64 images stored inline

`/admin` uploads images as base64 data URLs into the `Event.image` string field.
Risks: unbounded document size, no content-type/size validation, DB bloat, slow
queries, and large payloads to clients. V2 routes uploads through Cloudinary with
validation (see [MEDIA management in TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md)).

## 🟡 LOW / informational

- **No input validation/sanitization** on the events API beyond Mongoose
  `required`. Add schema validation (e.g. Zod) and sanitize rich text in V2.
- **`process.exit(1)` on DB connect failure** (`lib/db.js`) — a denial-of-service
  foot-gun for a web server; should throw and return 500 instead.
- **PII present in code & DB:** names, institutional emails, phone numbers, and
  photos of real staff/students are hardcoded and will be migrated to the DB.
  Handle per institute data-protection norms; restrict who can edit/export.
- **No security headers / CSP** configured in `next.config.mjs`.
- **No rate limiting** on any endpoint.
- **Dependency freshness:** `pdfjs-dist` version mismatch (see
  [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)); run `npm audit` once dependencies are
  installed.
- **`.env` handling is correct:** `.gitignore` excludes `.env*`; only
  `env.example` (empty values) is committed. Keep it that way.

## Current good practices (worth keeping)

- Secrets are read from environment variables (`MONGODB_URI`, `GOOGLE_*`,
  `NEXTAUTH_*`) — not hardcoded (except the README leak, which is the exception
  to fix).
- `next/image` `remotePatterns` restricts which remote image hosts are allowed.
- OAuth via Google offloads password handling for admins.

## V2 security requirements (target)

- Server-side authz on **every** mutating endpoint, shared via one util.
- Database-backed roles/permissions; least privilege; Developer vs Admin split.
- Validated, size-limited uploads via Cloudinary; no base64-in-DB.
- Audit trail for all admin/developer actions (who/what/when) — surfaced in the
  Developer Console.
- Security headers + CSP; rate limiting on auth and write endpoints.
- Secret scanning + dependency auditing in CI.
- Documented backup encryption and restricted access to exports (PII).

See [TESTING_STRATEGY.md](TESTING_STRATEGY.md) for the security/permission test
gate each milestone must pass.
