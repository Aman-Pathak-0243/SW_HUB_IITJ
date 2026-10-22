# Images & media

How an image gets onto the site, where it should live, and how to stop Cloudinary
filling up. Written for whoever maintains the portal — editors for the first
section, operators for the rest.

## The short version

- Attaching an image in the admin panel offers two choices. **Prefer "from the
  site"** — it costs nothing. Use **Upload** only for an image that is not in the
  repository yet.
- New static images go in `public/images/<people|clubs|councils|campus|brand>/`.
  See [`public/images/README.md`](../public/images/README.md).
- When Cloudinary gets full: `npm run media:export`, commit the files under
  `public/`, re-run with `--repoint`, then clear the Cloudinary account.

## Attaching an image to content

Announcements, Flagship Events and Wall of Fame entries all have an **optional**
image field. Leave it empty and the page renders without one — nothing breaks.

The picker has two modes:

**“Choose from the site”** searches every image already shipped in `public/` by
filename, as you type. Picking one registers a `local` media asset pointing at
that path. No upload, no Cloudinary credit, and if two announcements use the same
image they share one library entry rather than creating a duplicate.

**“Upload new”** sends the file to Cloudinary (10MB ceiling, images only) and
attaches the result. This is the only way to add an image at runtime: the app
server's `public/` folder is rebuilt from git on every deploy, so a file written
there by the running app would not survive.

Both paths end at the same `media_asset` table, so nothing downstream cares which
was used.

### Why the forms look the way they do

The three editors render from a widget spec
([`lib/cms/field-widgets.mjs`](../lib/cms/field-widgets.mjs)) rather than one text
box per database column. Each field gets the control that fits it — a text area
for the body, a checkbox for a boolean, a date picker for a date, the image picker
for a media reference — and the fields an editor rarely touches (publish windows,
the Wall of Fame's raw block JSON) sit behind an **Advanced** disclosure.

Nothing is removed, only demoted: every payload column still has a control, and
`tests/field-widgets.test.mjs` asserts that against the live content-type
registry, so adding a column without placing it in the spec fails the test suite
instead of quietly becoming uneditable.

To change what a form shows, edit `SPECS` in `lib/cms/field-widgets.mjs`. No
per-type screens exist, so this is the only place to touch.

## Where static images live

```
public/images/
  people/      portraits — ADs, secretaries, coordinators, PICs, staff
  clubs/       club logos and banners
  councils/    council logos
  campus/      hostels, messes, buildings, venues
  brand/       emblem, icons, decorative SVG
  uploads/     files pulled back from Cloudinary by media:export
```

Name files the way someone would search for them — `nitin-joshi.jpg`, not
`IMG_4821.jpg` — because the picker's search is over the filename. Compress
before committing; ~800px on the long edge at quality 82 is ample for a portrait
and usually lands under 100KB.

### The legacy pile

`public/` still has ~105 images at its top level from the V1 site, plus the dated
intake batch in `public/images-2026-27-v1/`. They were deliberately **not** sorted
into the folders above. Only 42 of them are referenced from code; the rest are
reachable only through `media_asset.original_path` rows in the live database (the
Session-7 `/public` inventory), so moving `/coding.jpg` would break a row that
nothing in the repository mentions.

Sorting them is therefore a two-part operation — move the file *and* re-point the
matching `media_asset` row — and belongs in its own change with the database in
front of you. `images-2026-27-v1/` should stay as it is regardless: it is a dated
record of one intake round and its paths are spread across `lib/org/data/*`.

## Draining Cloudinary

Cloudinary is a fixed credit budget, and browser uploads fill it with images that
will never change again. `scripts/export-cloudinary.mjs` moves them to static
hosting.

```bash
npm run media:export -- --dry-run     # what would come down; writes nothing
npm run media:export                  # download + manifest → exports/cloudinary/<ts>/
```

The export writes `manifest.json` and `manifest.csv` beside the files, carrying
each asset's Cloudinary public id, URL, dimensions, bytes, alt text and a count of
the content rows referencing it. That manifest is the provenance record — once a
row is re-pointed, its Cloudinary identity is gone from the database.

To actually free the credits:

```bash
# 1. download straight into the static tree
npm run media:export -- --into public/images/uploads --dry-run
npm run media:export -- --into public/images/uploads

# 2. commit the files
git add public/images/uploads && git commit -m "Move Cloudinary assets to static hosting"

# 3. re-point the database rows at the static paths
npm run media:export -- --into public/images/uploads --repoint

# 4. deploy, confirm the pages render, and ONLY THEN delete from Cloudinary
```

`--repoint` is what makes step 4 safe. It sets each row to
`storage_provider='local'` with `url`/`original_path` at the static path and clears
`cloudinary_public_id`, so `resolveDeliveryUrl` returns the static path. Without
it the files exist in two places but the database still points at Cloudinary, and
clearing the account breaks every image on the site.

It refuses to run unless `--into` lands inside `public/`, and it reports every row
before writing. Other flags: `--limit N`, `--include-archived`.

## Permissions

| action                        | permission     |
| ----------------------------- | -------------- |
| search `public/` in the picker | `media.read`   |
| pick a static image           | `media.upload` |
| upload to Cloudinary          | `media.upload` |
| edit media metadata           | `media.update` |
| archive a media asset         | `media.delete` |

Uploads are rate limited to 12/minute per account, separately from the 60/minute
pool the other admin actions share, because each one costs a Cloudinary credit.

## Env

Uploads need the Cloudinary account configured in `.env.local`:

```
CLOUDINARY_CLOUD_NAME=...
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
CLOUDINARY_UPLOAD_FOLDER=iitj-portal   # optional, this is the default
```

Without them the picker's **Upload** tab returns a 503 explaining that uploads are
not configured — and says that choosing an image already in `public/` still works,
which needs no credentials at all. Delivery of existing Cloudinary URLs is
unaffected either way; only new uploads need the keys.

## Files

| path                                        | what it does                                      |
| ------------------------------------------- | ------------------------------------------------- |
| `lib/cms/field-widgets.mjs`                 | which widget each payload field gets              |
| `lib/media/static-index.mjs`                | the cached walk of `public/` + search ranking      |
| `lib/media/service.mjs`                     | `registerStaticImageAsset`, `uploadImageAsset`     |
| `lib/media/cloudinary.mjs`                  | signing, URL building, `uploadBufferToCloudinary`  |
| `app/admin/_components/MediaPicker.jsx`     | the picker UI                                      |
| `app/api/admin/media/static/route.js`       | `GET` — debounced search over `public/`             |
| `app/api/admin/media/upload/route.js`       | `POST` — the one multipart admin route              |
| `scripts/export-cloudinary.mjs`             | download + manifest + `--repoint`                  |
| `public/images/README.md`                   | the folder convention, next to the folders         |
