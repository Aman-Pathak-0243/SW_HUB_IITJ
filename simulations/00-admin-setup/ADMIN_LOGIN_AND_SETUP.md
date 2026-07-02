# One-Time Setup — Admin Login, Member Platform & Bulk-Import Participants

Do this **once** before running either simulation. It takes about 10 minutes. By the end you
will be logged into the admin panel, the member platform will be ON, and 50 participant
accounts will exist and be ready to log in.

---

## Step 1 — Log into the admin panel

1. Open the site and go to **`/login`**.
2. Sign in with your **administrator / developer** account (the bootstrap admin set up at
   install time — the email in `BOOTSTRAP_DEVELOPER_EMAIL` / `BOOTSTRAP_ADMIN_EMAILS`).
3. Go to **`/admin`**.

✅ **Verify:** you see the **Admin** panel with a left sidebar (Dashboard, Content, Event
Playground, Users & Roles, Plugins, …). If you don't see these, your account lacks admin
permissions — sign in with the developer/admin account.

---

## Step 2 — Turn on the Member Platform

Member login, registration, and participation only work when the member platform is enabled.

1. In the sidebar open **Plugins** (`/admin/plugins`).
2. Turn **member_platform** **ON**.

*(Command-line alternative for the technical owner: `npm run plugin:on`.)*

✅ **Verify:** the plugin shows **enabled**. The public site now shows a working **Login**,
and members can register for events.

---

## Step 3 — Bulk-import the 50 participants

The sheet [`../data/participants-50.csv`](../data/participants-50.csv) contains 50 accounts.
Its columns are **`email, password, name, role`** (see
[participants-key.md](../data/participants-key.md) for the full explanation).

### Option A — Admin panel (recommended for the client)
1. Sidebar → **Users & Roles** (`/admin/users`).
2. Use the **bulk import** action and **paste the contents of `participants-50.csv`** (or
   upload the file). The header row `email,password,name,role` is detected and skipped.
3. Submit. The importer reports how many accounts were **created** (and skips any that
   already exist — it is safe to run again).

### Option B — Command line (technical owner)
```bash
npm run cli user:import-csv --file=simulations/data/participants-50.csv
```

✅ **Verify:** the import reports **50 created** (or "skipped" for any that already existed),
and searching **Users & Roles** for `sim.user.` shows the 50 accounts, all **active**.

> **Password rules** (in case you edit the sheet): at least **10 characters**, with at least
> one **uppercase**, one **lowercase**, and one **digit**. The provided passwords
> (`Welcome#2001` … `Welcome#2050`) already satisfy this.

---

## Step 4 — Hand out the initial passwords

You (the organizer) now distribute each participant's **initial password** from the sheet —
by email, or however you normally reach them. Tell them to log in at **`/login`**.

⚠ **On first login, each user is required to set their own new password.** This is expected:
the sheet password is only the *initial* one. See
[participants-key.md](../data/participants-key.md) for a ready-to-send message template.

✅ **Verify:** pick one account (e.g. `sim.user.01@iitjammu.ac.in` / `Welcome#2001`), log in
in a private/incognito window, and confirm you are prompted to set a new password, then land
on the site as a signed-in member. Log back out.

---

## You're ready

- **Simulation 1 (any event):** [../simulation-1-general/README.md](../simulation-1-general/README.md)
- **Simulation 2 (Coding × Robotics):** [../simulation-2-coding-robotics/README.md](../simulation-2-coding-robotics/README.md)

> Reminder: this is a **dry run**. Do it against your test/staging environment first. Never
> run destructive database commands against production.
