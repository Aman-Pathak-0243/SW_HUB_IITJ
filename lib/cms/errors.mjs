// CMS error types + a translator from raw DB-guard violations into friendly,
// HTTP-shaped errors. The DB is the source of truth for integrity (partial
// uniques + the six triggers from the init migration); app code must NOT
// re-implement those rules (SESSION_PROTOCOL / NEXT_TASK guard rails). Instead,
// when a guard rejects a write, we catch the Postgres/Prisma error and surface a
// human-readable message with a stable `code` + `status`, so callers and future
// admin UIs can show something better than a stack trace.

// A CMS-layer error carrying an HTTP status + a machine code. Shaped like the
// auth errors in lib/auth/session.mjs (err.status / err.code) for uniform
// handling at route boundaries.
export class CmsError extends Error {
  constructor(message, { status = 400, code = "CMS_ERROR", cause } = {}) {
    super(message);
    this.name = "CmsError";
    this.status = status;
    this.code = code;
    if (cause) this.cause = cause;
  }
}

// Validation failure for caller-supplied input (before it ever reaches the DB).
export class CmsValidationError extends CmsError {
  constructor(message, opts = {}) {
    super(message, { status: 422, code: "CMS_VALIDATION", ...opts });
    this.name = "CmsValidationError";
  }
}

// Not found / wrong-item references.
export class CmsNotFoundError extends CmsError {
  constructor(message, opts = {}) {
    super(message, { status: 404, code: "CMS_NOT_FOUND", ...opts });
    this.name = "CmsNotFoundError";
  }
}

// Known DB-guard signatures → friendly messages. Each matcher inspects the raw
// error text (Prisma surfaces a trigger's `RAISE EXCEPTION` message verbatim in
// either err.message or err.meta.message) and returns a CmsError. Order matters:
// most specific first.
const GUARD_MATCHERS = [
  {
    test: (t) => t.includes("lock_guard"),
    make: () =>
      new CmsError(
        "This academic year is locked and read-only. To make a correction, unlock the year (or append a new revision) — existing locked-year rows cannot be edited in place.",
        { status: 409, code: "YEAR_LOCKED" }
      ),
  },
  {
    test: (t) => t.includes("content_item_pointer_guard"),
    make: () =>
      new CmsError(
        "Internal content-pointer integrity check failed: a published/draft pointer did not reference a matching revision of this item. This is a bug in the content service, not user input.",
        { status: 500, code: "POINTER_GUARD" }
      ),
  },
  {
    test: (t) => t.includes("org_unit_hierarchy_guard"),
    make: () =>
      new CmsError(
        "That parent unit is not allowed here: a child unit must sit in the same academic year and under an allowed parent type.",
        { status: 409, code: "ORG_HIERARCHY" }
      ),
  },
  {
    test: (t) => t.includes("appointment_type_guard"),
    make: () =>
      new CmsError(
        "That position is not valid for this unit (wrong unit type), or the unit/year do not match.",
        { status: 409, code: "APPOINTMENT_TYPE" }
      ),
  },
  {
    test: (t) => t.includes("appointment_cardinality_guard") || t.includes("appointment_singleton_position_uq"),
    make: () =>
      new CmsError(
        "This position is already filled to its maximum number of holders for this unit and year.",
        { status: 409, code: "APPOINTMENT_CARDINALITY" }
      ),
  },
  {
    test: (t) => t.includes("person_email_link_guard"),
    make: () =>
      new CmsError("A linked person's email must match their login account's email.", {
        status: 409,
        code: "PERSON_EMAIL_LINK",
      }),
  },
  {
    test: (t) => t.includes("content_revision_one_draft_uq"),
    make: () =>
      new CmsError(
        "This item already has an open draft. Edit or restore into the existing draft instead of creating a second one.",
        { status: 409, code: "ONE_DRAFT" }
      ),
  },
  {
    test: (t) => t.includes("content_revision_one_published_uq"),
    make: () =>
      new CmsError(
        "This item already has a live published revision. Supersede it before publishing another.",
        { status: 409, code: "ONE_PUBLISHED" }
      ),
  },
  {
    test: (t) => t.includes("content_item_slug_uq"),
    make: () =>
      new CmsError("That URL slug is already used by another item of this type in this year.", {
        status: 409,
        code: "SLUG_TAKEN",
      }),
  },
  {
    test: (t) => t.includes("org_unit_academic_year_id_slug_key"),
    make: () =>
      new CmsError("That URL slug is already used by another organization unit in this year.", {
        status: 409,
        code: "SLUG_TAKEN",
      }),
  },
  {
    test: (t) => t.includes("appointment_no_dup_active_uq"),
    make: () =>
      new CmsError("That person is already appointed to this position in this unit for this year.", {
        status: 409,
        code: "APPOINTMENT_DUPLICATE",
      }),
  },
  // Users & Roles administration (Session 9) guard/unique signatures.
  {
    test: (t) => t.includes("role_assignment_unique_active_grant_uq"),
    make: () =>
      new CmsError("That role is already granted to this user at this scope.", {
        status: 409,
        code: "ROLE_ASSIGNMENT_DUPLICATE",
      }),
  },
  {
    test: (t) => t.includes("role_key_key"),
    make: () => new CmsError("A role with that key already exists.", { status: 409, code: "ROLE_KEY_TAKEN" }),
  },
  {
    test: (t) => t.includes("app_user_email_key"),
    make: () => new CmsError("An account with that email already exists.", { status: 409, code: "EMAIL_TAKEN" }),
  },
  {
    test: (t) => t.includes("content_revision_content_item_id_revision_no_key"),
    make: () =>
      new CmsError("A revision with that number already exists for this item (concurrent edit?).", {
        status: 409,
        code: "REVISION_NO_CONFLICT",
      }),
  },
  // Payload CHECK constraints (the DB rejects bad caller input on the typed
  // payload columns; Postgres includes the constraint name in the message).
  {
    test: (t) => t.includes("event_publish_window_chk") || t.includes("announcement_publish_window_chk"),
    make: () =>
      new CmsError("The publish-until time must be after the publish-from time.", {
        status: 422,
        code: "PUBLISH_WINDOW",
      }),
  },
  {
    test: (t) => t.includes("mess_capacity_chk"),
    make: () => new CmsError("Capacity cannot be negative.", { status: 422, code: "INVALID_CAPACITY" }),
  },
  {
    test: (t) => t.includes("mess_meal_time_order_chk"),
    make: () =>
      new CmsError("A meal's end time must be after its start time (set 'wraps midnight' for overnight windows).", {
        status: 422,
        code: "INVALID_MEAL_TIME",
      }),
  },
  // Academic Year Engine (Session 4) guard signatures.
  {
    test: (t) => t.includes("academic_year_one_current_uq"),
    make: () =>
      new CmsError("Another academic year is already set as current. Set-current demotes it automatically — retry.", {
        status: 409,
        code: "CURRENT_YEAR_CONFLICT",
      }),
  },
  {
    test: (t) => t.includes("transition_run_one_completed_uq"),
    make: () =>
      new CmsError("A completed transition already exists for this source→target pair. Re-run with force to re-sync.", {
        status: 409,
        code: "TRANSITION_EXISTS",
      }),
  },
  {
    test: (t) => t.includes("transition_no_self_chk"),
    make: () => new CmsError("A year cannot be transitioned into itself.", { status: 422, code: "TRANSITION_SELF" }),
  },
  {
    test: (t) => t.includes("org_unit_academic_year_id_lineage_key_key"),
    make: () =>
      new CmsError("That logical unit already exists in the target year (one instance per year).", {
        status: 409,
        code: "ONE_UNIT_PER_YEAR",
      }),
  },
  {
    test: (t) => t.includes("academic_year_label_format_chk"),
    make: () =>
      new CmsError("Year label must be in 'YYYY-YY' format (e.g. 2026-27).", {
        status: 422,
        code: "INVALID_YEAR_LABEL",
      }),
  },
  {
    test: (t) => t.includes("academic_year_date_order_chk"),
    make: () =>
      new CmsError("A year's end date must be after its start date.", { status: 422, code: "INVALID_YEAR_DATES" }),
  },
  {
    test: (t) => t.includes("academic_year_no_self_transition_chk"),
    make: () =>
      new CmsError("A year cannot record itself as the year it was transitioned from.", {
        status: 422,
        code: "INVALID_YEAR_PROVENANCE",
      }),
  },
  {
    test: (t) => t.includes("academic_year_label_key"),
    make: () =>
      new CmsError("An academic year with that label already exists.", { status: 409, code: "YEAR_LABEL_TAKEN" }),
  },
];

// Prisma known-request-error code → fallback friendly message when no trigger
// signature matched (e.g. a generic unique/FK violation).
function fromPrismaCode(err) {
  const code = err?.code;
  // Transient Neon connectivity (cold-wake / dropped connection / pool timeout).
  // lib/prisma.mjs already retries these; if a request still surfaces one, report a
  // 503 "try again" rather than a misleading 500 app-error.
  if (code === "P1001" || code === "P1017" || code === "P2024") {
    return new CmsError("The database is temporarily unavailable. Please try again in a moment.", {
      status: 503,
      code: "DB_UNAVAILABLE",
    });
  }
  if (code === "P2002") {
    const target = err?.meta?.target;
    const where = Array.isArray(target) ? ` (${target.join(", ")})` : target ? ` (${target})` : "";
    return new CmsError(`That value must be unique — a conflicting record already exists${where}.`, {
      status: 409,
      code: "UNIQUE_VIOLATION",
    });
  }
  if (code === "P2003") {
    return new CmsError("A referenced record does not exist (foreign-key check failed).", {
      status: 409,
      code: "FK_VIOLATION",
    });
  }
  if (code === "P2025") {
    return new CmsNotFoundError("The record was not found.");
  }
  return null;
}

// Translate any DB/Prisma error into a CmsError. If it's already a CmsError it
// is returned unchanged. Unrecognized errors are wrapped as a 500 so callers
// always get a consistent shape, but the original is preserved as `.cause`.
export function mapDbError(err) {
  if (err instanceof CmsError) return err;

  // Trigger RAISE messages can land in either of these.
  const text = `${err?.message ?? ""} ${err?.meta?.message ?? ""} ${err?.meta?.cause ?? ""}`;
  for (const m of GUARD_MATCHERS) {
    if (m.test(text)) {
      const e = m.make();
      e.cause = err;
      return e;
    }
  }

  const byCode = fromPrismaCode(err);
  if (byCode) {
    byCode.cause = err;
    return byCode;
  }

  return new CmsError("The operation could not be completed.", {
    status: 500,
    code: "CMS_INTERNAL",
    cause: err,
  });
}

// Convenience for service functions: run a DB block and rethrow mapped errors.
export async function withMappedDbErrors(fn) {
  try {
    return await fn();
  } catch (err) {
    throw mapDbError(err);
  }
}
