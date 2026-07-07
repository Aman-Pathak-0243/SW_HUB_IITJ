// NextAuth v4 configuration. Single source of auth config, imported by the
// route handler and by getServerSession() everywhere.
//
// - Adapter: PrismaAdapter over the canonical User/Account/VerificationToken
//   models (mapped to app_user/auth_account/verification_token). DL-013/DL-017.
// - Providers: email/password Credentials (argon2id) always; Google OAuth ONLY
//   when GOOGLE_CLIENT_ID is configured (legacy). When the member-platform PLUGIN
//   is enabled (DL-058), Google sign-in is REJECTED at the signIn callback —
//   the member platform is email+password ONLY; with the plugin OFF the legacy
//   Google path keeps working (operator-controlled, reversible cutover).
// - Sessions: JWT (no Session table). Authorization permissions are resolved live
//   from the DB per request (see lib/rbac/authorize.mjs), so JWT revocation
//   latency does not affect access decisions. The token additionally carries
//   `mustChangePassword` (M0) for the forced first-login change.
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "../prisma.mjs";
import { verifyPassword } from "./password.mjs";
import { isMemberPlatformEnabled } from "../platform/flags.mjs";
import { canLogin } from "./access.mjs";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24; // 24h (DL-019)

// app_user.display_name (Prisma field `name`) is NOT NULL, but a Google profile
// can occasionally omit `name`. Wrap the canonical adapter's createUser to
// coalesce name -> email so first-time OAuth sign-in never fails on the NOT NULL.
function buildAdapter() {
  const base = PrismaAdapter(prisma);
  return {
    ...base,
    createUser: (data) =>
      prisma.user.create({ data: { ...data, name: data.name || data.email } }),
  };
}

// Credentials authentication. Exported (and unit-tested) separately from the
// provider config. Returns the NextAuth user on success, or null to reject.
// Rejects: missing fields, unknown email, OAuth-only accounts (no passwordHash),
// REVOKED accounts (M1, DL-065 — `inactive` accounts CAN still log in to browse),
// and wrong passwords. A must-change account CAN sign in (its forced change is
// enforced after authentication via `mustChangePassword` on the session + the
// middleware).
export async function authorizeCredentials(credentials) {
  if (!credentials?.email || !credentials?.password) return null;
  const email = String(credentials.email).trim();
  // email column is citext, so the lookup is case-insensitive.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  if (!canLogin(user.status)) return null; // revoked (or any non-loginable) → reject
  const ok = await verifyPassword(user.passwordHash, String(credentials.password));
  if (!ok) return null;
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    image: user.image,
    mustChangePassword: !!user.mustChangePassword,
  };
}

// Build the providers list. Google is included only when its env is configured.
function buildProviders() {
  const providers = [
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ];
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    providers.unshift(
      GoogleProvider({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        // One account per email across sign-in methods (legacy behavior).
        allowDangerousEmailAccountLinking: true,
      })
    );
  }
  return providers;
}

export const authOptions = {
  adapter: buildAdapter(),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: buildProviders(),
  callbacks: {
    // Block REVOKED accounts at the authentication boundary (BOTH OAuth and
    // credentials — credentials.authorize already rejects them; this also covers a
    // previously-linked Google account). M1 (DL-065): `inactive` accounts may sign
    // in (they browse as members); only `revoked` is rejected here. Additionally,
    // when the member platform PLUGIN is enabled, REJECT Google sign-ins entirely
    // (email+password only, DL-058) — checked live from the DB flag (the signIn
    // callback runs on the Node runtime, so a Prisma read is available here).
    async signIn({ user, account }) {
      // Reject Google when the member platform is on (email+password only, DL-058).
      // This is an allow/DENY auth restriction, so it must fail toward DENY: pass
      // onError:true so a transient Neon read failure (while the plugin is on)
      // rejects Google rather than silently re-permitting the legacy provider.
      if (account?.provider === "google" && (await isMemberPlatformEnabled({ onError: true }))) {
        return false;
      }
      if (!user?.id) return true;
      const u = await prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true },
      });
      return !u || canLogin(u.status); // revoked → reject; active/inactive → allow
    },
    async jwt({ token, user, trigger }) {
      if (user) {
        token.uid = user.id;
        token.mustChangePassword = !!user.mustChangePassword;
      }
      // On sign-in, or when the client calls session.update() (after a password
      // change), refresh the live flags from the DB so the forced-change gate
      // clears immediately. Between those, the cached token values are used.
      if (token.uid && (trigger === "update" || token.isDeveloper === undefined)) {
        const u = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { isDeveloper: true, mustChangePassword: true },
        });
        token.isDeveloper = !!u?.isDeveloper;
        token.mustChangePassword = !!u?.mustChangePassword;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.isDeveloper = !!token.isDeveloper;
        session.user.mustChangePassword = !!token.mustChangePassword;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user?.id) {
        await prisma.user
          .update({ where: { id: user.id }, data: { lastLoginAt: new Date() } })
          .catch(() => {});
      }
    },
  },
};
