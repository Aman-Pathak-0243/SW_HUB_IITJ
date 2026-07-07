import { loadModuleContext } from "../../../../lib/admin/server.mjs";
import { loadAdminContentItem, loadAdminOrgUnits } from "../../../../lib/admin/reads.mjs";
import { getContentTypeFieldSpec } from "../../../../lib/cms/content-types.mjs";
import { listCreditsForAchievement } from "../../../../lib/achievements/credits.mjs";
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

  // Wall-of-Fame credits editor (Session 14, DL-101): an achievement is a content_item,
  // so it is edited here. Its relational CREDITS (member/club) are managed via the
  // achievement.credits.set action. Load the current credits + the year's club/council
  // lineages (for the club-target dropdown), best-effort so a missing org_unit.read
  // permission never breaks the page — member-by-email crediting still works.
  let achievement = null;
  if (data.contentType === "achievement") {
    const actor = { userId: ctx.user.id };
    let credits = [];
    let unitOptions = [];
    try {
      credits = await listCreditsForAchievement(id);
    } catch (e) {
      console.warn("[content/[id]] achievement credits load failed:", e?.message ?? e);
    }
    try {
      const units = await loadAdminOrgUnits({ yearId: data.item.academicYearId }, actor);
      const seen = new Set();
      unitOptions = units
        .filter((u) => (u.typeKey === "club" || u.typeKey === "council") && u.lineageKey)
        .filter((u) => (seen.has(u.lineageKey) ? false : (seen.add(u.lineageKey), true)))
        .map((u) => ({ lineageKey: u.lineageKey, name: u.name, typeName: u.typeName }));
    } catch {
      // No org_unit.read — degrade to member-by-email crediting only.
    }
    achievement = { credits, unitOptions };
  }

  return (
    <ContentItemClient
      data={JSON.parse(JSON.stringify(data))}
      fieldSpec={fieldSpec}
      perms={ctx.perms}
      achievement={achievement ? JSON.parse(JSON.stringify(achievement)) : null}
    />
  );
}
