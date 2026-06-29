import { loadModuleContext } from "../../../lib/admin/server.mjs";
import { hasPerm } from "../../../lib/admin/nav.mjs";
import { listUsers, listRoles, listPermissionCatalog } from "../../../lib/users/admin.mjs";
import { ModuleDenied } from "../_components/parts";
import UsersClient from "./UsersClient";

// Users & Roles module (Session 9) — the UI over the NET-NEW lib/users/admin.mjs
// service: accounts, role definitions and role assignments. Reads are loaded here
// (each gated by user.read / role.read); mutations post to /api/admin/action.
export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const ctx = await loadModuleContext("users");
  if (ctx.state !== "ok") return <ModuleDenied module="Users & Roles" />;
  const actor = { userId: ctx.user.id };

  const canReadUsers = hasPerm(ctx.resolved, "user.read");
  const canReadRoles = hasPerm(ctx.resolved, "role.read");

  const [users, roles, catalog] = await Promise.all([
    canReadUsers ? listUsers({}, actor) : Promise.resolve([]),
    canReadRoles ? listRoles({ includeInactive: true }, actor) : Promise.resolve([]),
    canReadRoles ? listPermissionCatalog(actor) : Promise.resolve({ permissions: [], byModule: {} }),
  ]);

  return (
    <UsersClient
      users={users}
      roles={roles}
      catalog={catalog}
      perms={ctx.perms}
      viewerId={ctx.user.id}
      viewerIsDeveloper={!!ctx.user.isDeveloper}
      canReadUsers={canReadUsers}
      canReadRoles={canReadRoles}
    />
  );
}
