// CMS content service (capabilities 6 & 7) — the draft/publish lifecycle, the
// immutable version history, and restore, over the content spine
// (content_item + content_revision + per-type *_payload). It is payload-shape-
// agnostic: every payload read/write routes through the generic handler map in
// lib/cms/content-types.mjs.
//
// INTEGRITY IS THE DATABASE'S JOB. We do not re-implement the one-draft /
// one-published partial uniques or the content_item_pointer_guard /
// lock_guard triggers in app code — we honor their ordering and surface a
// friendly error when they reject a write (lib/cms/errors.mjs). The only
// app-side checks here are input validation and not-found / wrong-item guards.
//
// AUDIT: each mutating operation runs inside one transaction with auto-audit
// suppressed, then writes exactly ONE semantic audit_log row after commit
// (DL-012 / DL-028; see lib/cms/audit.mjs).
//
// AUTHORIZATION: every mutating function reuses the Session-2 RBAC util
// (assertPermission) against the item's (year, org-lineage) scope, unless the
// caller is a system actor. Route handlers additionally call requirePermission
// for authentication (Session 9 admin panel).
import { randomUUID } from "node:crypto";
import prisma from "../prisma.mjs";
import { assertPermission, userCan } from "../rbac/authorize.mjs";
import { getContentTypeHandler, getContentTypeDef } from "./content-types.mjs";
import { auditedMutation } from "./audited-mutation.mjs";
import { CmsValidationError, CmsNotFoundError } from "./errors.mjs";

const ENTITY = "content_item";

// Permission key per mutating operation (capability-3 grain).
export const CONTENT_OP_PERMISSIONS = {
  create: "content.create",
  edit: "content.update",
  publish: "content.publish",
  unpublish: "content.unpublish",
  archive: "content.archive",
  restore: "content.restore",
};

// ── internal helpers ──────────────────────────────────────────────────────

// Resolve the org-unit LINEAGE key for RBAC scope from a content_item's
// orgUnitId (content RBAC can be scoped to a logical unit across years).
async function resolveOrgLineageKey(orgUnitId) {
  if (!orgUnitId) return undefined;
  const unit = await prisma.orgUnit.findUnique({ where: { id: orgUnitId }, select: { lineageKey: true } });
  return unit?.lineageKey ?? undefined;
}

// Enforce a permission for the actor against an item's scope. `actor.system`
// bypasses (seed/migration/cron). Throws a 401/403-shaped error otherwise.
async function authorize(actor, op, scope) {
  if (actor?.system) return;
  if (!actor?.userId) {
    const err = new Error("An actor user id is required for this operation.");
    err.status = 401;
    err.code = "UNAUTHENTICATED";
    throw err;
  }
  await assertPermission(actor.userId, CONTENT_OP_PERMISSIONS[op], scope);
}

async function loadItemOrThrow(itemId) {
  const item = await prisma.contentItem.findUnique({ where: { id: itemId } });
  if (!item) throw new CmsNotFoundError(`Content item ${itemId} not found.`);
  return item;
}

async function nextRevisionNo(tx, contentItemId) {
  const top = await tx.contentRevision.findFirst({
    where: { contentItemId },
    orderBy: { revisionNo: "desc" },
    select: { revisionNo: true },
  });
  return (top?.revisionNo ?? 0) + 1;
}

// A compact, JSON-safe snapshot of a content_item for audit before/after.
function itemSnapshot(item) {
  if (!item) return null;
  return {
    id: item.id,
    contentType: item.contentType,
    academicYearId: item.academicYearId,
    orgUnitId: item.orgUnitId,
    slug: item.slug,
    status: item.status,
    publishedRevisionId: item.publishedRevisionId,
    draftRevisionId: item.draftRevisionId,
    pinned: item.pinned,
    archivedAt: item.archivedAt,
  };
}

// ── lifecycle operations ───────────────────────────────────────────────────

// Create a new content item with its first draft revision + typed payload.
// input: { contentType, academicYearId?, orgUnitId?, lineageKey?, slug?, title,
//          summary?, changeNote?, pinned?, payload? }
export async function createDraft(input, actor = {}) {
  const def = getContentTypeDef(input.contentType);
  const handler = getContentTypeHandler(input.contentType);
  if (!def || !handler) throw new CmsValidationError(`Unknown content type '${input.contentType}'.`);
  if (!input.title) throw new CmsValidationError("A title is required.");
  if (def.isYearScoped && !input.academicYearId) {
    throw new CmsValidationError(`Content type '${input.contentType}' is year-scoped; academicYearId is required.`);
  }
  if (def.isOrgBound && !input.orgUnitId) {
    throw new CmsValidationError(`Content type '${input.contentType}' must be bound to an org unit; orgUnitId is required.`);
  }

  const lineageKey = input.lineageKey ?? randomUUID();
  const scope = { academicYearId: input.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(input.orgUnitId) };
  await authorize(actor, "create", scope);

  return auditedMutation(
    actor,
    async (tx) => {
      const item = await tx.contentItem.create({
        data: {
          contentType: input.contentType,
          academicYearId: input.academicYearId ?? null,
          orgUnitId: input.orgUnitId ?? null,
          lineageKey,
          slug: input.slug ?? null,
          status: "draft",
          pinned: input.pinned ?? false,
          createdById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
      });
      const revision = await tx.contentRevision.create({
        data: {
          contentItemId: item.id,
          revisionNo: 1,
          revisionStatus: "draft",
          title: input.title,
          summary: input.summary ?? null,
          changeNote: input.changeNote ?? null,
          createdById: actor?.userId ?? null,
        },
      });
      await handler.writePayload(tx, revision.id, input.payload ?? {}, { isCreate: true });
      const updated = await tx.contentItem.update({
        where: { id: item.id },
        data: { draftRevisionId: revision.id },
      });
      return { item: updated, revision };
    },
    ({ item, revision }) => ({
      action: "create",
      entityType: ENTITY,
      entityId: item.id,
      academicYearId: item.academicYearId,
      after: { ...itemSnapshot(item), revisionNo: revision.revisionNo, title: revision.title },
      summary: `Created ${item.contentType} draft "${revision.title}"`,
    })
  );
}

// Edit the working draft. If the item has no open draft (it was published and
// the draft pointer cleared), a fresh draft revision is opened from the
// published (or latest) revision and the edits applied to it.
// patch: { title?, summary?, changeNote?, slug?, pinned?, payload? }
export async function editDraft(itemId, patch = {}, actor = {}) {
  const item = await loadItemOrThrow(itemId);
  const handler = getContentTypeHandler(item.contentType);
  if (!handler) throw new CmsValidationError(`Unknown content type '${item.contentType}'.`);
  const scope = { academicYearId: item.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(item.orgUnitId) };
  await authorize(actor, "edit", scope);

  return auditedMutation(
    actor,
    async (tx) => {
      let draftId = item.draftRevisionId;
      let openedNewDraft = false;
      let newRevisionNo = null;
      let changed = false;

      if (draftId) {
        const revData = {};
        if (patch.title !== undefined) revData.title = patch.title;
        if (patch.summary !== undefined) revData.summary = patch.summary;
        if (patch.changeNote !== undefined) revData.changeNote = patch.changeNote;
        if (Object.keys(revData).length) {
          await tx.contentRevision.update({ where: { id: draftId }, data: revData });
          changed = true;
        }
        if (patch.payload) {
          await handler.writePayload(tx, draftId, patch.payload, { isCreate: false });
          changed = true;
        }
      } else {
        const sourceId = item.publishedRevisionId ?? (await tx.contentRevision.findFirst({
          where: { contentItemId: item.id },
          orderBy: { revisionNo: "desc" },
          select: { id: true },
        }))?.id;
        if (!sourceId) throw new CmsValidationError("This item has no revision to edit.");
        const src = await tx.contentRevision.findUnique({ where: { id: sourceId } });
        const revisionNo = await nextRevisionNo(tx, item.id);
        const newRev = await tx.contentRevision.create({
          data: {
            contentItemId: item.id,
            revisionNo,
            revisionStatus: "draft",
            title: patch.title ?? src.title,
            summary: patch.summary !== undefined ? patch.summary : src.summary,
            changeNote: patch.changeNote ?? null,
            createdById: actor?.userId ?? null,
          },
        });
        await handler.copyPayload(tx, sourceId, newRev.id);
        if (patch.payload) await handler.writePayload(tx, newRev.id, patch.payload, { isCreate: false });
        draftId = newRev.id;
        newRevisionNo = newRev.revisionNo;
        openedNewDraft = true;
        changed = true;
      }

      const itemData = {};
      if (patch.slug !== undefined) {
        itemData.slug = patch.slug;
        changed = true;
      }
      if (patch.pinned !== undefined) {
        itemData.pinned = patch.pinned;
        changed = true;
      }
      if (openedNewDraft) itemData.draftRevisionId = draftId;

      // Skip the item touch + audit row entirely on a true no-op (empty patch).
      let updated = item;
      if (changed) {
        itemData.updatedById = actor?.userId ?? null;
        updated = await tx.contentItem.update({ where: { id: item.id }, data: itemData });
      }
      return { item: updated, draftRevisionId: draftId, openedNewDraft, newRevisionNo, changed };
    },
    ({ item: updated, openedNewDraft, newRevisionNo, changed }) =>
      changed
        ? {
            action: "update",
            entityType: ENTITY,
            entityId: updated.id,
            academicYearId: updated.academicYearId,
            before: itemSnapshot(item),
            after: itemSnapshot(updated),
            summary: openedNewDraft
              ? `Opened and edited a new draft (revision ${newRevisionNo}) of ${updated.contentType}`
              : `Edited the open draft of ${updated.contentType}`,
          }
        : null
  );
}

// Publish the open draft: supersede the prior published revision (if any), mark
// the draft revision published, and repoint content_item.published_revision_id.
export async function publish(itemId, opts = {}, actor = {}) {
  const item = await loadItemOrThrow(itemId);
  // Authorize BEFORE any state-based precondition so an unauthorized caller can
  // neither act nor probe item state (no auth-after-disclosure).
  const scope = { academicYearId: item.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(item.orgUnitId) };
  await authorize(actor, "publish", scope);
  if (!item.draftRevisionId) throw new CmsValidationError("Nothing to publish — this item has no open draft.");

  return auditedMutation(
    actor,
    async (tx) => {
      const draftId = item.draftRevisionId;
      const oldPublishedId = item.publishedRevisionId;
      // Supersede the prior published revision FIRST so the one-published partial
      // unique never sees two published revisions of this item simultaneously.
      if (oldPublishedId && oldPublishedId !== draftId) {
        await tx.contentRevision.update({ where: { id: oldPublishedId }, data: { revisionStatus: "superseded" } });
      }
      await tx.contentRevision.update({ where: { id: draftId }, data: { revisionStatus: "published" } });
      const updated = await tx.contentItem.update({
        where: { id: item.id },
        data: {
          publishedRevisionId: draftId,
          draftRevisionId: null,
          status: "published",
          publishedAt: new Date(),
          publishedById: actor?.userId ?? null,
          updatedById: actor?.userId ?? null,
        },
      });
      return { item: updated, publishedRevisionId: draftId, supersededRevisionId: oldPublishedId ?? null };
    },
    ({ item: updated, publishedRevisionId, supersededRevisionId }) => ({
      action: "publish",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: itemSnapshot(item),
      after: itemSnapshot(updated),
      summary: supersededRevisionId
        ? `Published revision ${publishedRevisionId} (superseded ${supersededRevisionId})`
        : `Published revision ${publishedRevisionId}`,
    })
  );
}

// Inline "save & make live" (Session 15, DL-103) — the seam the public-page InlineEditor
// posts to. Edits the open/forked draft, then publishes it, in one call. Each step
// authorizes INTERNALLY at the item's (year, org-lineage) scope (edit → content.update,
// publish → content.publish), so a coordinator scoped to the unit can fix their own page
// and a draft-only co_coordinator gets a 403 on the publish step (the edit draft is kept).
// Two sequential transactions (DL-031), each writing its own semantic audit row. If the
// patch is a true no-op AND no draft was open, nothing is published (avoids a confusing
// "nothing to publish"); the client also short-circuits a no-op via patchHasChanges.
export async function editAndPublish(itemId, patch = {}, actor = {}) {
  // Authorize the edit at the item's scope BEFORE inspecting draft state (no auth-after-
  // disclosure), reusing the same scope editDraft/publish compute.
  const item = await loadItemOrThrow(itemId);
  const scope = { academicYearId: item.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(item.orgUnitId) };
  await authorize(actor, "edit", scope);
  // SAFETY (review, DL-103): inline "save & make live" must NEVER publish unpublished work it
  // did not author. If an open draft already exists (an editor is mid-edit in the admin panel),
  // merging our one-field fix and publishing would push their entire unreviewed draft live —
  // so refuse here and leave their draft untouched; they publish/discard it in the editor.
  // Only when there is NO open draft do we fork a fresh draft from the PUBLISHED revision,
  // apply the inline patch, and publish exactly that.
  if (item.draftRevisionId) {
    throw new CmsValidationError(
      "This item has an unpublished draft open in the editor. Publish or discard it in the admin panel, then edit inline.",
      { status: 409, code: "DRAFT_OPEN" }
    );
  }
  const res = await editDraft(itemId, patch, actor);
  if (res?.draftRevisionId) return publish(itemId, {}, actor);
  return res;
}

// Compute whether `userId` may inline-edit / publish a content item at the given scope,
// using the SAME permission keys editDraft/publish assert (no drift). A page passes the
// item's academicYearId + resolved orgUnitLineageKey; a null userId (anonymous) or an
// inactive account resolves to false (loadUserRbacInputs returns no permissions for a
// non-active user). Reads only, memoized per request via getEffectivePermissions.
export async function resolveInlineEditCapability({ userId, academicYearId = null, orgUnitLineageKey = null } = {}) {
  if (!userId) return { canEdit: false, canPublish: false };
  const scope = { academicYearId, orgUnitLineageKey };
  const [canEdit, canPublish] = await Promise.all([
    userCan(userId, CONTENT_OP_PERMISSIONS.edit, scope),
    userCan(userId, CONTENT_OP_PERMISSIONS.publish, scope),
  ]);
  return { canEdit, canPublish };
}

// Unpublish: remove the item from public view. The formerly-published revision
// becomes the editable draft again when no draft is open, else it is superseded.
export async function unpublish(itemId, actor = {}) {
  const item = await loadItemOrThrow(itemId);
  const scope = { academicYearId: item.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(item.orgUnitId) };
  await authorize(actor, "unpublish", scope);
  if (!item.publishedRevisionId) throw new CmsValidationError("This item is not published.");

  return auditedMutation(
    actor,
    async (tx) => {
      const pubId = item.publishedRevisionId;
      let draftId = item.draftRevisionId;
      if (!draftId) {
        await tx.contentRevision.update({ where: { id: pubId }, data: { revisionStatus: "draft" } });
        draftId = pubId;
      } else {
        await tx.contentRevision.update({ where: { id: pubId }, data: { revisionStatus: "superseded" } });
      }
      const updated = await tx.contentItem.update({
        where: { id: item.id },
        data: {
          publishedRevisionId: null,
          draftRevisionId: draftId,
          status: "draft",
          publishedAt: null,
          updatedById: actor?.userId ?? null,
        },
      });
      return { item: updated };
    },
    ({ item: updated }) => ({
      action: "unpublish",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: itemSnapshot(item),
      after: itemSnapshot(updated),
      summary: `Unpublished ${updated.contentType}`,
    })
  );
}

// Archive (soft-delete): never removes history. Visibility layer hides archived
// items. Revisions and the published pointer are preserved for audit / restore.
export async function archive(itemId, actor = {}) {
  const item = await loadItemOrThrow(itemId);
  const scope = { academicYearId: item.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(item.orgUnitId) };
  await authorize(actor, "archive", scope);
  if (item.archivedAt) return { item }; // idempotent no-op (only reached once authorized)

  return auditedMutation(
    actor,
    async (tx) => {
      const updated = await tx.contentItem.update({
        where: { id: item.id },
        data: { status: "archived", archivedAt: new Date(), updatedById: actor?.userId ?? null },
      });
      return { item: updated };
    },
    ({ item: updated }) => ({
      action: "archive",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: itemSnapshot(item),
      after: itemSnapshot(updated),
      summary: `Archived ${updated.contentType}`,
    })
  );
}

// Restore: overwrite the OPEN DRAFT in place with the contents of a prior
// revision (honoring the at-most-one-open-draft partial unique), recording
// is_restore_of_revision_id on that reused draft row. If no draft is open, a new
// draft revision is created from the source.
export async function restore(itemId, sourceRevisionId, opts = {}, actor = {}) {
  const item = await loadItemOrThrow(itemId);
  const handler = getContentTypeHandler(item.contentType);
  if (!handler) throw new CmsValidationError(`Unknown content type '${item.contentType}'.`);
  const scope = { academicYearId: item.academicYearId, orgUnitLineageKey: await resolveOrgLineageKey(item.orgUnitId) };
  await authorize(actor, "restore", scope);
  const src = await prisma.contentRevision.findUnique({ where: { id: sourceRevisionId } });
  if (!src || src.contentItemId !== item.id) {
    throw new CmsValidationError("The source revision does not belong to this content item.");
  }
  const changeNote = opts.changeNote ?? `Restored from revision ${src.revisionNo}`;

  return auditedMutation(
    actor,
    async (tx) => {
      let draftId = item.draftRevisionId;
      let openedNewDraft = false;
      if (draftId) {
        await tx.contentRevision.update({
          where: { id: draftId },
          data: { title: src.title, summary: src.summary, changeNote, isRestoreOfRevisionId: sourceRevisionId },
        });
        await handler.copyPayload(tx, sourceRevisionId, draftId);
      } else {
        const revisionNo = await nextRevisionNo(tx, item.id);
        const newRev = await tx.contentRevision.create({
          data: {
            contentItemId: item.id,
            revisionNo,
            revisionStatus: "draft",
            title: src.title,
            summary: src.summary,
            changeNote,
            isRestoreOfRevisionId: sourceRevisionId,
            createdById: actor?.userId ?? null,
          },
        });
        await handler.copyPayload(tx, sourceRevisionId, newRev.id);
        draftId = newRev.id;
        openedNewDraft = true;
        await tx.contentItem.update({ where: { id: item.id }, data: { draftRevisionId: draftId, updatedById: actor?.userId ?? null } });
      }
      const updated = await tx.contentItem.findUnique({ where: { id: item.id } });
      return { item: updated, draftRevisionId: draftId, restoredFrom: sourceRevisionId, openedNewDraft };
    },
    ({ item: updated, draftRevisionId, openedNewDraft }) => ({
      action: "restore",
      entityType: ENTITY,
      entityId: updated.id,
      academicYearId: updated.academicYearId,
      before: itemSnapshot(item),
      after: itemSnapshot(updated),
      summary: openedNewDraft
        ? `Restored revision ${src.revisionNo} into a new draft (${draftRevisionId})`
        : `Restored revision ${src.revisionNo} into the open draft (${draftRevisionId})`,
    })
  );
}

// ── version history (reads) ────────────────────────────────────────────────

// List a content item's revisions oldest→newest with provenance.
export async function listRevisions(itemId, { client = prisma } = {}) {
  return client.contentRevision.findMany({
    where: { contentItemId: itemId },
    orderBy: { revisionNo: "asc" },
    select: {
      id: true,
      revisionNo: true,
      revisionStatus: true,
      title: true,
      summary: true,
      changeNote: true,
      isRestoreOfRevisionId: true,
      createdAt: true,
      createdById: true,
    },
  });
}

// Read a full revision view: spine fields + typed payload (incl. list children).
export async function getRevision(revisionId, { client = prisma } = {}) {
  const revision = await client.contentRevision.findUnique({
    where: { id: revisionId },
    include: { contentItem: { select: { contentType: true } } },
  });
  if (!revision) return null;
  const handler = getContentTypeHandler(revision.contentItem.contentType);
  const payload = handler ? await handler.readPayload(client, revisionId) : null;
  return {
    id: revision.id,
    contentItemId: revision.contentItemId,
    contentType: revision.contentItem.contentType,
    revisionNo: revision.revisionNo,
    revisionStatus: revision.revisionStatus,
    title: revision.title,
    summary: revision.summary,
    changeNote: revision.changeNote,
    isRestoreOfRevisionId: revision.isRestoreOfRevisionId,
    createdAt: revision.createdAt,
    createdById: revision.createdById,
    payload,
  };
}

// Flatten a revision view to a single comparable record for diffing: the shared
// title/summary plus every payload field. Values are passed through as-is;
// valuesEqual handles type-aware comparison.
function flattenForDiff(view) {
  const flat = { title: view.title, summary: view.summary };
  if (view.payload) {
    for (const [k, v] of Object.entries(view.payload)) flat[k] = v ?? null;
  }
  return flat;
}

// Type-aware equality for diffing: Dates by ISO; arrays AND plain objects (e.g.
// the page_block JSONB `data`) by value via JSON.stringify; everything else by
// identity. (JSONB read back as an object is a fresh reference each read, so a
// reference compare would always report "changed".)
function valuesEqual(a, b) {
  if (a instanceof Date) a = a.toISOString();
  if (b instanceof Date) b = b.toISOString();
  if ((a && typeof a === "object") || (b && typeof b === "object")) {
    return JSON.stringify(a) === JSON.stringify(b);
  }
  return a === b;
}

// PURE field-level diff of two revision VIEWS (no DB). Exported so the diff logic
// is unit-testable without a database. Returns changed fields with from/to.
export function diffRevisionViews(a, b) {
  const fa = flattenForDiff(a);
  const fb = flattenForDiff(b);
  const keys = new Set([...Object.keys(fa), ...Object.keys(fb)]);
  const changes = {};
  for (const k of keys) {
    if (!valuesEqual(fa[k], fb[k])) changes[k] = { from: fa[k] ?? null, to: fb[k] ?? null };
  }
  return {
    contentItemId: a.contentItemId,
    from: { id: a.id, revisionNo: a.revisionNo, status: a.revisionStatus },
    to: { id: b.id, revisionNo: b.revisionNo, status: b.revisionStatus },
    changes,
    changed: Object.keys(changes),
  };
}

// Generic field-level diff between two revisions of the same item (reads both,
// then delegates to the pure diffRevisionViews).
export async function diffRevisions(revisionIdA, revisionIdB, { client = prisma } = {}) {
  const [a, b] = await Promise.all([getRevision(revisionIdA, { client }), getRevision(revisionIdB, { client })]);
  if (!a || !b) throw new CmsNotFoundError("One or both revisions were not found.");
  if (a.contentItemId !== b.contentItemId) {
    throw new CmsValidationError("Cannot diff revisions of different content items.");
  }
  return diffRevisionViews(a, b);
}

// Convenience admin read: the item header with its draft + published revision
// views in one call. Intended consumer is the Session-9 admin item page (the
// public read path is lib/cms/visibility.mjs); composes the tested getRevision.
export async function getItem(itemId, { client = prisma } = {}) {
  const item = await client.contentItem.findUnique({ where: { id: itemId } });
  if (!item) return null;
  const [draft, published] = await Promise.all([
    item.draftRevisionId ? getRevision(item.draftRevisionId, { client }) : null,
    item.publishedRevisionId ? getRevision(item.publishedRevisionId, { client }) : null,
  ]);
  return { item, draft, published };
}
