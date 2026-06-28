// NextAuth v4 App Router handler. The V1 hardcoded ADMIN_EMAILS allowlist
// (KNOWN_ISSUES #8) is GONE: identity comes from app_user + auth_account and
// authorization from role_assignment/role_permission (see lib/rbac/authorize.mjs
// and lib/auth/options.mjs). Admins are managed as data, not code.
import NextAuth from "next-auth";
import { authOptions } from "../../../../lib/auth/options.mjs";

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
