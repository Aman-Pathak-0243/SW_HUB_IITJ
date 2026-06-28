// NextAuth v4 configuration. Single source of auth config, imported by the
// route handler and by getServerSession() everywhere.
//
// - Adapter: PrismaAdapter over the canonical User/Account/VerificationToken
//   models (mapped to app_user/auth_account/verification_token). DL-013/DL-017.
// - Providers: Google OAuth + email/password Credentials (argon2id).
// - ONE ACCOUNT PER EMAIL: Google uses allowDangerousEmailAccountLinking so a
//   Google sign-in links to the existing app_user with the same (citext) email
//   instead of erroring; credentials authenticate against the same app_user.
// - Sessions: JWT (no Session table). Authorization permissions are resolved
//   live from the DB per request (see lib/rbac/authorize.mjs), so JWT revocation
//   latency does not affect access decisions.
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { PrismaAdapter } from "@next-auth/prisma-adapter";
import prisma from "../prisma.mjs";
import { verifyPassword } from "./password.mjs";

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
// non-active accounts, and wrong passwords.
export async function authorizeCredentials(credentials) {
  if (!credentials?.email || !credentials?.password) return null;
  const email = String(credentials.email).trim();
  // email column is citext, so the lookup is case-insensitive.
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) return null;
  if (user.status !== "active") return null;
  const ok = await verifyPassword(user.passwordHash, String(credentials.password));
  if (!ok) return null;
  return { id: user.id, email: user.email, name: user.name, image: user.image };
}

export const authOptions = {
  adapter: buildAdapter(),
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: "jwt", maxAge: SESSION_MAX_AGE_SECONDS },
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      // One account per email across sign-in methods (MASTER_PROMPT requirement).
      allowDangerousEmailAccountLinking: true,
    }),
    CredentialsProvider({
      name: "Email and Password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      authorize: authorizeCredentials,
    }),
  ],
  callbacks: {
    // Block suspended/disabled accounts at the authentication boundary — for BOTH
    // OAuth and credentials. Credentials.authorize() already rejects non-active
    // users; this also covers the Google path (a suspended user who previously
    // linked Google could otherwise re-authenticate). Brand-new OAuth users were
    // just created with status 'active', so they pass.
    async signIn({ user }) {
      if (!user?.id) return true;
      const u = await prisma.user.findUnique({
        where: { id: user.id },
        select: { status: true },
      });
      return !u || u.status === "active";
    },
    async jwt({ token, user }) {
      if (user) token.uid = user.id;
      // Cache the developer flag on the token for cheap UI gating only.
      // Authoritative permission checks always hit the DB (authorize.mjs).
      if (token.uid && token.isDeveloper === undefined) {
        const u = await prisma.user.findUnique({
          where: { id: token.uid },
          select: { isDeveloper: true },
        });
        token.isDeveloper = !!u?.isDeveloper;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.uid;
        session.user.isDeveloper = !!token.isDeveloper;
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
