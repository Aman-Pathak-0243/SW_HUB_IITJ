// Scoped-grant DISCOVERY (Session 13, DL-096) — the INVERSE of the RBAC resolver.
//
// lib/rbac/authorize.mjs answers "does user U hold permission P at scope S?" (one
// scope in → yes/no). The scoped-coordinator surface needs the OTHER direction:
// "for permission P, which org-unit LINEAGES does user U hold it at (as a SCOPED —
// non-global — grant)?" — so it can show a coordinator the clubs they run.
//
// It is deliberately built ON the existing pure resolver: for each CANDIDATE lineage
// (any non-null orgUnitLineageKey that appears in the user's assignments or grant
// overrides), it re-runs `resolveEffectivePermissions` at that (lineage, year) scope
// and keeps the lineage iff `can()` is true. This guarantees EXACT parity with live
// authorization — deny-wins, the developer / grants_all short-circuit, and the
// year-dimension `inScope` semantics are all honoured because it is the SAME code that
// `assertEventManage` / `assertActorPermission` use. No divergent logic to drift (DL-051).
import prisma from "../prisma.mjs";
import { getCurrentYearId } from "../year/context.mjs";
import { loadUserRbacInputs, resolveEffectivePermissions, can } from "./authorize.mjs";

// PURE: the SCOPED lineages where `user` effectively holds ANY of `permissionKeys` at
// (lineage, academicYearId). Unit-testable without a DB. `academicYearId`:
//   • a value  → the year dimension is checked (a grant scoped to a DIFFERENT specific
//     year is excluded; an all-years/null grant or a same-year grant passes) — mirrors
//     assertEventManage's use of the event's year.
//   • undefined → the year dimension is not constrained (any-year scoped grant matches).
// Returns [{ orgUnitLineageKey, permissions: string[] }] (the subset of permissionKeys
// granted at that lineage), candidates only (a GLOBAL/unscoped grant is NOT a lineage
// and never appears here — that is a global admin, who uses /admin, not /coordinator).
export function scopedLineagesFor(user, assignments = [], overrides = [], permissionKeys = [], academicYearId = undefined) {
  const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
  if (!keys.length) return [];

  // Candidate scoped lineages: any non-null lineage the user has an ACTIVE assignment
  // or a GRANT override for. (A deny-only override never widens access, so it is not a
  // candidate; if a deny sits on a lineage the user also has a grant on, the resolver
  // below applies deny-wins and drops it.)
  const candidates = new Set();
  for (const a of assignments) {
    if (a.revokedAt) continue;
    if (a.orgUnitLineageKey) candidates.add(a.orgUnitLineageKey);
  }
  for (const o of overrides) {
    if (o.mode === "grant" && o.orgUnitLineageKey) candidates.add(o.orgUnitLineageKey);
  }
  if (!candidates.size) return [];

  const out = [];
  for (const orgUnitLineageKey of candidates) {
    const scope = { orgUnitLineageKey };
    if (academicYearId !== undefined) scope.academicYearId = academicYearId;
    const resolved = resolveEffectivePermissions(user, assignments, scope, overrides);
    const granted = keys.filter((k) => can(resolved, k));
    if (granted.length) out.push({ orgUnitLineageKey, permissions: granted });
  }
  return out;
}

// DB-backed: the lineages a user manages (SCOPED grant of ANY of `permissionKeys`),
// each resolved to its CURRENT-YEAR published org-unit display (name / slug / type),
// falling back to the lineage's canonicalName when the unit is not published this year.
// Defaults to the current year (matching the surface + assertEventManage). Returns
//   [{ orgUnitLineageKey, name, slug, typeKey, typeName, publishedThisYear,
//      permissions: { events, members }, permissionKeys }]
// sorted by display name. Safe for a non-request caller (pass a `client`); never throws
// for a bad/absent user (returns []).
export async function listManageableLineages(userId, permissionKeys = [], { academicYearId, client = prisma } = {}) {
  if (!userId) return [];
  const { user, normalized, normalizedOverrides } = await loadUserRbacInputs(userId, client);
  if (!user) return [];
  const year = academicYearId !== undefined ? academicYearId : await getCurrentYearId(client);

  const scoped = scopedLineagesFor(user, normalized, normalizedOverrides, permissionKeys, year ?? null);
  if (!scoped.length) return [];

  const lineageKeys = scoped.map((s) => s.orgUnitLineageKey);
  const [units, lineages] = await Promise.all([
    year
      ? client.orgUnit.findMany({
          where: { lineageKey: { in: lineageKeys }, academicYearId: year, status: "published", archivedAt: null },
          select: { lineageKey: true, name: true, slug: true, orgUnitType: { select: { key: true, name: true } } },
        })
      : Promise.resolve([]),
    client.orgUnitLineage.findMany({ where: { lineageKey: { in: lineageKeys } }, select: { lineageKey: true, canonicalName: true } }),
  ]);
  const unitByLineage = new Map(units.map((u) => [u.lineageKey, u]));
  const canonByLineage = new Map(lineages.map((l) => [l.lineageKey, l.canonicalName]));

  return scoped
    .map((s) => {
      const u = unitByLineage.get(s.orgUnitLineageKey) ?? null;
      const permKeys = s.permissions;
      return {
        orgUnitLineageKey: s.orgUnitLineageKey,
        name: u?.name ?? canonByLineage.get(s.orgUnitLineageKey) ?? null,
        slug: u?.slug ?? null,
        typeKey: u?.orgUnitType?.key ?? null,
        typeName: u?.orgUnitType?.name ?? null,
        publishedThisYear: !!u,
        permissions: {
          events: permKeys.includes("event.manage"),
          members: permKeys.includes("membership.manage"),
        },
        permissionKeys: permKeys,
      };
    })
    .sort((a, b) => (a.name ?? "￿").localeCompare(b.name ?? "￿"));
}
