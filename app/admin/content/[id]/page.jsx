import { loadModuleContext } from "../../../../lib/admin/server.mjs";
import { loadAdminContentItem } from "../../../../lib/admin/reads.mjs";
import { getContentTypeFieldSpec } from "../../../../lib/cms/content-types.mjs";
import { ModuleDenied, PageHead } from "../../_components/parts";
import ContentItemClient from "./ContentItemClient";

// Content item editor (Session 9) — draft editing, the full lifecycle, version
// history and a revision DIFF. Payload fields are rendered generically from the
// content-type field spec (lib/cms/content-types.mjs), so any type is editable
// here with no per-type screen (DL-011 registry).
export const dynamic = "force-dynamic";

export default async function ContentItemPage({ params }) {
  const ctx = await loadModuleContext("content");
  if (ctx.state !== "ok") return <ModuleDenied module="Content" />;

  const { id } = await params;
  const data = await loadAdminContentItem(id, { userId: ctx.user.id });
  if (!data) {
    return <PageHead title="Not found" subtitle="That content item does not exist." />;
  }
  const fieldSpec = getContentTypeFieldSpec(data.contentType);

  return <ContentItemClient data={JSON.parse(JSON.stringify(data))} fieldSpec={fieldSpec} perms={ctx.perms} />;
}
