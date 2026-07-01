// CENTRAL audit-write choke point (capability 8 / DL-012 / DL-025).
//
// There is exactly ONE place that knows how to write an `audit_log` row —
// `recordAudit()` — and exactly ONE way it is attached to the app's Prisma
// client — `buildAuditExtension()`, mounted in lib/prisma.mjs. Together they
// give capability-8 coverage that is uniform and automatic, so future modules
// are audited "for free" without scattering audit calls across routes.
//
// Two complementary paths, by design (DL-028):
//   1. AUTO (per-statement) — the `$extends` query extension audits every
//      mutating op (create/update/delete/upsert + *Many) on audited models. This
//      is the safety net + the freebie for future single-statement modules
//      (e.g. role grants, media uploads).
//   2. SEMANTIC (per-operation) — multi-step business operations (publish,
//      restore, createDraft, …) run inside a transaction with `suppressAuto`
//      set, then write exactly ONE high-level row via `recordAudit` AFTER the
//      transaction commits. The audit_action enum is itself operation-level
//      (publish/unpublish/archive/restore/transition/grant_role), so one
//      semantic row per business action is the right grain for a human-readable
//      activity log.
//
// Recursion & isolation: the extension and all audit reads/writes use the RAW
// (un-extended) `base` client, so writing an audit_log row never re-enters the
// extension. Auto-audit is best-effort: a failed audit write is logged but never
// breaks the underlying mutation.
import { getAuditContext, isAutoAuditSuppressed } from "./audit-context.mjs";

// ── JSON-safe snapshots ──
// audit_log.before/after are JSONB. Prisma's JSON serializer rejects BigInt and
// is happy with Dates, but we normalize to ISO strings so snapshots are stable,
// diffable, and portable. Recurses through plain objects/arrays only.
export function jsonSafe(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(jsonSafe);
  if (typeof value === "object") {
    // Prisma Decimal / Buffer etc. — fall back to string.
    if (typeof value.toJSON === "function" && !(value instanceof Date)) {
      try {
        return value.toJSON();
      } catch {
        return String(value);
      }
    }
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (v === undefined) continue;
      out[k] = jsonSafe(v);
    }
    return out;
  }
  return value; // string | number | boolean
}

// Prisma model name → snake_case table name (entity_type in audit_log). Mirrors
// the @@map names in prisma/schema.prisma. Kept explicit (not derived) so the
// audit log's entity_type is stable even if model names are refactored.
export const TABLE_BY_MODEL = {
  User: "app_user",
  Account: "auth_account",
  AcademicYear: "academic_year",
  Role: "role",
  Permission: "permission",
  RolePermission: "role_permission",
  OrgUnitLineage: "org_unit_lineage",
  RoleAssignment: "role_assignment",
  OrgUnitType: "org_unit_type",
  OrgUnitTypeAllowedChild: "org_unit_type_allowed_child",
  OrgUnit: "org_unit",
  Person: "person",
  Position: "position",
  Appointment: "appointment",
  ContentTypeDef: "content_type_def",
  ContentItem: "content_item",
  ContentRevision: "content_revision",
  ClubProfilePayload: "club_profile_payload",
  ClubMissionPoint: "club_mission_point",
  HostelProfilePayload: "hostel_profile_payload",
  MessProfilePayload: "mess_profile_payload",
  MessMealTiming: "mess_meal_timing",
  EventPayload: "event_payload",
  AnnouncementPayload: "announcement_payload",
  FlagshipEventPayload: "flagship_event_payload",
  ResourcePayload: "resource_payload",
  PageBlockPayload: "page_block_payload",
  ContentMedia: "content_media",
  MediaAsset: "media_asset",
  TransitionRun: "transition_run",
  BackupRecord: "backup_record",
  FeatureFlag: "feature_flag",
  Notification: "notification",
  UserPermissionOverride: "user_permission_override",
  Feedback: "feedback",
  PageVisit: "page_visit",
  TableThreshold: "table_threshold",
  AuthorizedSender: "authorized_sender",
  ClubMembership: "club_membership",
  AchievementPayload: "achievement_payload",
  AchievementCredit: "achievement_credit",
};

// Models the auto-audit extension never touches:
//  - AuditLog: would recurse (it's the audit table itself).
//  - VerificationToken: opaque, high-churn NextAuth tokens; no entity identity.
//  - Account/User: auth churn (lastLoginAt, token refresh) is noise; meaningful
//    user/role admin actions are audited semantically by their service layer.
//  - FeatureFlag/Notification (M0): audited SEMANTICALLY by their services for the
//    meaningful events (plugin toggle; request assign/resolve). The public account/
//    reset REQUEST create is itself the durable record (no auth actor) — not audited.
//  - Feedback/TableThreshold/AuthorizedSender (M7/M8): audited SEMANTICALLY by their
//    services (assign/resolve, threshold set, sender add/remove); the public feedback
//    create is the durable record, not audited.
//  - PageVisit (M8): hidden, high-volume usage analytics — NEVER audited (it would
//    bury the log and double the write cost of every recorded visit).
//  - ClubMembership (M3): audited SEMANTICALLY by lib/memberships/service.mjs
//    (add/remove one row each; a bulk CSV sync writes ONE summary row).
//  - AchievementCredit (M4): audited SEMANTICALLY by lib/achievements/credits.mjs
//    (setAchievementCredits replaces the set + writes ONE summary row). The
//    achievement_payload itself is a CMS payload written inside the content service's
//    suppressed transaction (like every *_payload) — NOT skipped here.
const AUTO_AUDIT_SKIP = new Set([
  "AuditLog", "VerificationToken", "Account", "User", "FeatureFlag", "Notification",
  "Feedback", "PageVisit", "TableThreshold", "AuthorizedSender", "ClubMembership",
  "AchievementCredit",
]);

// Write operations the auto extension audits, mapped to the base audit action.
const WRITE_OP_ACTION = {
  create: "create",
  createMany: "create",
  update: "update",
  updateMany: "update",
  upsert: "update",
  delete: "delete",
  deleteMany: "delete",
};

const SINGLE_ROW_OPS = new Set(["create", "update", "upsert", "delete"]);

// Refine the action for a few models where a CRUD verb undersells the event.
// `before` distinguishes an inserting upsert (before == null → create) from an
// updating one, so an upsert is never mislabeled in the activity log.
function deriveAction(model, op, afterRow, before) {
  if (model === "RoleAssignment") {
    if (op === "create") return "grant_role";
    // setting revoked_at on an existing grant = a revoke
    if ((op === "update" || op === "upsert") && afterRow?.revokedAt) return "revoke_role";
  }
  if (op === "upsert") return before == null ? "create" : "update";
  return WRITE_OP_ACTION[op];
}

// The one and only audit_log writer. `client` is the RAW base client (or a tx
// when a semantic caller wants the row inside its own transaction). Pulls actor
// + request metadata from the ambient audit context; explicit fields win.
export async function recordAudit(client, entry) {
  const ctx = getAuditContext();
  const data = {
    actorUserId: entry.actorUserId ?? ctx.actorUserId ?? null,
    action: entry.action,
    entityType: entry.entityType,
    entityId: entry.entityId ?? null,
    academicYearId: entry.academicYearId ?? null,
    before: entry.before === undefined ? null : jsonSafe(entry.before),
    after: entry.after === undefined ? null : jsonSafe(entry.after),
    summary: entry.summary ?? null,
    ipAddress: entry.ipAddress ?? ctx.ipAddress ?? null,
    userAgent: entry.userAgent ?? ctx.userAgent ?? null,
  };
  return client.auditLog.create({ data });
}

// Best-effort variant for the auto path: never throws (a failed audit must not
// roll back or mask the user's mutation). Logs and continues.
async function recordAuditSafe(client, entry) {
  try {
    await recordAudit(client, entry);
  } catch (e) {
    console.warn(`[audit] failed to record ${entry.action} on ${entry.entityType}:`, e?.message ?? e);
  }
}

// Pull the academic_year_id off a row if it carries one (year context).
function yearOf(row) {
  return row && typeof row === "object" && "academicYearId" in row ? row.academicYearId ?? null : null;
}

// Build the Prisma Client extension that auto-audits mutations. Pass the RAW
// (un-extended) client as `base`; the extension uses it for before-reads and for
// the audit write itself, so it never re-enters the extension.
//
// NOTE (documented limitation, KNOWN_ISSUES): auto-audit writes go on `base`,
// not on an enclosing interactive transaction, so they are not rolled back with
// it. Multi-step atomic flows therefore use the SEMANTIC path (suppressAuto +
// after-commit recordAudit) instead of relying on auto-audit.
export function buildAuditExtension(base) {
  return {
    name: "audit-write",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          const action = WRITE_OP_ACTION[operation];

          // Reads and non-audited models pass straight through.
          if (!action || AUTO_AUDIT_SKIP.has(model)) {
            return query(args);
          }

          // When a semantic operation owns the audit, stand down.
          if (isAutoAuditSuppressed()) {
            return query(args);
          }

          const entityType = TABLE_BY_MODEL[model] ?? model;
          const isSingle = SINGLE_ROW_OPS.has(operation);

          // Capture a before-image for single-row update/delete/upsert.
          let before = null;
          if (isSingle && (operation === "update" || operation === "delete" || operation === "upsert") && args?.where) {
            try {
              const accessor = model.charAt(0).toLowerCase() + model.slice(1);
              before = await base[accessor].findFirst({ where: args.where });
            } catch {
              before = null;
            }
          }

          const result = await query(args);

          const afterRow = operation === "delete" ? before : isSingle ? result : null;
          await recordAuditSafe(base, {
            action: deriveAction(model, operation, afterRow, before),
            entityType,
            entityId: isSingle ? afterRow?.id ?? args?.where?.id ?? null : null,
            academicYearId: yearOf(afterRow),
            before: before ?? undefined,
            after: operation === "delete" ? undefined : afterRow ?? undefined,
            summary: isSingle ? null : `${operation} on ${entityType} (bulk)`,
          });

          return result;
        },
      },
    },
  };
}
