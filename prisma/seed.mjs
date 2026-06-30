// Idempotent seed for Session 2: the structural/identity baseline the rest of
// the portal builds on. Re-runnable (upserts). Run with:
//   npm run db:seed          (dotenv-cli loads .env.local)
//   npx prisma db seed
//
// Seeds: current academic_year (2025-26) · permission catalog · system roles
// (developer grants_all, super_admin) + operational roles + role_permission ·
// org_unit_type + allowed-child edges · base positions · content_type_def ·
// bootstrap users (developer + the V1 admin emails as super_admins — this is
// what replaces the V1 hardcoded allowlist). Org units / people / appointments
// are migrated in Session 5; media in Session 7.
import { PrismaClient } from "@prisma/client";
import { PERMISSIONS, ROLE_DEFS } from "../lib/rbac/permissions.mjs";
import { CONTENT_TYPE_DEFS } from "../lib/cms/content-types.mjs";
import { ORG_UNIT_TYPES, ALLOWED_CHILD_EDGES, POSITIONS } from "../lib/org/structure.mjs";
import { hashPassword } from "../lib/auth/password.mjs";
import { PLUGIN_DEFS } from "../lib/platform/flags.mjs";

// Use the POOLED endpoint: the Neon pooler reliably wakes a suspended compute
// (it buffers the connection during cold-start), where the direct endpoint
// returns connection errors. Falls back to DIRECT_URL if no pooled URL is set.
const prisma = new PrismaClient({
  datasourceUrl: process.env.DATABASE_URL || process.env.DIRECT_URL,
});

// Neon serverless computes auto-suspend; the connection that triggers a wake
// can drop. Retry a real round-trip until the DB is reachable.
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

async function ensureGlobalGrant(userId, roleId) {
  const existing = await prisma.roleAssignment.findFirst({
    where: { userId, roleId, orgUnitLineageKey: null, academicYearId: null, revokedAt: null },
  });
  if (!existing) {
    await prisma.roleAssignment.create({ data: { userId, roleId } });
  }
}

async function main() {
  await waitForDb();

  // 1. Current academic year (2025-26). Demote any OTHER current year first so
  //    the exactly-one-current partial unique can never collide (idempotent).
  await prisma.academicYear.updateMany({
    where: { isCurrent: true, label: { not: "2025-26" } },
    data: { isCurrent: false },
  });
  const year = await prisma.academicYear.upsert({
    where: { label: "2025-26" },
    update: { status: "active", isCurrent: true },
    create: {
      label: "2025-26",
      startDate: new Date("2025-07-01"),
      endDate: new Date("2026-06-30"),
      status: "active",
      isCurrent: true,
    },
  });

  // 2. Permission catalog
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { label: p.label, module: p.module ?? null, description: p.description ?? null },
      create: { key: p.key, label: p.label, module: p.module ?? null, description: p.description ?? null },
    });
  }
  const allPerms = await prisma.permission.findMany({ select: { id: true, key: true } });
  const permIdByKey = new Map(allPerms.map((p) => [p.key, p.id]));

  // 3. Roles + role_permission (reset each role's permission set to the declared one)
  for (const r of ROLE_DEFS) {
    const role = await prisma.role.upsert({
      where: { key: r.key },
      update: { name: r.name, description: r.description ?? null, isSystem: r.isSystem, grantsAll: r.grantsAll },
      create: { key: r.key, name: r.name, description: r.description ?? null, isSystem: r.isSystem, grantsAll: r.grantsAll },
    });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (!r.grantsAll) {
      const keys = r.permissions === "ALL" ? allPerms.map((p) => p.key) : r.permissions;
      const unknown = keys.filter((k) => !permIdByKey.has(k));
      if (unknown.length) {
        throw new Error(`Role '${r.key}' references unknown permission key(s): ${unknown.join(", ")}`);
      }
      const data = keys.map((k) => ({ roleId: role.id, permissionId: permIdByKey.get(k) }));
      if (data.length) await prisma.rolePermission.createMany({ data, skipDuplicates: true });
    }
  }

  // 4. content_type_def
  for (const c of CONTENT_TYPE_DEFS) {
    await prisma.contentTypeDef.upsert({
      where: { contentType: c.contentType },
      update: { label: c.label, isYearScoped: c.isYearScoped, supportsPublish: c.supportsPublish, isOrgBound: c.isOrgBound, payloadTable: c.payloadTable },
      create: { ...c },
    });
  }

  // 5. org_unit_type + allowed-child edges
  for (const t of ORG_UNIT_TYPES) {
    await prisma.orgUnitType.upsert({
      where: { key: t.key },
      update: { name: t.name, description: t.description ?? null, sortOrder: t.sortOrder, isSystem: t.isSystem },
      create: { key: t.key, name: t.name, description: t.description ?? null, sortOrder: t.sortOrder, isSystem: t.isSystem },
    });
  }
  const types = await prisma.orgUnitType.findMany({ select: { id: true, key: true } });
  const typeIdByKey = new Map(types.map((t) => [t.key, t.id]));
  for (const [parentKey, childKey] of ALLOWED_CHILD_EDGES) {
    const parentTypeId = typeIdByKey.get(parentKey);
    const childTypeId = typeIdByKey.get(childKey);
    if (!parentTypeId || !childTypeId) continue;
    await prisma.orgUnitTypeAllowedChild.upsert({
      where: { parentTypeId_childTypeId: { parentTypeId, childTypeId } },
      update: {},
      create: { parentTypeId, childTypeId },
    });
  }

  // 6. base positions
  for (const p of POSITIONS) {
    const appliesToTypeId = p.appliesToType ? typeIdByKey.get(p.appliesToType) ?? null : null;
    await prisma.position.upsert({
      where: { key: p.key },
      update: { name: p.name, appliesToTypeId, holderKind: p.holderKind, maxHolders: p.maxHolders, rank: p.rank, isLead: p.isLead },
      create: { key: p.key, name: p.name, appliesToTypeId, holderKind: p.holderKind, maxHolders: p.maxHolders, rank: p.rank, isLead: p.isLead },
    });
  }

  // 6b. feature flags / plugins (Session 11 / M0). Create-if-missing; NEVER reset
  //     `enabled` on a re-seed so the operator's developer-controlled toggle sticks.
  for (const p of PLUGIN_DEFS) {
    await prisma.featureFlag.upsert({
      where: { key: p.key },
      update: { name: p.name, description: p.description ?? null, category: p.category ?? "plugin" },
      create: { key: p.key, name: p.name, description: p.description ?? null, category: p.category ?? "plugin", enabled: false },
    });
  }

  // 7. bootstrap users — replaces the V1 hardcoded email allowlist
  const developerRole = await prisma.role.findUniqueOrThrow({ where: { key: "developer" } });
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { key: "super_admin" } });

  const devEmail = (process.env.BOOTSTRAP_DEVELOPER_EMAIL || "developer@iitjammu.ac.in").trim();
  const devPassword = process.env.BOOTSTRAP_DEVELOPER_PASSWORD;
  // Hash ONCE and apply to BOTH branches. Previously the `update` branch omitted
  // passwordHash, so a re-seed of an ALREADY-EXISTING developer left password_hash
  // NULL forever and the bootstrap developer could never sign in. We only (re)set
  // the password when BOOTSTRAP_DEVELOPER_PASSWORD is provided, so an unset env
  // never clobbers a password the developer later chose via the reset flow.
  const devCredential = devPassword
    ? { passwordHash: await hashPassword(devPassword), passwordSetAt: new Date(), mustChangePassword: false }
    : {};
  const developer = await prisma.user.upsert({
    where: { email: devEmail },
    update: { isDeveloper: true, status: "active", ...devCredential },
    create: {
      email: devEmail,
      name: "Portal Developer",
      isDeveloper: true,
      status: "active",
      passwordHash: null,
      ...devCredential,
    },
  });
  await ensureGlobalGrant(developer.id, developerRole.id);

  const adminEmails = (process.env.BOOTSTRAP_ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    // don't also grant super_admin to the developer (citext-insensitive compare)
    .filter((e) => e.toLowerCase() !== devEmail.toLowerCase());
  for (const email of adminEmails) {
    const admin = await prisma.user.upsert({
      where: { email },
      update: { status: "active" },
      create: { email, name: email.split("@")[0], status: "active" },
    });
    await ensureGlobalGrant(admin.id, superAdminRole.id);
  }

  // Summary
  const counts = {
    academicYear: year.label,
    permissions: await prisma.permission.count(),
    roles: await prisma.role.count(),
    rolePermissions: await prisma.rolePermission.count(),
    orgUnitTypes: await prisma.orgUnitType.count(),
    allowedChildEdges: await prisma.orgUnitTypeAllowedChild.count(),
    positions: await prisma.position.count(),
    contentTypes: await prisma.contentTypeDef.count(),
    users: await prisma.user.count(),
    roleAssignments: await prisma.roleAssignment.count(),
    featureFlags: await prisma.featureFlag.count(),
  };
  console.log("Seed complete:", JSON.stringify(counts, null, 2));
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });
