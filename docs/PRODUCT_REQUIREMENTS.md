# Product Requirements (V2.0)

> **Status:** Proposed requirements derived from `MASTER_PROMPT.md`. Pending
> approval. Nothing here is implemented yet.

## Vision

Transform the Student Affairs website from a largely hardcoded marketing site
into a **scalable, modular, enterprise-grade Institute Management Portal** that
administrators can manage **without editing source code** for routine changes,
and that future IIT Jammu students can maintain after the original authors
graduate.

## Goals

1. **Admin-managed content** — councils, clubs, hostels, messes, organization
   units, positions, roles, announcements, events, and resources are all editable
   through the portal.
2. **Academic-year history** — every entity is scoped to an academic year and
   **nothing is ever overwritten**; past years remain viewable.
3. **Flexible organization model** — create/rename/archive/remove org units,
   positions, and roles without code changes; schema extensible for future types.
4. **Robust authentication** — Google + email/password, one account per email,
   multiple roles per user.
5. **Operational excellence** — Developer Console with monitoring, logs, audit
   trail, backups, restore, rollback, migration, and cost estimation.
6. **Quality bar** — mobile-first responsiveness, strong Core Web Vitals, and a
   full automated + manual test gate before any milestone is "done".

## Personas

- **Visitor** — browses public content; no login.
- **Administrator** — manages institutional content/structure via Admin Panel.
- **Developer** — unrestricted; operates the Developer Console.
- **Future maintainer** — a student inheriting the project; relies entirely on
  this documentation.

## Functional requirements (summary)

| # | Requirement | Source |
|---|---|---|
| FR-1 | CMS for all currently-hardcoded content | Spec: Admin Panel, Flexible Org Model |
| FR-2 | Academic Year engine + Transition Wizard (copy prior year, edit deltas) | Spec: Academic Year Engine |
| FR-3 | Flexible organization units / positions / roles (no code changes) | Spec: Flexible Org Model |
| FR-4 | Google + email/password auth; one account per email; multi-role | Spec: Authentication |
| FR-5 | Admin Panel (users, roles, clubs, councils, hostels, messes, events, announcements, resources, years, permissions) | Spec: Admin Panel |
| FR-6 | Developer Console (monitoring, logs, audit, backups, restore, rollback, migration, docs viewer, diagnostics, cost estimation) | Spec: Developer Console |
| FR-7 | Admin Media Migration Tool (local `/public` → Cloudinary, update refs) | Spec: Media |
| FR-8 | Backup & restore (JSON/CSV/Markdown → ZIP), verified before any migration | Spec: Existing Data |
| FR-9 | Fix and harden the existing Events feature (auth, contract, validation) | Analysis findings |

## Non-functional requirements

- **NFR-1 Responsiveness:** mobile-first; support phones, foldables, tablets,
  laptops, desktops, ultra-wide. Validate before each milestone completes.
- **NFR-2 Performance:** lazy loading, optimized queries, caching, pagination,
  responsive images, skeleton loaders, excellent Core Web Vitals.
- **NFR-3 Security:** server-side authz everywhere, no secrets in code, validated
  uploads, audit trail. See [SECURITY.md](SECURITY.md).
- **NFR-4 Maintainability:** modular, documented, consistent architecture; reuse
  over rewrite; no duplicate implementations.
- **NFR-5 Testability:** unit, integration, API, DB, permission, auth, migration,
  backup/restore, responsive, cross-browser, performance, manual QA. See
  [TESTING_STRATEGY.md](TESTING_STRATEGY.md).
- **NFR-6 Data preservation:** no destructive change without a verified backup.

## Constraints (from the spec)

- **Do not move images** from `/public`; keep the existing folder structure
  unchanged until the Admin Media Migration Tool handles it later.
- **One milestone at a time.** No coding before approval. Test thoroughly and
  update docs after every milestone.
- **Reuse existing components**; avoid unnecessary rewrites and duplication.

## Success criteria

- The portal feels like an enterprise institutional platform, not a student
  project.
- Administrators can perform routine institutional changes entirely through the
  portal.
- Future developers can understand, extend, deploy, and maintain the system from
  this documentation alone, without undocumented tribal knowledge.

The phased delivery is in [MILESTONE_PLAN.md](MILESTONE_PLAN.md).
