import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { loadAdminContent } from "../../../lib/admin/reads.mjs";
import { resolveCurrentYear } from "../../../lib/year/context.mjs";
import { CONTENT_TYPE_DEFS, getContentTypeFieldSpec } from "../../../lib/cms/content-types.mjs";
import { ModuleDenied } from "../_components/parts";
import ContentClient from "./ContentClient";

// Content module (Session 9) — list every content_item in the current year (incl.
// drafts) and drive the CMS lifecycle (create / publish / unpublish / archive /
// restore + version history) through the gated /api/admin/action route. Editors,
// events, announcements, resources and the org *_profile payloads are ALL the same
// CMS spine, so this one screen serves every content type (DL-037/DL-041).
export const dynamic = "force-dynamic";

export default async function ContentPage({ searchParams }) {
  const ctx = await loadModuleContext("content");
  if (ctx.state !== "ok") return <ModuleDenied module="Content" />;

  const sp = await searchParams;
  const includeArchived = sp?.archived === "1";
  const typeFilter = sp?.type || undefined;

  const year = await resolveCurrentYear();
  const actor = { userId: ctx.user.id };
  const rows = year ? await loadAdminContent({ yearId: year.id, contentType: typeFilter, includeArchived }, actor) : [];

  // Content types an editor can create here, each carrying its REQUIRED payload
  // fields so the create form can collect them (a type like announcement/resource
  // has a NOT-NULL payload column and would 422 on an empty-payload create).
  const typeOptions = CONTENT_TYPE_DEFS.map((d) => {
    const spec = getContentTypeFieldSpec(d.contentType);
    return { contentType: d.contentType, label: d.label, isOrgBound: d.isOrgBound, requiredFields: spec?.requiredFields ?? [] };
  });

  return (
    <ContentClient
      rows={rows}
      perms={ctx.perms}
      currentYear={year ? { id: year.id, label: year.label, status: year.status } : null}
      typeOptions={typeOptions}
      filter={{ includeArchived, type: typeFilter || "" }}
    />
  );
}
