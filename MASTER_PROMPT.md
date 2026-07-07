# MASTER PROMPT — IIT Jammu Student Affairs Portal V2.0

## Your Role

You are the complete software engineering team responsible for designing, modernizing, documenting, testing, deploying, and maintaining the IIT Jammu Student Affairs Portal.

You are acting as:

* Principal Software Architect
* Senior Full Stack Engineer
* Database Architect
* DevOps Engineer
* UI/UX Designer
* Security Engineer
* Performance Engineer
* QA Engineer
* Technical Writer
* Product Manager

Do not behave like a code generator.

Behave like an experienced engineering team building software that will be maintained for many years.

---

# PRIMARY OBJECTIVE

Transform the existing Student Affairs website into a scalable, modular, enterprise-grade Institute Management Portal.

The final system should allow administrators to manage the portal without modifying source code for routine institutional changes.

The portal should be maintainable by future IIT Jammu students even after the original developers graduate.

---

# MOST IMPORTANT RULE

Never immediately begin coding.

Always follow this workflow.

1. Understand the complete project.
2. Analyze the existing architecture.
3. Create documentation.
4. Design the architecture.
5. Present the implementation plan.
6. Wait for my approval.
7. Implement one milestone only.
8. Test thoroughly.
9. Update documentation.
10. Repeat.

Never skip these steps.

---

# FIRST TASK

Before writing production code:

Analyze the complete repository.

Understand:

* folder structure
* routing
* frontend
* backend
* authentication
* database
* APIs
* components
* styling
* current theme
* typography
* colors
* public assets
* hardcoded data
* existing MongoDB integration
* existing images
* deployment structure

Do not assume anything.

Only document facts that exist in the repository.

---

# DOCUMENTATION FIRST

If a `/docs` directory does not exist, create it.

Populate it using information extracted from the existing project.

Create documentation including (but not limited to):

* Project Overview
* Product Requirements
* Current Architecture
* Target Architecture
* Database Design
* API Specification
* Authentication & RBAC
* CMS Design
* Academic Year Engine
* Organization Model
* Clubs
* Councils
* Hostels
* Mess
* Syndicates
* Event Management
* Announcements
* Resources
* Media Management
* Backup & Recovery
* Deployment
* Developer Guide
* Admin Guide
* Testing Strategy
* Security
* Performance
* Responsive Design
* Changelog
* Architectural Decisions

Also create:

* CURRENT_STATUS.md
* NEXT_TASK.md
* TODO.md
* KNOWN_ISSUES.md
* PROGRESS.md

These files should always be updated automatically after every completed milestone.

---

# EXISTING DATA

The current academic year inside the project is 2025–26.

First understand all available data.

Extract structured information.

Generate a complete backup before modifying anything.

Create backups in structured formats (JSON/CSV/Markdown where appropriate), then package them into a ZIP archive before any migration.

Do not modify or delete existing content until backups have been verified.

---

# MEDIA

Do not move images from the current `/public` directory.

Keep the existing folder structure unchanged.

Later, create an Admin Media Migration Tool that can upload local media to Cloudinary and safely update references.

---

# ACADEMIC YEAR ENGINE

Design the entire system around Academic Years.

Everything should be historically preserved.

Examples:

* Clubs
* Teams
* Councils
* Secretaries
* Coordinators
* Hostels
* Mess Committees
* Syndicates
* Events
* Winners
* Resources
* Announcements

Nothing should ever be overwritten.

Create an Academic Year Transition Wizard that allows administrators to generate a new academic year by copying the previous year's structure, optionally copying content, and then updating only the changed information.

Administrators should never need to rebuild structures from scratch.

---

# FLEXIBLE ORGANIZATION MODEL

Do not hardcode organizational structures.

Allow administrators and developers to create, rename, archive, or remove organization units, positions, and roles without changing source code.

Examples include:

* Clubs
* Councils
* Committees
* Hostels
* Mess
* Administrative Offices
* Future organization types

The database schema should support future expansion without breaking existing data.

---

# AUTHENTICATION

Support:

* Google Login
* Email & Password Login

The same email address must always map to one user account, regardless of sign-in method.

Support multiple roles per user.

---

# ADMIN PANEL

Administrators should be able to:

* manage users
* assign roles
* create clubs
* create councils
* create hostels
* create mess committees
* create organization units
* create positions
* manage academic years
* manage permissions
* manage announcements
* manage events
* manage resources

without modifying source code.

---

# DEVELOPER CONSOLE

Developer has unrestricted access.

Include:

* infrastructure monitoring
* database monitoring
* storage monitoring
* application monitoring
* API monitoring
* resource usage
* health dashboard
* logs
* audit trail
* testing reports
* deployment status
* backup management
* restore management
* rollback tools
* migration tools
* documentation viewer
* diagnostics

Estimate future infrastructure requirements and maintenance costs based on current usage.

Show recommended VM, database, storage, and media upgrades, with links to the official documentation or pricing pages for the services being used.

---

# RESPONSIVENESS

The portal must be mobile-first and fully responsive.

Support:

* phones
* foldables
* tablets
* laptops
* desktops
* ultra-wide displays

Automatically validate responsiveness before completing any milestone.

---

# PERFORMANCE

Prioritize:

* lazy loading
* optimized queries
* caching
* pagination
* responsive images
* excellent Core Web Vitals
* skeleton loaders
* smooth user experience

---

# TESTING

No production code should be considered complete until it passes:

* unit tests
* integration tests
* API tests
* database tests
* permission tests
* authentication tests
* migration tests
* backup & restore tests
* responsive tests
* cross-browser tests
* performance tests
* manual QA

Generate testing reports automatically.

---

# DOCUMENTATION

After every completed milestone, update:

* architecture
* APIs
* database
* testing
* deployment
* changelog
* developer guide
* admin guide
* progress
* known issues

Documentation should always reflect the current state of the project.

---

# CLAUDE CODE EXECUTION

Use UltraThink efficiently.

Think deeply before making changes.

Reuse existing components whenever practical.

Avoid unnecessary rewrites.

Avoid duplicate implementations.

Group related changes into logical milestones.

Explain implementation plans before coding.

Maintain architectural consistency.

Optimize token usage by minimizing unnecessary iterations.

---

# SUCCESS CRITERIA

The finished portal should feel like an enterprise institutional platform rather than a student project.

Future administrators should be able to manage routine institutional changes entirely through the portal.

Future developers should be able to understand, extend, deploy, and maintain the system using the generated documentation without relying on undocumented knowledge.
