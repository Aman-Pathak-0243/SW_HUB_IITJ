// Developer CLI (Session 11+) — the operator's command line over the portal's own
// services. It drives the SAME audited service functions the admin panel calls
// (lib/users/admin.mjs, lib/platform/flags.mjs, lib/year/context.mjs, lib/devconsole/*),
// so behavior, validation and audit logging are identical to the UI — there is no
// second, divergent code path.
//
//   npm run cli -- <command> [--flag=value] [--bool-flag]
//   npm run cli -- help
//
// ACTOR / AUTHORIZATION
//   This is an OPERATOR tool: it runs with the database credentials in .env.local,
//   so it acts as a `system` actor (like prisma/seed.mjs and scripts/devconsole.mjs)
//   and BYPASSES the RBAC permission checks — every guarded service short-circuits
//   on `actor.system` (assertActorPermission / assertCanSetDeveloper / the grantRole
//   privilege-escalation guard / setFeatureFlag's developer gate). For audit
//   attribution it ALSO carries the seeded developer's userId (or `--as <email>`),
//   so audit_log rows are attributed to a real developer instead of NULL.
//
// Anyone who can run this script already has full DB access — treat it as root.
import prisma from "../lib/prisma.mjs";
import {
  listUsers,
  getUser,
  createUser,
  updateUser,
  setUserStatus,
  setUserPassword,
  deleteUser,
  forcePasswordReset,
  importUsersCsv,
  listRoles,
  getRole,
  createRole,
  updateRole,
  grantRole,
  revokeRole,
  listPermissionCatalog,
  listUserOverrides,
  setUserOverride,
  removeUserOverride,
  USER_STATUSES,
} from "../lib/users/admin.mjs";
import {
  listFeatureFlags,
  setFeatureFlag,
  isMemberPlatformEnabled,
  PLUGIN_KEYS,
  MEMBER_PLATFORM_FLAG,
} from "../lib/platform/flags.mjs";
import {
  listYears,
  getYear,
  getYearByLabel,
  resolveCurrentYear,
  createYear,
  setCurrentYear,
} from "../lib/year/context.mjs";
import { getSystemStatus } from "../lib/devconsole/status.mjs";
import { getDevConsoleReports } from "../lib/devconsole/reports.mjs";
import { listAuditLog, getAuditStats } from "../lib/devconsole/audit.mjs";
import { readFile } from "node:fs/promises";

// ── Neon wake (mirrors seed.mjs / devconsole.mjs) ─────────────────────────────
async function waitForDb(maxAttempts = 12, delayMs = 5000) {
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return;
    } catch (e) {
      if (i === maxAttempts) throw e;
      console.log(`DB not ready (attempt ${i}/${maxAttempts}) — waking Neon, retrying...`);
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}

// ── tiny arg parser ───────────────────────────────────────────────────────────
// `--key=value` → { key: "value" }; bare `--flag` → { flag: true }. The first
// non-flag token is the command. Quote values with spaces in your shell.
function parseArgs(argv) {
  let command = null;
  const flags = {};
  for (const a of argv) {
    if (a.startsWith("--")) {
      const body = a.slice(2);
      const eq = body.indexOf("=");
      if (eq === -1) flags[body] = true;
      else flags[body.slice(0, eq)] = body.slice(eq + 1);
    } else if (command === null) {
      command = a;
    }
  }
  return { command, flags };
}

// ── output helpers ────────────────────────────────────────────────────────────
function print(obj) {
  console.log(typeof obj === "string" ? obj : JSON.stringify(obj, null, 2));
}
function ok(msg) {
  console.log(`✓ ${msg}`);
}
function fail(msg) {
  throw new Error(msg);
}

// ── resolve helpers (human-friendly identifiers → ids) ────────────────────────
async function resolveUser(flags) {
  if (flags.id) {
    const u = await prisma.user.findUnique({ where: { id: String(flags.id) } });
    if (!u) fail(`No user with id ${flags.id}`);
    return u;
  }
  if (flags.email) {
    // email column is citext → case-insensitive lookup.
    const u = await prisma.user.findUnique({ where: { email: String(flags.email).trim() } });
    if (!u) fail(`No user with email ${flags.email}`);
    return u;
  }
  fail("Pass --email=<addr> or --id=<uuid> to identify the user.");
}

async function resolveRoleId(key) {
  const r = await prisma.role.findUnique({ where: { key: String(key) }, select: { id: true } });
  if (!r) fail(`No role with key '${key}'. Try: npm run cli -- role:list`);
  return r.id;
}

// Accepts a label ('2025-26') or a raw uuid; returns the academic_year id.
async function resolveYearId(value) {
  const v = String(value).trim();
  if (/^\d{4}-\d{2}$/.test(v)) {
    const y = await getYearByLabel(v);
    if (!y) fail(`No academic year labelled '${v}'.`);
    return y.id;
  }
  const y = await getYear(v);
  if (!y) fail(`No academic year '${v}' (give a 'YYYY-YY' label or a uuid).`);
  return y.id;
}

// ── command table ─────────────────────────────────────────────────────────────
// Every handler receives (flags, actor). Grouped: users · roles · permissions ·
// plugins · years · console.
const COMMANDS = {
  // ---------- users ----------
  "user:list": async (flags, actor) => {
    const res = await listUsers(
      { status: flags.status, search: flags.search, category: flags.role, take: flags.take ? Number(flags.take) : undefined },
      actor
    );
    print(res);
  },
  "user:get": async (flags, actor) => {
    const u = await resolveUser(flags);
    print(await getUser(u.id, actor));
  },
  "user:create": async (flags, actor) => {
    if (!flags.email) fail("--email is required.");
    const hasPw = flags.password != null && flags.password !== true && flags.password !== "";
    const { user } = await createUser(
      {
        email: String(flags.email),
        name: flags.name ? String(flags.name) : undefined,
        password: hasPw ? String(flags.password) : undefined,
        isDeveloper: !!flags.developer,
        status: flags.status ? String(flags.status) : undefined,
        // a set password forces a first-login change unless --no-must-change.
        mustChangePassword: hasPw ? !flags["no-must-change"] : undefined,
      },
      actor
    );
    ok(`Created user ${user.email}${user.isDeveloper ? " (developer)" : ""}.`);
    // Convenience: --role=<key> assigns a role in the same command.
    if (flags.role) {
      const { created } = await grantRole({ userId: user.id, roleKey: String(flags.role) }, actor);
      ok(created ? `Granted role '${flags.role}'.` : `Role '${flags.role}' was already assigned.`);
    }
    print(user);
  },
  "user:update": async (flags, actor) => {
    const u = await resolveUser(flags);
    const patch = {};
    if (flags.name !== undefined) patch.name = String(flags.name);
    if (flags.developer !== undefined) patch.isDeveloper = flags.developer === true || flags.developer === "true";
    const res = await updateUser(u.id, patch, actor);
    ok(`Updated ${u.email}.`);
    print(res.user);
  },
  "user:set-password": async (flags, actor) => {
    const u = await resolveUser(flags);
    if (!flags.password || flags.password === true) fail("--password=<value> is required (min 8 chars).");
    await setUserPassword(u.id, String(flags.password), actor, { mustChange: !flags["no-must-change"] });
    ok(`Password set for ${u.email}${flags["no-must-change"] ? "" : " (must change on next login)"}.`);
  },
  "user:status": async (flags, actor) => {
    const u = await resolveUser(flags);
    if (!flags.status) fail(`--status is required. One of: ${USER_STATUSES.join(", ")}`);
    await setUserStatus(u.id, String(flags.status), actor);
    ok(`${u.email} → status '${flags.status}'.`);
  },
  "user:reset-password": async (flags, actor) => {
    const u = await resolveUser(flags);
    const res = await forcePasswordReset(u.id, actor);
    ok(`Forced password reset for ${u.email}.`);
    print(res);
  },
  "user:delete": async (flags, actor) => {
    const u = await resolveUser(flags);
    if (!flags.yes) fail(`This HARD-DELETES ${u.email} (cascades role assignments + auth accounts). Re-run with --yes to confirm.`);
    await deleteUser(u.id, actor);
    ok(`Deleted ${u.email}.`);
  },
  "user:import-csv": async (flags, actor) => {
    if (!flags.file || flags.file === true) fail("--file=<path> is required (columns: email,name).");
    const csv = await readFile(String(flags.file), "utf8");
    print(await importUsersCsv(csv, actor));
  },

  // ---------- roles ----------
  "role:list": async (flags, actor) => {
    print(await listRoles({ includeInactive: !!flags.all }, actor));
  },
  "role:get": async (flags, actor) => {
    const id = flags.key ? await resolveRoleId(flags.key) : flags.id ? String(flags.id) : fail("Pass --key or --id.");
    print(await getRole(id, actor));
  },
  "role:create": async (flags, actor) => {
    if (!flags.key || !flags.name) fail("--key and --name are required.");
    const res = await createRole(
      {
        key: String(flags.key),
        name: String(flags.name),
        description: flags.description ? String(flags.description) : undefined,
        permissionKeys: flags.permissions ? String(flags.permissions).split(",").map((s) => s.trim()).filter(Boolean) : undefined,
      },
      actor
    );
    ok(`Created role '${flags.key}'.`);
    print(res.role);
  },
  "role:update": async (flags, actor) => {
    const id = flags.key ? await resolveRoleId(flags.key) : flags.id ? String(flags.id) : fail("Pass --key or --id.");
    const patch = {};
    if (flags.name !== undefined) patch.name = String(flags.name);
    if (flags.description !== undefined) patch.description = String(flags.description);
    if (flags.status !== undefined) patch.status = String(flags.status);
    if (flags.permissions !== undefined) patch.permissionKeys = String(flags.permissions).split(",").map((s) => s.trim()).filter(Boolean);
    print(await updateRole(id, patch, actor));
  },
  "role:grant": async (flags, actor) => {
    const u = await resolveUser(flags);
    if (!flags.role) fail("--role=<key> is required (e.g. super_admin, coordinator).");
    const input = { userId: u.id, roleKey: String(flags.role) };
    if (flags.unit) input.orgUnitLineageKey = String(flags.unit);
    if (flags.year) input.academicYearId = await resolveYearId(flags.year);
    const { created } = await grantRole(input, actor);
    ok(created ? `Granted '${flags.role}' to ${u.email}.` : `'${flags.role}' was already assigned to ${u.email}.`);
  },
  "role:revoke": async (flags, actor) => {
    let assignmentId = flags.assignment ? String(flags.assignment) : null;
    if (!assignmentId) {
      // Resolve the active assignment from --email + --role.
      const u = await resolveUser(flags);
      if (!flags.role) fail("Pass --assignment=<id>, or --email + --role to target an active grant.");
      const roleId = await resolveRoleId(flags.role);
      const a = await prisma.roleAssignment.findFirst({
        where: { userId: u.id, roleId, revokedAt: null },
        orderBy: { grantedAt: "desc" },
      });
      if (!a) fail(`No active '${flags.role}' grant on ${u.email}.`);
      assignmentId = a.id;
    }
    print(await revokeRole(assignmentId, actor));
  },

  // ---------- permissions / overrides ----------
  "perm:list": async (_flags, actor) => {
    print(await listPermissionCatalog(actor));
  },
  "perm:overrides": async (flags, actor) => {
    const u = await resolveUser(flags);
    print(await listUserOverrides(u.id, actor));
  },
  "perm:override": async (flags, actor) => {
    const u = await resolveUser(flags);
    if (!flags.mode || !flags.permission) fail("--mode=grant|deny and --permission=<key> are required.");
    const input = { userId: u.id, mode: String(flags.mode), permissionKey: String(flags.permission) };
    if (flags.unit) input.orgUnitLineageKey = String(flags.unit);
    if (flags.year) input.academicYearId = await resolveYearId(flags.year);
    if (flags.reason) input.reason = String(flags.reason);
    print(await setUserOverride(input, actor));
  },
  "perm:override:remove": async (flags, actor) => {
    if (!flags.id || flags.id === true) fail("--id=<override-id> is required (see perm:overrides).");
    print(await removeUserOverride(String(flags.id), actor));
  },

  // ---------- plugins / feature flags ----------
  "plugin:list": async (_flags, actor) => {
    print(await listFeatureFlags(actor));
  },
  "plugin:status": async () => {
    const on = await isMemberPlatformEnabled();
    print({ flag: MEMBER_PLATFORM_FLAG, memberPlatformEnabled: on });
  },
  "plugin:enable": async (flags, actor) => {
    const key = flags.key ? String(flags.key) : MEMBER_PLATFORM_FLAG;
    const res = await setFeatureFlag(key, true, actor);
    ok(`Plugin '${key}' enabled${res.changed ? "" : " (already enabled)"}.`);
    print(res.flag);
  },
  "plugin:disable": async (flags, actor) => {
    const key = flags.key ? String(flags.key) : MEMBER_PLATFORM_FLAG;
    const res = await setFeatureFlag(key, false, actor);
    ok(`Plugin '${key}' disabled${res.changed ? "" : " (already disabled)"}.`);
    print(res.flag);
  },

  // ---------- academic years ----------
  "year:list": async (flags, actor) => {
    print(await listYears({ status: flags.status, includeCounts: !!flags.counts }));
  },
  "year:current": async () => {
    print((await resolveCurrentYear()) ?? { current: null });
  },
  "year:create": async (flags, actor) => {
    if (!flags.label || !flags.start || !flags.end) fail("--label=YYYY-YY --start=YYYY-MM-DD --end=YYYY-MM-DD are required.");
    print(await createYear({ label: String(flags.label), startDate: String(flags.start), endDate: String(flags.end), status: flags.status ? String(flags.status) : undefined }, actor));
  },
  "year:set-current": async (flags, actor) => {
    const id = flags.label ? await resolveYearId(flags.label) : flags.id ? String(flags.id) : fail("Pass --label or --id.");
    print(await setCurrentYear(id, actor));
  },

  // ---------- developer console / observability ----------
  "status": async (_flags, actor) => {
    print(await getSystemStatus(actor));
  },
  "reports": async (_flags, actor) => {
    print(await getDevConsoleReports(actor));
  },
  "audit": async (flags, actor) => {
    print(await listAuditLog({ action: flags.action, entityType: flags.entity, take: flags.take ? Number(flags.take) : undefined }, actor));
  },
  "audit:stats": async (flags, actor) => {
    print(await getAuditStats({ action: flags.action, entityType: flags.entity }, actor));
  },
};

const HELP = `Developer CLI — drives the portal's own audited services as an operator.

USAGE
  npm run cli -- <command> [--flag=value] [--bool-flag]

USERS
  user:list [--status=] [--search=] [--role=<roleKey>] [--take=]
  user:get            --email=|--id=
  user:create         --email= [--name=] [--password=] [--role=<key>] [--developer] [--status=] [--no-must-change]
  user:update         --email=|--id= [--name=] [--developer=true|false]
  user:set-password   --email=|--id= --password= [--no-must-change]
  user:status         --email=|--id= --status=active|inactive|revoked
  user:reset-password --email=|--id=
  user:delete         --email=|--id= --yes        (HARD delete; cascades grants + auth accounts)
  user:import-csv     --file=<path>               (CSV columns: email,name)

ROLES
  role:list [--all]
  role:get    --key=|--id=
  role:create --key= --name= [--description=] [--permissions=a,b,c]
  role:update --key=|--id= [--name=] [--description=] [--permissions=a,b,c] [--status=]
  role:grant  --email=|--id= --role=<key> [--unit=<lineageKey>] [--year=<label|id>]
  role:revoke --assignment=<id>  | --email= --role=<key>

PERMISSIONS
  perm:list
  perm:overrides        --email=|--id=
  perm:override         --email=|--id= --mode=grant|deny --permission=<key> [--unit=] [--year=] [--reason=]
  perm:override:remove  --id=<overrideId>

PLUGINS (developer-controlled feature flags)
  plugin:list
  plugin:status
  plugin:enable  [--key=member_platform]
  plugin:disable [--key=member_platform]

ACADEMIC YEARS
  year:list [--status=] [--counts]
  year:current
  year:create      --label=YYYY-YY --start=YYYY-MM-DD --end=YYYY-MM-DD [--status=]
  year:set-current --label=|--id=

CONSOLE / OBSERVABILITY
  status            system status (DB, migrations, transitions, media)
  reports           testing + cost reports
  audit [--action=] [--entity=] [--take=]
  audit:stats [--action=] [--entity=]

GLOBAL
  --as=<email>   attribute audit rows to this developer (default: BOOTSTRAP_DEVELOPER_EMAIL)
  help           show this message

Known plugin keys: ${PLUGIN_KEYS.join(", ")}
Note: this is an operator tool — it bypasses RBAC (system actor) like the seed script.`;

async function resolveActor(flags) {
  // system:true bypasses every RBAC guard; userId (a developer) gives audit
  // attribution. Prefer --as, then BOOTSTRAP_DEVELOPER_EMAIL, then any developer.
  const wantEmail = (flags.as && flags.as !== true ? String(flags.as) : process.env.BOOTSTRAP_DEVELOPER_EMAIL || "").trim();
  let dev = null;
  if (wantEmail) dev = await prisma.user.findUnique({ where: { email: wantEmail }, select: { id: true, isDeveloper: true, email: true } });
  if (!dev) dev = await prisma.user.findFirst({ where: { isDeveloper: true }, select: { id: true, isDeveloper: true, email: true } });
  return { system: true, userId: dev?.id, _email: dev?.email ?? "(system, unattributed)" };
}

async function main() {
  const { command, flags } = parseArgs(process.argv.slice(2));

  if (!command || command === "help" || flags.help) {
    print(HELP);
    process.exit(0);
  }
  const handler = COMMANDS[command];
  if (!handler) {
    console.error(`Unknown command '${command}'. Run: npm run cli -- help`);
    process.exit(2);
  }

  await waitForDb();
  const actor = await resolveActor(flags);
  if (flags.verbose) console.log(`[actor] ${actor._email}`);

  try {
    await handler(flags, actor);
  } catch (e) {
    console.error(`✗ ${e?.message ?? e}`);
    process.exit(1);
  }
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
