# Developer CLI (`npm run cli`)

A single command-line entry point for operating the portal — user & role management,
permission overrides, plugin/feature-flag toggles, academic-year administration, and
read-only system/audit observability.

It is the **operator counterpart to the admin panel**: it calls the *same* audited
service functions the UI calls ([lib/users/admin.mjs](../lib/users/admin.mjs),
[lib/platform/flags.mjs](../lib/platform/flags.mjs),
[lib/year/context.mjs](../lib/year/context.mjs), [lib/devconsole/](../lib/devconsole/)),
so validation, business rules, and `audit_log` writes are identical to clicking through
the admin screens — there is no second, divergent code path.

- **Script:** [scripts/dev-cli.mjs](../scripts/dev-cli.mjs)
- **npm script:** `cli` → `dotenv -e .env.local -- node scripts/dev-cli.mjs`

---

## Authorization model (read this first)

This is an **operator tool**, not an end-user surface. It runs with the database
credentials in `.env.local`, so it acts as a **`system` actor** — exactly like
[prisma/seed.mjs](../prisma/seed.mjs) and [scripts/devconsole.mjs](../scripts/devconsole.mjs).

A `system` actor **bypasses every RBAC permission check**. Each guarded service
short-circuits on `actor.system`:

- `assertActorPermission` (all `*.read/create/update/...` gates)
- `assertCanSetDeveloper` (the `is_developer` flag guard)
- the `grantRole` privilege-escalation guard (assigning `developer` / `super_admin`)
- `setFeatureFlag`'s developer-only gate

For **audit attribution**, the CLI also resolves a real developer and passes their
`userId`, so `audit_log` rows are attributed to a developer rather than `NULL`. It
resolves the actor in this order:

1. `--as=<email>` (must be a user that exists)
2. `BOOTSTRAP_DEVELOPER_EMAIL` from `.env.local`
3. the first `is_developer = true` user

> **Anyone who can run this script already has full database access. Treat it as root.**
> It deliberately ignores roles/permissions — that is the point of an operator CLI.

---

## Usage

```bash
npm run cli -- <command> [--flag=value] [--bool-flag]
npm run cli -- help
```

- `--key=value` sets a value; bare `--flag` is a boolean `true`.
- Quote values with spaces or shell-special characters: `--name="Aman Pathak"`,
  `--password='S3cret!pass'`.
- The `--` after `npm run cli` is required so npm forwards the args to the script.
- Structured results print as JSON; mutations print a `✓` confirmation line.

Add `--verbose` to print which developer the action is attributed to.

---

## Command reference

### Users

| Command | Flags | Notes |
|---|---|---|
| `user:list` | `[--status=] [--search=] [--role=<roleKey>] [--take=]` | `--role` filters by an assigned role/category |
| `user:get` | `--email=` \| `--id=` | full profile + assignment history |
| `user:create` | `--email= [--name=] [--password=] [--role=<key>] [--developer] [--status=] [--no-must-change]` | sets a password if given; `--role` also grants that role |
| `user:update` | `--email=`\|`--id=` `[--name=] [--developer=true\|false]` | profile + developer flag |
| `user:set-password` | `--email=`\|`--id=` `--password= [--no-must-change]` | min 8 chars |
| `user:status` | `--email=`\|`--id=` `--status=active\|suspended\|invited\|disabled` | non-active blocks login |
| `user:reset-password` | `--email=`\|`--id=` | forces a change on next login |
| `user:delete` | `--email=`\|`--id=` `--yes` | **hard delete**; cascades role assignments + auth accounts |
| `user:import-csv` | `--file=<path>` | CSV columns: `email,name` |

Notes:
- A set password forces a first-login change **unless** you pass `--no-must-change`
  (use that for accounts you want to log in directly, e.g. a bootstrap developer).
- `--developer` mints an `is_developer` account (grants-all + the only kind that can
  toggle plugins). The system actor is allowed to do this.

### Roles

| Command | Flags | Notes |
|---|---|---|
| `role:list` | `[--all]` | `--all` includes archived roles |
| `role:get` | `--key=` \| `--id=` | role + its permission keys |
| `role:create` | `--key= --name= [--description=] [--permissions=a,b,c]` | non-system role; `grantsAll` is never settable |
| `role:update` | `--key=`\|`--id=` `[--name=] [--description=] [--permissions=a,b,c] [--status=]` | system roles: description only |
| `role:grant` | `--email=`\|`--id=` `--role=<key> [--unit=<lineageKey>] [--year=<label\|id>]` | scoped grant; idempotent |
| `role:revoke` | `--assignment=<id>`  *or*  `--email= --role=<key>` | soft revoke (sets `revoked_at`; history preserved) |

### Permissions / per-user overrides

| Command | Flags | Notes |
|---|---|---|
| `perm:list` | — | the full permission catalog |
| `perm:overrides` | `--email=`\|`--id=` | a user's grant/deny overrides |
| `perm:override` | `--email=`\|`--id=` `--mode=grant\|deny --permission=<key> [--unit=] [--year=] [--reason=]` | deny wins over grant |
| `perm:override:remove` | `--id=<overrideId>` | hard delete (audited) |

### Plugins (developer-controlled feature flags)

| Command | Flags | Notes |
|---|---|---|
| `plugin:list` | — | all feature flags + state |
| `plugin:status` | — | is the member platform on? |
| `plugin:enable` | `[--key=member_platform]` | turns the plugin on |
| `plugin:disable` | `[--key=member_platform]` | reverts to legacy (Sessions 1–10) behavior |

Known plugin keys: `member_platform`. With it **on**, auth is email+password only and
the member pages / account-request / forced-password-change flows activate; **off**
restores the original portal behavior.

### Academic years

| Command | Flags | Notes |
|---|---|---|
| `year:list` | `[--status=] [--counts]` | `--counts` adds per-year entity counts |
| `year:current` | — | the live current year |
| `year:create` | `--label=YYYY-YY --start=YYYY-MM-DD --end=YYYY-MM-DD [--status=]` | created non-current |
| `year:set-current` | `--label=`\|`--id=` | promotes a year (locked years rejected) |

### Console / observability (read-only)

| Command | Flags | Notes |
|---|---|---|
| `status` | — | DB connectivity, migrations, transitions, media migration |
| `reports` | — | testing + cost reports |
| `audit` | `[--action=] [--entity=] [--take=]` | recent audit log |
| `audit:stats` | `[--action=] [--entity=]` | audit aggregates |

---

## Recipes

**Promote yourself to the all-powerful developer ("final boss") and log in directly:**

```bash
npm run cli -- user:create --email=amanpathakiitj@gmail.com --name="Aman Pathak" \
  --password='ChooseAStrongOne!' --developer --no-must-change
```

(If the account already exists, use `user:update --developer=true` + `user:set-password --no-must-change`.)

**Create an admin (super_admin) account:**

```bash
npm run cli -- user:create --email=amanpathak8926@gmail.com --name="Aman Pathak" \
  --password='ChooseAStrongOne!' --role=super_admin --no-must-change
```

**Remove a user (hard delete):**

```bash
npm run cli -- user:delete --email=someone@example.com --yes
```

**Grant / revoke a role:**

```bash
npm run cli -- role:grant  --email=staff@iitj.ac.in --role=staff
npm run cli -- role:revoke --email=staff@iitj.ac.in --role=staff
```

**Scope a coordinator to one club for one year:**

```bash
npm run cli -- role:grant --email=coord@iitj.ac.in --role=coordinator \
  --unit=<orgUnitLineageKey> --year=2025-26
```

**Add/remove a single permission for one person (override):**

```bash
npm run cli -- perm:override --email=editor@iitj.ac.in --mode=grant --permission=content.publish --reason="festival week"
npm run cli -- perm:override --email=editor@iitj.ac.in --mode=deny  --permission=content.delete
```

**Turn the member platform on / off:**

```bash
npm run cli -- plugin:enable
npm run cli -- plugin:disable
```

**Reset someone's password / force a change:**

```bash
npm run cli -- user:set-password --email=x@iitj.ac.in --password='Temp12345'   # forces change next login
npm run cli -- user:reset-password --email=x@iitj.ac.in                         # admin-triggered reset
```

**Suspend / reactivate an account:**

```bash
npm run cli -- user:status --email=x@iitj.ac.in --status=suspended
npm run cli -- user:status --email=x@iitj.ac.in --status=active
```

---

## Role reference

Seeded in [lib/rbac/permissions.mjs](../lib/rbac/permissions.mjs):

| Role key | What it is |
|---|---|
| `developer` | unrestricted (`grants_all` + `is_developer`); only role that can toggle plugins |
| `super_admin` | all permissions except `dev.console` / `backup.*` / `media.migrate` |
| `content_editor` | create/edit/publish content + upload media |
| `org_manager` | manage org units, positions, appointments |
| `viewer` | read-only |
| `normal_user` | member account; no back-office permissions |
| `co_coordinator` | draft unit content (no publish) |
| `coordinator` | full content lifecycle + media for a unit |
| `secretary` | coordinator + structure management |
| `staff` | central content/announcements + sees the account/password request queue |
| `admin` | all permissions except `dev.console` / `backup.*` / `media.migrate` |

> The fastest path to a god-mode login is an `is_developer` account
> (`user:create --developer`), which short-circuits to all permissions in
> [lib/rbac/authorize.mjs](../lib/rbac/authorize.mjs) regardless of role assignments.

---

## Troubleshooting

- **`DB not ready ... waking Neon, retrying`** — normal cold-start; Neon's serverless
  compute is waking. The CLI retries up to 12× (5s apart).
- **`Only a developer can ...`** — should not happen via this CLI (system actor bypasses).
  If you see it, you are likely calling a service directly, not through the CLI.
- **`An account with that email already exists.`** — use `user:update` / `user:set-password`
  instead of `user:create`.
- **`Unknown command`** — run `npm run cli -- help` for the exact spelling (commands use
  a `group:action` form, e.g. `user:create`).
- **Password rejected** — minimum length is 8 characters (`MIN_PASSWORD_LENGTH`).
