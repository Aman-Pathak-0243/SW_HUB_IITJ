#!/usr/bin/env bash
#
# Milestone 1 — Pre-migration backup tool.
#
# Produces a VERIFIED, self-contained backup of the project's content and assets
# BEFORE any migration touches data. Per the master spec: "Do not modify or
# delete existing content until backups have been verified."
#
# What it captures:
#   - public/                  full bytes of all local media (untouched)
#   - source-content/          source files that hold hardcoded content
#   - db/events.json           the MongoDB events dump IF you produced it first
#                              (run scripts/export-events.mjs; see db/README.txt)
#   - public-manifest.csv      path,bytes,sha256 for every /public file
#   - MANIFEST.md              human-readable summary (counts, git SHA, time)
#   - checksums.sha256         checksums of everything in the backup
#
# Then it zips the folder, checksums the zip, and VERIFIES by unzipping to a
# temp dir and re-checking every checksum.
#
# Pure bash + shasum + zip. Re-runnable (idempotent per timestamp). No deps.
#
# Usage:   bash scripts/backup.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TS="$(date +%Y%m%d-%H%M%S)"
SHA="$(git rev-parse --short HEAD 2>/dev/null || echo nogit)"
NAME="backup-${TS}-${SHA}"
OUT="backups/${NAME}"

echo "==> Creating backup: ${NAME}"
mkdir -p "${OUT}/source-content" "${OUT}/db"

# 1) Copy local media (full bytes) — /public is preserved untouched.
echo "==> Snapshotting public/ ..."
cp -R public "${OUT}/public"

# 2) Copy source files that contain hardcoded content + config.
echo "==> Snapshotting source content ..."
for p in app lib models loader \
         package.json package-lock.json next.config.mjs jsconfig.json \
         postcss.config.mjs eslint.config.mjs env.example README.md MASTER_PROMPT.md; do
  [ -e "$p" ] && cp -R "$p" "${OUT}/source-content/" || true
done

# 3) Include the MongoDB dump if it was produced (see scripts/backup-mongo.mjs).
#    Folds the ENTIRE backups/incoming/ tree (events.json + mongo/*.json) into db/.
if [ -d "backups/incoming" ] && [ -n "$(ls -A backups/incoming 2>/dev/null)" ]; then
  echo "==> Including MongoDB dump from backups/incoming/ ..."
  cp -R backups/incoming/. "${OUT}/db/"
  DB_FILES=$(find "${OUT}/db" -type f | wc -l | tr -d ' ')
  DB_STATUS="included (${DB_FILES} file(s) from backups/incoming/)"
else
  cat > "${OUT}/db/README.txt" <<'TXT'
DB dump NOT included in this backup.

The MongoDB data requires database credentials this tool does not have. To
capture it, run (with MONGODB_URI set), then re-run this backup:

    MONGODB_URI="..." node scripts/backup-mongo.mjs   # dumps all collections
    # writes backups/incoming/ (events.json + mongo/*.json)
TXT
  DB_STATUS="NOT included (needs MONGODB_URI — see db/README.txt)"
fi

# 4) public-manifest.csv (path,bytes,sha256) — handles filenames with spaces.
echo "==> Building public-manifest.csv ..."
MAN="${OUT}/public-manifest.csv"
echo "path,bytes,sha256" > "$MAN"
PUB_COUNT=0
PUB_BYTES=0
while IFS= read -r -d '' f; do
  bytes=$(wc -c < "$f" | tr -d ' ')
  hash=$(shasum -a 256 "$f" | awk '{print $1}')
  # quote the path for CSV safety (spaces are common here)
  printf '"%s",%s,%s\n' "$f" "$bytes" "$hash" >> "$MAN"
  PUB_COUNT=$((PUB_COUNT + 1))
  PUB_BYTES=$((PUB_BYTES + bytes))
done < <(find public -type f -print0 | sort -z)

# 5) MANIFEST.md
echo "==> Writing MANIFEST.md ..."
cat > "${OUT}/MANIFEST.md" <<MD
# Backup Manifest — ${NAME}

- **Created:** ${TS} (local time)
- **Git commit:** \`${SHA}\` ($(git rev-parse HEAD 2>/dev/null || echo nogit))
- **Tool:** scripts/backup.sh

## Contents

| Item | Notes |
|---|---|
| \`public/\` | Full byte-for-byte copy of local media (${PUB_COUNT} files, ${PUB_BYTES} bytes) |
| \`source-content/\` | Source files holding all hardcoded content + config |
| \`db/events.json\` | MongoDB events dump — ${DB_STATUS} |
| \`public-manifest.csv\` | path,bytes,sha256 for every /public file |
| \`checksums.sha256\` | Integrity checksums for all backup files |

## Verification

This backup is verified by re-extracting the zip and running
\`shasum -c checksums.sha256\`. See the script output / PROGRESS.md for the result.

## Notes

- \`/public\` on disk is **not modified** by this tool.
- The \`events\` collection is the only dynamic data store; everything else is
  hardcoded in \`source-content/\` (see docs/DATA_INVENTORY.md).
- Do not commit backups to git (\`backups/\` is git-ignored).
MD

# 6) checksums over everything in the backup (relative paths), excluding the
#    checksums file itself.
echo "==> Computing checksums.sha256 ..."
( cd "${OUT}" && find . -type f ! -name checksums.sha256 -print0 \
    | sort -z | xargs -0 shasum -a 256 > checksums.sha256 )

# 7) Zip it.
echo "==> Zipping ..."
ZIP="backups/${NAME}.zip"
( cd backups && zip -r -q "${NAME}.zip" "${NAME}" )
shasum -a 256 "${ZIP}" | awk '{print $1}' > "${ZIP}.sha256"

# 8) VERIFY: extract to temp and re-check checksums.
echo "==> Verifying ..."
TMP="$(mktemp -d)"
unzip -q "${ZIP}" -d "${TMP}"
if ( cd "${TMP}/${NAME}" && shasum -c checksums.sha256 --status ); then
  VERIFY="PASS"
else
  VERIFY="FAIL"
fi
rm -rf "${TMP}"

echo ""
echo "==================== BACKUP SUMMARY ===================="
echo " Name:        ${NAME}"
echo " Folder:      ${OUT}"
echo " Zip:         ${ZIP}"
echo " Zip sha256:  $(cat "${ZIP}.sha256")"
echo " Public files:${PUB_COUNT} (${PUB_BYTES} bytes)"
echo " DB dump:     ${DB_STATUS}"
echo " VERIFY:      ${VERIFY}"
echo "========================================================"

[ "${VERIFY}" = "PASS" ] || { echo "ERROR: verification failed"; exit 1; }
