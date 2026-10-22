# public/images — where static images go

Images served straight from this folder cost nothing to deliver (nginx serves
them, `next/image` optimizes and caches them) and never expire. Cloudinary, by
contrast, is a fixed credit budget. So **the default home for an image that is
going to stay on the site is here, not Cloudinary.**

## The folders

| folder       | what belongs in it                                               |
| ------------ | ---------------------------------------------------------------- |
| `people/`    | portraits — Associate Deans, secretaries, coordinators, PICs, staff |
| `clubs/`     | club logos and club banners                                      |
| `councils/`  | council logos and crests                                         |
| `campus/`    | hostels, messes, buildings, facilities, event venues             |
| `brand/`     | the institute emblem, icons, decorative SVGs                     |
| `uploads/`   | images pulled back down from Cloudinary by `npm run media:export` |

Add a new image by dropping it in the right folder and committing it. Nothing
registers it anywhere — the admin image picker finds it by walking this tree, so
it is selectable the moment it is deployed (searchable by filename, so give it a
name a human would type: `nitin-joshi.jpg`, not `IMG_4821.jpg`).

Compress before committing. ~800px on the long edge at quality 82 is plenty for
a portrait or a card and usually lands under 100KB; a straight phone photo is
2–4MB and will be the slowest thing on the page.

## What is NOT here (yet)

`public/` still holds ~105 images at its top level from the V1 site, plus the
dated intake batch in `public/images-2026-27-v1/`. They were deliberately left
in place rather than sorted into the folders above, because **only 42 of them are
referenced from code** — the rest are reachable only through
`media_asset.original_path` rows in the live database (the Session-7 `/public`
inventory). Moving a file like `/coding.jpg` would therefore break a row that
nothing in the repository mentions.

Sorting them is a two-part operation, not a file move: relocate the file *and*
re-point the matching `media_asset` row, the same thing
`scripts/export-cloudinary.mjs --repoint` does for Cloudinary assets. Worth doing
as its own change, with the database in front of you.

`images-2026-27-v1/` stays as it is regardless — it is a dated record of one
intake round, and its paths are all over `lib/org/data/*`.
