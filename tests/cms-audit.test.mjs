import { describe, it, expect } from "vitest";
import { jsonSafe, TABLE_BY_MODEL, recordAudit, buildAuditExtension } from "../lib/cms/audit.mjs";
import { withAuditContext } from "../lib/cms/audit-context.mjs";

// ── jsonSafe: snapshots must be JSON/JSONB-safe and stable ──
describe("jsonSafe (audit before/after normalization)", () => {
  it("stringifies BigInt and ISO-formats Dates, recursively", () => {
    const out = jsonSafe({
      bytes: 123456789012345678n,
      when: new Date("2026-01-02T03:04:05.000Z"),
      nested: { id: 7n, list: [new Date("2026-01-01T00:00:00.000Z"), "x"] },
    });
    expect(out.bytes).toBe("123456789012345678");
    expect(out.when).toBe("2026-01-02T03:04:05.000Z");
    expect(out.nested.id).toBe("7");
    expect(out.nested.list[0]).toBe("2026-01-01T00:00:00.000Z");
    expect(out.nested.list[1]).toBe("x");
  });

  it("drops undefined but preserves null/false/0/empty-string", () => {
    const out = jsonSafe({ a: undefined, b: null, c: false, d: 0, e: "" });
    expect("a" in out).toBe(false);
    expect(out.b).toBeNull();
    expect(out.c).toBe(false);
    expect(out.d).toBe(0);
    expect(out.e).toBe("");
  });
});

// ── TABLE_BY_MODEL covers the audited models ──
describe("TABLE_BY_MODEL", () => {
  it("maps spine models to snake_case tables", () => {
    expect(TABLE_BY_MODEL.ContentItem).toBe("content_item");
    expect(TABLE_BY_MODEL.ContentRevision).toBe("content_revision");
    expect(TABLE_BY_MODEL.RoleAssignment).toBe("role_assignment");
    expect(TABLE_BY_MODEL.MediaAsset).toBe("media_asset");
  });
});

// ── recordAudit: the single writer ──
describe("recordAudit", () => {
  it("writes one audit_log row, pulling actor + metadata from context", async () => {
    const writes = [];
    const fakeClient = { auditLog: { create: async ({ data }) => (writes.push(data), { id: 1n, ...data }) } };
    await withAuditContext({ actorUserId: "U1", ipAddress: "10.0.0.1", userAgent: "vitest" }, () =>
      recordAudit(fakeClient, { action: "publish", entityType: "content_item", entityId: "CI1", academicYearId: "Y1" })
    );
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      actorUserId: "U1",
      action: "publish",
      entityType: "content_item",
      entityId: "CI1",
      academicYearId: "Y1",
      ipAddress: "10.0.0.1",
      userAgent: "vitest",
    });
  });

  it("explicit actorUserId overrides context", async () => {
    const writes = [];
    const fakeClient = { auditLog: { create: async ({ data }) => (writes.push(data), data) } };
    await withAuditContext({ actorUserId: "CTX" }, () =>
      recordAudit(fakeClient, { actorUserId: "EXPLICIT", action: "create", entityType: "content_item" })
    );
    expect(writes[0].actorUserId).toBe("EXPLICIT");
  });
});

// ── the $extends auto-audit extension ──
function makeFakeBase() {
  const writes = [];
  const base = {
    _writes: writes,
    auditLog: { create: async ({ data }) => (writes.push(data), { id: BigInt(writes.length), ...data }) },
    contentItem: { findFirst: async ({ where }) => ({ id: where.id, status: "draft", academicYearId: "Y1" }) },
    roleAssignment: { findFirst: async () => null },
  };
  return base;
}

function runOp(ext, payload) {
  return ext.query.$allModels.$allOperations(payload);
}

describe("buildAuditExtension (auto per-statement audit)", () => {
  it("audits a create with entity type/id and after-image", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    const result = await runOp(ext, {
      model: "ContentItem",
      operation: "create",
      args: { data: { contentType: "event" } },
      query: async () => ({ id: "CI1", academicYearId: "Y1", status: "draft" }),
    });
    expect(result.id).toBe("CI1");
    expect(base._writes).toHaveLength(1);
    expect(base._writes[0]).toMatchObject({ action: "create", entityType: "content_item", entityId: "CI1", academicYearId: "Y1" });
    expect(base._writes[0].after).toMatchObject({ id: "CI1" });
  });

  it("captures a before-image on update", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    await runOp(ext, {
      model: "ContentItem",
      operation: "update",
      args: { where: { id: "CI1" }, data: { status: "published" } },
      query: async () => ({ id: "CI1", status: "published", academicYearId: "Y1" }),
    });
    expect(base._writes[0].action).toBe("update");
    expect(base._writes[0].before).toMatchObject({ id: "CI1", status: "draft" });
    expect(base._writes[0].after).toMatchObject({ status: "published" });
  });

  it("never audits the AuditLog model (no recursion)", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    await runOp(ext, { model: "AuditLog", operation: "create", args: { data: {} }, query: async () => ({ id: 99n }) });
    expect(base._writes).toHaveLength(0);
  });

  it("stands down when auto-audit is suppressed (semantic path owns it)", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    let ran = false;
    await withAuditContext({ suppressAuto: true }, () =>
      runOp(ext, { model: "ContentItem", operation: "create", args: { data: {} }, query: async () => ((ran = true), { id: "CI2" }) })
    );
    expect(ran).toBe(true); // the underlying mutation still runs
    expect(base._writes).toHaveLength(0); // but it is not auto-audited
  });

  it("derives grant_role / revoke_role for RoleAssignment", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    await runOp(ext, { model: "RoleAssignment", operation: "create", args: { data: {} }, query: async () => ({ id: "RA1" }) });
    await runOp(ext, {
      model: "RoleAssignment",
      operation: "update",
      args: { where: { id: "RA1" }, data: { revokedAt: new Date() } },
      query: async () => ({ id: "RA1", revokedAt: new Date() }),
    });
    expect(base._writes.map((w) => w.action)).toEqual(["grant_role", "revoke_role"]);
  });

  it("audits a delete with the before-image as entity id and a null after", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    await runOp(ext, {
      model: "ContentItem",
      operation: "delete",
      args: { where: { id: "CI9" } },
      query: async () => ({ id: "CI9" }),
    });
    expect(base._writes[0].action).toBe("delete");
    expect(base._writes[0].entityId).toBe("CI9"); // from the before-image
    expect(base._writes[0].before).toMatchObject({ id: "CI9" });
    expect(base._writes[0].after).toBeNull();
  });

  it("audits bulk ops with a null entity id and a (bulk) summary", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    await runOp(ext, { model: "ContentItem", operation: "deleteMany", args: { where: {} }, query: async () => ({ count: 3 }) });
    expect(base._writes[0]).toMatchObject({ action: "delete", entityType: "content_item", entityId: null });
    expect(base._writes[0].summary).toMatch(/bulk/);
  });

  it("derives create (not update) for an inserting upsert; update for an existing one", async () => {
    const base = makeFakeBase();
    base.mediaAsset = { findFirst: async () => null }; // no prior row → insert
    const ext = buildAuditExtension(base);
    await runOp(ext, { model: "MediaAsset", operation: "upsert", args: { where: { id: "M1" } }, query: async () => ({ id: "M1" }) });
    expect(base._writes[0].action).toBe("create");

    const base2 = makeFakeBase();
    base2.mediaAsset = { findFirst: async () => ({ id: "M2", url: "old" }) }; // prior row → update
    const ext2 = buildAuditExtension(base2);
    await runOp(ext2, { model: "MediaAsset", operation: "upsert", args: { where: { id: "M2" } }, query: async () => ({ id: "M2", url: "new" }) });
    expect(base2._writes[0].action).toBe("update");
  });

  it("never auto-audits the skip-set models (Account / User / VerificationToken)", async () => {
    const base = makeFakeBase();
    const ext = buildAuditExtension(base);
    for (const model of ["Account", "User", "VerificationToken"]) {
      await runOp(ext, { model, operation: "update", args: { where: { id: "x" }, data: {} }, query: async () => ({ id: "x" }) });
    }
    expect(base._writes).toHaveLength(0);
  });

  it("a failed audit write never breaks the underlying mutation", async () => {
    const base = makeFakeBase();
    base.auditLog.create = async () => {
      throw new Error("audit table offline");
    };
    const ext = buildAuditExtension(base);
    const result = await runOp(ext, {
      model: "ContentItem",
      operation: "create",
      args: { data: {} },
      query: async () => ({ id: "CI3" }),
    });
    expect(result.id).toBe("CI3"); // mutation result still returned
  });
});
