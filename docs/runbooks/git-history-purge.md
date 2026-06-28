# Runbook: Secret Rotation & Git-History Purge

**Trigger:** secrets were committed to the repository (see
[KNOWN_ISSUES.md](../../KNOWN_ISSUES.md) #1 — the leaked token + GitHub PAT in
`README.md`).

> **Ownership note:** Per the project owner's decision, **removing the secrets
> from `README.md` and rotating the keys is handled by the owner.** This runbook
> documents the full procedure so it is reproducible and so the history purge can
> be coordinated.

## Golden rule

Anything committed to Git is considered **compromised the moment it is pushed**,
even if later deleted. Deletion from the latest commit does **not** remove it from
history. You must **rotate the credential** and, separately, **purge it from
history**.

## Step 1 — Rotate / revoke (do this FIRST)

1. **GitHub PAT (`ghp_…`):** GitHub → Settings → Developer settings → Personal
   access tokens → revoke the leaked token; issue a new one with least-privilege
   scopes; store it in a secret manager (never in the repo).
2. **The other token (`UD9ky0m6…`):** identify the service it belongs to and
   rotate it there; update wherever it is consumed (env vars / CI secrets).
3. Confirm the old values now fail to authenticate.

## Step 2 — Remove from the working tree

- Delete the secret lines from `README.md` (and anywhere else they appear).
- Commit the cleanup.

## Step 3 — Purge from history

Coordinate with everyone who has a clone (history rewrite invalidates their copies).

**Option A — git-filter-repo (recommended):**
```bash
# Install: pip install git-filter-repo
# Create a replacements file mapping each secret to a placeholder:
cat > /tmp/secrets.txt <<'EOF'
UD9ky0m6Q4Zk0z5oiGBxXMdglatCqa2mfC==>***REMOVED***
ghp_i8==>***REMOVED***
EOF

git filter-repo --replace-text /tmp/secrets.txt
git push --force --all
git push --force --tags
```

**Option B — BFG Repo-Cleaner:**
```bash
# echo each secret into a file, one per line:
bfg --replace-text secrets.txt
git reflog expire --expire=now --all && git gc --prune=now --aggressive
git push --force --all
```

## Step 4 — Invalidate caches & verify

- Ask GitHub Support to purge cached views if the secret was exposed publicly.
- Re-run the secret scan (`.github/workflows/secret-scan.yml`) — it should pass.
- Have collaborators **re-clone** (their old clones still contain the secret).

## Step 5 — Prevent recurrence

- The CI **Secret Scan** workflow (gitleaks) is in place — keep it required.
- Optional local guard: add a pre-commit hook running gitleaks before commits.
- Never commit `.env*`; use a secret manager / CI secrets for all credentials.

## Done when

- Old credentials are revoked and confirmed dead.
- Secrets are gone from the working tree **and** history.
- Secret scan passes on the default branch.
- Collaborators have re-cloned.
