# Authentication & RBAC (As-Is)

## Current authentication

- **Library:** `next-auth@^4` (App Router catch-all at
  `app/api/auth/[...nextauth]/route.js`).
- **Provider:** **Google OAuth only.** No email/password (Credentials) provider
  is configured, even though `README.md` / the spec mention email+password.
- **Session strategy:** default **JWT** (stateless). No database adapter, so
  **users are not stored** anywhere.
- **Client wiring:** `app/providers.jsx` wraps the app in `SessionProvider`;
  pages use `useSession`, `signIn`, `signOut` from `next-auth/react`.

## Current authorization (the "RBAC")

There is no real role system. Authorization is a **hardcoded email allowlist**:

```js
const ADMIN_EMAILS = ["tusharneymar8@gmail.com", "apaarmsd@gmail.com"];

callbacks: {
  signIn({ user })   { return ADMIN_EMAILS.includes(user.email); }      // login gate
  session({ session }) { session.user.isAdmin = ADMIN_EMAILS.includes(session.user.email); return session; }
}
```

Consequences (all are current facts):

1. **Only the two allowlisted emails can sign in at all.** The `signIn` callback
   returns `false` for everyone else, so a non-admin Google user is rejected at
   login (NextAuth returns an `AccessDenied` error). There is no "logged-in
   regular user" concept.
2. **`/admin` page** (`app/admin/page.js`) renders three states:
   - loading → spinner;
   - no session → Google sign-in card;
   - session but `!isAdmin` → "Access Denied" card (in practice unreachable,
     since non-admins can't get a session).
3. **The API is not protected by this gate.** `POST /api/events` performs **no
   session check**, so the allowlist only guards the UI, not the endpoint. See
   [API_SPECIFICATION.md](API_SPECIFICATION.md) and [SECURITY.md](SECURITY.md).
4. **Changing admins requires a code change and redeploy** (editing the array) —
   this directly contradicts the V2 goal of managing roles without touching code.

## Environment variables (from `env.example`)

```
MONGODB_URI=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
```

## Gaps vs. V2 requirements

The master spec requires:
- **Google login AND email/password login**, with the **same email mapping to a
  single user account** regardless of method (account linking).
- **Multiple roles per user.**
- Admin-managed roles/permissions (no code changes).
- A **Developer** role with unrestricted access (developer console).

None of this exists today. The current model is a two-email allowlist with a
single implicit "admin" capability.

## Proposed V2 model (not yet implemented)

See [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md) and [SCHEMA_DESIGN.md](SCHEMA_DESIGN.md)
for detail. In brief:

- Persist users in **PostgreSQL (Neon) via the NextAuth Prisma adapter**; key
  accounts by **email** so Google and Credentials sign-ins resolve to one `User`.
- Add a **Credentials** provider (hashed passwords, e.g. bcrypt/argon2) alongside
  Google, with verified-email account linking.
- Introduce `Role`, `Permission`, and `Membership` so a user can hold multiple
  roles (e.g. "Academic Secretary" + "Club Coordinator"), scoped per academic
  year and per organization unit.
- Enforce authorization in a **server-side middleware/util** shared by all
  protected route handlers — never trust the client.
- Seed an initial Developer/Super-Admin from env (bootstrap), then manage all
  other roles through the Admin Panel.

> **Security action required now:** the credentials leaked in `README.md` and the
> hardcoded admin emails are both liabilities. See [SECURITY.md](SECURITY.md).
