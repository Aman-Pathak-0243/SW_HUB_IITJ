# API Specification (As-Is)

The current application exposes exactly **two** route handlers under `app/api/`.
Everything here is the real, current behavior.

## 1. Events API — `app/api/events/route.js`

Base path: `/api/events`

### `GET /api/events`
Returns **all** events, sorted by `date` ascending.

- **Auth:** none (public).
- **Request:** no params, no body. (No pagination, no filtering, no query support.)
- **Success (200):** a **JSON array** of Event documents:
  ```json
  [
    {
      "_id": "…",
      "title": "Annual Sports Meet 2025",
      "description": "…",
      "date": "2025-11-02T00:00:00.000Z",
      "image": "data:image/png;base64,…  (or a URL)",
      "createdAt": "…",
      "__v": 0
    }
  ]
  ```
- **Error (500):** `{ "error": "<message>" }`.

> ⚠️ **Contract mismatch:** `app/past-events/page.js` expects the response shape
> `{ success: true, events: [...] }` and reads `data.success` / `data.events`.
> The endpoint actually returns a bare array, so the Past Events page **never**
> renders any events. The Announcements page consumes the array correctly.
> Tracked in [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).

### `POST /api/events`
Creates a new event.

- **Auth:** ⚠️ **NONE.** The handler does not check the NextAuth session. Anyone
  who can reach the route can create events. (The `/admin` UI is gated, but the
  API itself is not.) Tracked in [SECURITY.md](SECURITY.md) and [KNOWN_ISSUES.md](../KNOWN_ISSUES.md).
- **Request body (JSON):**
  ```json
  { "title": "string (required)",
    "description": "string (optional)",
    "date": "ISO date string (required)",
    "image": "string — base64 data URL (from /admin) or plain URL (from page2)" }
  ```
- **Success (201):** the created Event document (JSON object).
- **Error (500):** `{ "error": "<message>" }`.
- **Validation:** delegated entirely to the Mongoose schema (`title` and `date`
  required). No server-side sanitization, size limit, or type checks. Base64
  images can be very large and are stored inline in MongoDB.

**Notes**
- Imports use a relative path (`../../../lib/db`, `../../../models/Event`); the
  `@/`-alias variants are present but commented out.
- No `PUT`/`PATCH`/`DELETE` — events cannot be edited or deleted via the API.

## 2. Auth API — `app/api/auth/[...nextauth]/route.js`

Base path: `/api/auth/*` (NextAuth catch-all). Exports `GET` and `POST`.

- **Provider:** Google only (`GoogleProvider`), configured from
  `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.
- **Allowlist:** `ADMIN_EMAILS = ["tusharneymar8@gmail.com", "apaarmsd@gmail.com"]`
  hardcoded in the file.
- **`signIn` callback:** returns `true` **only** if the Google email is in
  `ADMIN_EMAILS` — i.e. non-admins are **denied login entirely**.
- **`session` callback:** sets `session.user.isAdmin = ADMIN_EMAILS.includes(email)`.
- **No email/password provider** is configured (despite README mentioning it).
- **No database adapter** — sessions are JWT/stateless; users are not persisted.

See [AUTHENTICATION_AND_RBAC.md](AUTHENTICATION_AND_RBAC.md) for details.

## Cross-cutting facts

- **No versioning** (`/api/v1/...`), no OpenAPI/Swagger, no rate limiting.
- **No CORS configuration** (same-origin only by default).
- **No standard envelope** — `GET` returns a bare array; errors return `{error}`.
- **Client consumption:** all client fetches are in `useEffect` with no caching,
  retry, or loading/error states beyond the global 800 ms loader.

## Proposed V2 direction (not yet implemented)

V2 introduces many resource APIs (organizations, positions, roles, users,
academic years, clubs, hostels, messes, events, announcements, resources, media,
backups) behind authenticated, role-checked, paginated, versioned endpoints with
a consistent response envelope. The current `Event` API will be refactored to
add auth on writes and to fix the `/past-events` contract. See
[TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) and [MILESTONE_PLAN.md](MILESTONE_PLAN.md).
