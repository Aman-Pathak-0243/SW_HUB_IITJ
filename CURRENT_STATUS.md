# Current Status

**Last updated:** 2026-06-28
**Session:** 1 of 10 — **COMPLETE** (Analysis + Documentation + Architecture)
**Next session:** 2 — Database + Prisma + RBAC + Authentication
**Branch:** `portal-v2`

> New session? Read [docs/SESSION_PROTOCOL.md](docs/SESSION_PROTOCOL.md) first,
> then this file, [NEXT_TASK.md](NEXT_TASK.md), [TODO.md](TODO.md),
> [KNOWN_ISSUES.md](KNOWN_ISSUES.md), [docs/CHANGELOG.md](docs/CHANGELOG.md).

## What is done (Session 1)

- **Full repo analysis** + complete `/docs` (as-is + target).
- **Security scanning** — gitleaks CI + history-purge runbook (secret rotation is
  owner-owned).
- **Verified backup** — source + `/public` + full Mongo dump (`events` 3 +
  `queries` 1), `VERIFY: PASS`. M1 complete.
- **Database pivot decided & set up** — V2 = **PostgreSQL (Neon) + Prisma**
  (replacing MongoDB/Mongoose). Neon `DATABASE_URL` is in git-ignored `.env.local`.
- **Verified schema design** — [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md):
  33 normalized tables, ER diagram, reasoning, covering all 9 required
  capabilities. Designed + adversarially verified by a multi-agent workflow.
- **New docs:** SCHEMA_DESIGN, DATA_MIGRATION_REPORT, DECISION_LOG,
  SESSION_PROTOCOL; MILESTONE_PLAN restructured around the 10 sessions.
- **No application code changed.** V1 still runs on Mongoose until Session 2.

## What is NOT done yet

- No `prisma/schema.prisma`, no migrations, no DB tables created (that's Session 2).
- Owner-owned: rotate/remove the V1 leaked secrets in `README.md`
  ([docs/runbooks/git-history-purge.md](docs/runbooks/git-history-purge.md)).

## Key facts for the next session

- Target schema is authoritative in [docs/SCHEMA_DESIGN.md](docs/SCHEMA_DESIGN.md)
  — implement it in Prisma exactly; honor the "Prisma/Postgres/Neon notes".
- Neon needs a **direct (unpooled) `DIRECT_URL`** for `prisma migrate` — get the
  non-pooler host from the Neon dashboard (see `.env.local` comments).
- Run `npm install` first (no `node_modules` committed). The `mongodb` driver was
  installed `--no-save` in Session 1 for the backup only.
- Open design questions to confirm are listed at the end of SCHEMA_DESIGN.md.

## Next action

See [NEXT_TASK.md](NEXT_TASK.md).
