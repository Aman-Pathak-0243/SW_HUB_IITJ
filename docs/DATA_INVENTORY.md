# Data Inventory (As-Is)

This is an exhaustive, factual inventory of all **hardcoded data** and **media
assets** in the current codebase. It is the basis for the V2 data migration
(see [MIGRATION_PLAN.md](MIGRATION_PLAN.md)). Academic year of this data: **2025–26**.

> **Why this matters:** In V2, virtually all of the data below moves out of source
> code and into the database/CMS so administrators can edit it without code changes.
> This inventory is also the checklist for the pre-migration backup.

## Summary

| Domain | Where | Items (approx) | Storage today |
|---|---|---|---|
| Councils | Header nav + Clubs pages | 4 (General, Academic, Cultural, Sports) | Hardcoded |
| Clubs | `app/Clubs/*/page.jsx` | 30 total | Hardcoded |
| Club coordinators | `app/Clubs/*/page.jsx` | ~36 | Hardcoded |
| Professors-in-Charge (PICs) | `app/Clubs/*/page.jsx` | ~19 | Hardcoded |
| Club vision/mission | `app/Clubs/*/page.jsx` | per club | Hardcoded |
| Hostels (+ wardens, secretaries, caretakers, wellness wardens) | `app/hostels/page.jsx` | 6 hostels | Hardcoded |
| Messes + timings + committee | `app/messes/page.jsx` | 5 messes, 16 committee | Hardcoded |
| Team directory | `app/Team/page.jsx` | ~37 people | Hardcoded |
| Flagship events | `app/Flagship-events/page.jsx` | 6 | Hardcoded |
| Contact info | `app/Contact-Us/page.jsx`, `Footer.jsx` | n/a | Hardcoded |
| Home page content | `app/page.js` | hero, dean msg, quotes | Hardcoded |
| Events (announcements) | MongoDB `Event` collection | dynamic | **Database** |

## Councils & Clubs

The four councils are defined implicitly by the four pages under `app/Clubs/`
and the navigation in `Header.jsx`. Each council page is **static** and holds its
own arrays.

### Academic Council — `/Clubs/Academic` (5 clubs)
- `clubs[]` — fields: `name`, `image`, `link` (Instagram). 5 items
  (Coding, SAE, Robotics, Astronomy/"Astriaza", Fintech).
- `coordinators[]` — fields: `name`, `photo`, `club`, `role?`. 5 items.
- `PICs[]` — fields: `name`, `photo`, `club`, `profile` (faculty URL). 5 items.
- `clubVisionMission{}` — per club: `vision` (string), `mission` (string[]).
- `associateDean{}` — `{name, photo, post, profile}` (Dr. Devi Lal).
- `secretary{}` — `{name, photo, post}` (Aman Pathak, Academic Secretary).
- `heroImages[]` — 4 Cloudinary URLs.

### Cultural Council — `/Clubs/Cultural` (8 clubs)
- `clubs[]` (8): Photography, Literary, Dance, Drama, Music, Fine Arts, Anime, Cooking.
- `coordinators[]` (8), `PICs[]` (8), `clubVisionMission{}` (8), `secretary{}` (Saumya Gupta).

### General Council — `/Clubs/General` (6 clubs)
- `clubs[]` (6): Nature & Adventure (NAC), Kritash, RE4M, MESH, EBSB, Wellbeing.
- `coordinators[]` (8 — multiple per club), `PICs[]` (6), `clubVisionMission{}` (6),
  `associateDean{}` (Dr. Devi Lal), `secretary{}` (Ayush Sharma, General Secretary).

### Sports Council — `/Clubs/Sports` (11 clubs)
- `clubs[]` (11): Athletics, Badminton, Basketball, Cricket, Chess, Football,
  E-Sports, Table Tennis, Volleyball, Weightlifting, Indoor.
- `coordinators[]` (15 — multiple per club), `clubVisionMission{}` (11),
  `secretary{}` (Sandeep Moond, Sports Secretary).
- Leadership rendered inline (not arrays): Dr. Shiva S (Associate Dean, Sports),
  Dr. Deepak Yadav (FIC Inter-Sports), Dr. Abhishek Kumar (FIC Intra-Sports),
  Mr. Raj Srivastava (Assistant Sports Officer), Sandeep Moond.

**Common shape across club pages (de-facto schema):**
```
Club        = { name, image, link(Instagram) }
Coordinator = { name, photo, club, role? }
PIC         = { name, photo, club, profile(facultyURL) }
VisionMission = { [clubName]: { vision: string, mission: string[] } }
Person(lead)  = { name, photo, post, profile? }
```
Each club page also embeds a `PdfSlideshow` (club activities PDF) and a Google
Drive "View in Detail" link.

## Hostels — `/hostels` (6 hostels)

`hostels[]` — 6 items: Anz (Boys), Fulgar (Boys), Egret, Braeg, Dedhar, Canary.
Fields per hostel:
```
{
  name, image,
  warden:        { name, photo, email },
  secretary:     { name, photo, email },
  caretaker:     { name, photo, email },
  extraCaretaker?: { name, photo, email },
  wellnessWarden?: { name, photo, phone, email },
  attendant?:    { name, photo, phone }
}
```
- ~47 Cloudinary images (buildings + people). Includes a clickable "AD Hostel
  Affairs" card linking to a faculty profile.
- Embeds `PdfSlideshow` (Hostel Infrastructure PDF) + Google Drive link.
- Real institutional emails appear hardcoded (e.g. `warden.fulgar@iitjammu.ac.in`,
  `hsec.boys@iitjammu.ac.in`).

## Messes — `/messes` (5 messes)

- `messes[]` (5) — `{ name, location, capacity, image }`
  (Annapurna 2nd Floor, Egret, etc.).
- `commonTimings[]` (4) — `{ icon, label, time }` (Breakfast/Lunch/Snacks/Dinner).
- `committee[]` (16) — `{ title, name, img }` (AD Mess Management, mess wardens, etc.).
- ~21 Cloudinary images. Embeds `PdfSlideshow` (Mess Infrastructure PDF) + Drive link.

## Team directory — `/Team` (~37 people, 7 groups)

Static, rendered from several inline arrays:
- **Dean** (single): Dr. Anup Shukla → faculty profile link.
- **Associate Deans** (4): `{role, name, img, profile}`.
- **Wardens** (5): `{name, hostel, img, profile}`.
- **Assistant Registrar** (single): Dr. R P Prajapat (`/assistant registrar final.png`).
- **Administrative staff** (4): `{name, role, img}`.
- **Caretakers** (7): `{name, hostel, img}`.
- **Student Affairs Council** (9): `{role, name, img}` (General/Academic/PG
  Academic/Cultural/Hostel Boys+Girls/Sports/Wellness/Mess secretaries).
- **Website developers** (2): Tushar Singh, Apaar Gupta.
- ~35 images (29 Cloudinary, 6 local).

## Flagship events — `/Flagship-events` (6)

`flagshipEvents[]` — `{ title, image, description }`:
Anhad (techno-cultural), Nexus (technical), Convoquer (inter-college sports),
Pragyaan (academic/research), Udyamitsav (entrepreneurship), Pravaah (inter-branch sports).
All 6 images are **local** (`/anhad.jpg`, `/nexus.jpg`, …).

## Contact & footer (hardcoded)

- **Contact-Us:** Dr. R. P. Prajapat (Assistant Registrar, Student Affairs),
  `ar.sw@iitjammu.ac.in`, office address (Jagti Campus, Jammu – 181221), Google
  Maps embed, social links (LinkedIn / Twitter-X / Instagram of IIT Jammu).
- **Footer:** HOS Student Affairs `0191-257-0286`, Student Welfare Office
  `0191-257-0697`, copyright "© 2026 IIT Jammu", developer/credits line.

## Home page content (hardcoded) — `/`

- `heroImages[]` — 6 entries (5 local `/heroN.jpg` + 1 Cloudinary).
- `quotes[]` — 5 motivational quotes (auto-rotating).
- Vision & Mission section, "Message from Dean" (Dr. Anup Shukla, photo on
  Cloudinary, `dean.sw@iitjammu.ac.in`, office room 5041 Pushkar Building),
  welcome marquee.

## Media assets

### Local `/public` (105 files, ~74 MB)
- 100 raster images (`.jpg/.jpeg/.png/.JPG`), 5 SVGs (`file/globe/next/vercel/window`).
- Naming is human-readable with spaces (e.g. `coding coordinator.jpg`,
  `assistant registrar final.png`) — works but is fragile for URLs.
- Per the master spec, these **must not be moved** during V2; a later Admin Media
  Migration Tool will upload them to Cloudinary and update references.

### Cloudinary (remote)
Two accounts are referenced in code:
- `res.cloudinary.com/dveqd1vm1/…` — most people photos.
- `res.cloudinary.com/dabviijid/…` — logos, some photos, the infrastructure PDFs,
  and an animated Indian-flag GIF in the header.

PDFs hosted on Cloudinary and rendered via `PdfSlideshow`:
- `…/Hostel_Infrastructure_Details_*.pdf`
- `…/Mess_Infrastructure_Details_*.pdf`
- `…/Sports_Infrastructure_Details_*.pdf`
- `…/Student_Club_Activities_*.pdf`

`next.config.mjs` whitelists `res.cloudinary.com` (and Unsplash, unused).

## Implications for V2 (summary)

- **Everything except `Event`** is hardcoded and must be modeled and migrated.
- The de-facto schemas above (Club, Coordinator, PIC, Person, Hostel, Mess,
  Committee, TeamMember, FlagshipEvent) directly inform the V2 data model in
  [TARGET_ARCHITECTURE.md](TARGET_ARCHITECTURE.md).
- Personal data (names, emails, phones, photos) is present and must be handled
  per [SECURITY.md](SECURITY.md) and backed up before migration.
