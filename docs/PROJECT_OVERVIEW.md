# Project Overview

## What this is

The **IIT Jammu Student Affairs Portal** is the public-facing website of the
Office of Student Affairs (Student Affairs Council / SAC) at the Indian Institute
of Technology Jammu. It presents the institute's student governance structure —
councils, clubs, hostels, messes, the team, flagship events, and announcements —
and provides a small admin surface for publishing events.

This repository is the **V1** of that portal. The objective of **V2.0** is to
transform it from a largely hardcoded marketing site into a scalable, modular,
admin-managed institute portal. See [PRODUCT_REQUIREMENTS.md](PRODUCT_REQUIREMENTS.md)
and [MILESTONE_PLAN.md](MILESTONE_PLAN.md).

## Who it serves

- **Visitors** (students, parents, faculty, public): browse councils, clubs,
  hostels, messes, the team directory, flagship events, and announcements.
- **Administrators** (currently 2 hardcoded Google accounts): publish events via
  `/admin`.
- **Developers / future maintainers**: IIT Jammu students who will inherit the
  project after the original authors graduate.

## Current technology stack (as in `package.json`)

| Layer | Technology | Version (declared) |
|---|---|---|
| Framework | Next.js (App Router) | `^16.2.9` |
| UI library | React / React DOM | `^19.2.7` |
| Styling | Tailwind CSS (v4 via `@tailwindcss/postcss`) | `^4` |
| Animation | `motion` (Framer Motion successor) | `^12.23.24` |
| Icons | `react-icons`, `lucide-react`, `lucide` | `^5.5.0` / `^0.552.0` |
| Auth | `next-auth` | `^4.24.14` |
| Database (V1, being retired) | MongoDB + `mongoose` `^8.19.2` | n/a |
| **Database (V2 target)** | **PostgreSQL (Neon) + Prisma** | added Session 2 |
| PDF rendering | `pdfjs-dist` | `^6.0.227` ⚠️ (see [KNOWN_ISSUES.md](../KNOWN_ISSUES.md)) |
| Media hosting | Cloudinary (external, two accounts) | n/a |
| Lint | ESLint + `eslint-config-next` | `^9` / `15.5.4` |
| Process manager (prod) | PM2 (per `README.md`) | n/a |

> Node module versions above are the **declared** ranges. `node_modules` is not
> committed and was not installed at analysis time, so resolved versions were
> not verified beyond `package-lock.json`.

## Key characteristics of the current system

- **Mostly static content.** Almost all content (clubs, coordinators, faculty,
  wardens, secretaries, hostels, messes, flagship events, team) is **hardcoded**
  directly inside React page components. See [DATA_INVENTORY.md](DATA_INVENTORY.md).
- **One dynamic feature.** Only **Events** are dynamic: stored in MongoDB and
  served by a single `/api/events` endpoint, consumed by the Announcements page.
- **Two media sources.** Local images in `/public` (105 files, ~74 MB) and
  remote images on **Cloudinary** (two accounts: `dveqd1vm1` and `dabviijid`).
- **Admin-gated by email allowlist.** Login is Google-only and restricted to two
  hardcoded email addresses; non-allowlisted users cannot sign in at all.
- **No tests** of any kind exist in the repository.
- **No academic-year model.** Content is implicitly the 2025–26 year with no
  mechanism to preserve history or roll over to a new year.

## Repository facts at a glance

- Tracked files: **143** (of which ~100 are images in `/public`).
- Application source files: ~28 (`app/`, `lib/`, `models/`, `loader/`).
- Single Git branch of interest: `portal-v2` (work branch); `main` is the base.
- Single commit at analysis time: `Initial commit`.
- `MASTER_PROMPT.md` at the root is the governing specification for V2.0.

See [CURRENT_ARCHITECTURE.md](CURRENT_ARCHITECTURE.md) for the full structure.
