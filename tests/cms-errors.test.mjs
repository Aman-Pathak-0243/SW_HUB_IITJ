import { describe, it, expect } from "vitest";
import { mapDbError, CmsError, CmsValidationError, CmsNotFoundError } from "../lib/cms/errors.mjs";

describe("mapDbError: DB-guard violations → friendly errors", () => {
  it("passes a CmsError through unchanged", () => {
    const e = new CmsValidationError("bad input");
    expect(mapDbError(e)).toBe(e);
  });

  it("maps lock_guard trigger RAISE to YEAR_LOCKED (409)", () => {
    const raw = new Error("lock_guard: UPDATE on content_item blocked — academic year X is locked");
    const m = mapDbError(raw);
    expect(m).toBeInstanceOf(CmsError);
    expect(m.code).toBe("YEAR_LOCKED");
    expect(m.status).toBe(409);
    expect(m.cause).toBe(raw);
  });

  it("maps the one-draft and one-published partial uniques", () => {
    expect(mapDbError(new Error('unique constraint "content_revision_one_draft_uq"')).code).toBe("ONE_DRAFT");
    expect(mapDbError(new Error('unique constraint "content_revision_one_published_uq"')).code).toBe("ONE_PUBLISHED");
  });

  it("maps the pointer guard to a 500 (it's an internal invariant, not user input)", () => {
    const m = mapDbError(new Error("content_item_pointer_guard: published_revision_id ... is not a revision of content_item ..."));
    expect(m.code).toBe("POINTER_GUARD");
    expect(m.status).toBe(500);
  });

  it("maps the singleton appointment unique + cardinality guard", () => {
    expect(mapDbError(new Error('"appointment_singleton_position_uq"')).code).toBe("APPOINTMENT_CARDINALITY");
    expect(mapDbError(new Error("appointment_cardinality_guard: position ... allows at most")).code).toBe("APPOINTMENT_CARDINALITY");
  });

  it("reads trigger text from err.meta.message too (Prisma surface)", () => {
    const raw = { message: "An operation failed", meta: { message: "org_unit_hierarchy_guard: ..." } };
    expect(mapDbError(raw).code).toBe("ORG_HIERARCHY");
  });

  it("maps Prisma P2002 unique violation when no trigger matched", () => {
    const m = mapDbError({ code: "P2002", meta: { target: ["content_type", "academic_year_id", "slug"] } });
    expect(m.code).toBe("UNIQUE_VIOLATION");
    expect(m.status).toBe(409);
    expect(m.message).toMatch(/content_type, academic_year_id, slug/);
  });

  it("maps P2003 FK violation to a 409", () => {
    const m = mapDbError({ code: "P2003" });
    expect(m.code).toBe("FK_VIOLATION");
    expect(m.status).toBe(409);
  });

  it("maps P2025 to a not-found", () => {
    expect(mapDbError({ code: "P2025" })).toBeInstanceOf(CmsNotFoundError);
  });

  it("maps the remaining guard signatures (slug, revision-no, appointment-type, person-email-link)", () => {
    expect(mapDbError(new Error('unique constraint "content_item_slug_uq"')).code).toBe("SLUG_TAKEN");
    expect(mapDbError(new Error('"content_revision_content_item_id_revision_no_key"')).code).toBe("REVISION_NO_CONFLICT");
    expect(mapDbError(new Error("appointment_type_guard: position ...")).code).toBe("APPOINTMENT_TYPE");
    expect(mapDbError(new Error("person_email_link_guard: ...")).code).toBe("PERSON_EMAIL_LINK");
  });

  it("maps payload CHECK-constraint violations to friendly 422s", () => {
    expect(mapDbError(new Error('check constraint "event_publish_window_chk"')).code).toBe("PUBLISH_WINDOW");
    expect(mapDbError(new Error('check constraint "announcement_publish_window_chk"')).code).toBe("PUBLISH_WINDOW");
    expect(mapDbError(new Error('check constraint "mess_capacity_chk"')).code).toBe("INVALID_CAPACITY");
    expect(mapDbError(new Error('check constraint "mess_meal_time_order_chk"')).code).toBe("INVALID_MEAL_TIME");
    expect(mapDbError(new Error('check constraint "event_publish_window_chk"')).status).toBe(422);
  });

  it("passes a CmsValidationError thrown by payload validation through unchanged (422)", () => {
    const v = new CmsValidationError("Missing required field 'body' for announcement_payload.");
    const m = mapDbError(v);
    expect(m).toBe(v);
    expect(m.status).toBe(422);
    expect(m.code).toBe("CMS_VALIDATION");
  });

  it("wraps an unknown error as a 500 CMS_INTERNAL preserving the cause", () => {
    const raw = new Error("boom");
    const m = mapDbError(raw);
    expect(m.code).toBe("CMS_INTERNAL");
    expect(m.status).toBe(500);
    expect(m.cause).toBe(raw);
  });
});
