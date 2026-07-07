import { redirect } from "next/navigation";
import "../account.css";
import { ChangePasswordCard, FeatureOff } from "../_components/AuthClient";
import { isMemberPlatformEnabled } from "../../../lib/platform/flags.mjs";
import { getServerAuthSession } from "../../../lib/auth/session.mjs";
import prisma from "../../../lib/prisma.mjs";

// Self-service / forced change-password page (M0). The middleware redirects a
// must-change account here. Requires a session; reads the live must-change flag so
// the "forced" framing is accurate.
export const dynamic = "force-dynamic";
export const metadata = { title: "Change password · Student Affairs IIT Jammu" };

export default async function ChangePasswordPage() {
  let enabled = false;
  try { enabled = await isMemberPlatformEnabled(); } catch { enabled = false; }
  if (!enabled) return <FeatureOff />;

  const session = await getServerAuthSession();
  if (!session?.user?.id) redirect("/login");

  let forced = false;
  let email = session.user.email ?? null;
  try {
    const u = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { email: true, mustChangePassword: true },
    });
    forced = !!u?.mustChangePassword;
    email = u?.email ?? email;
  } catch {
    /* degrade to non-forced framing */
  }
  return <ChangePasswordCard email={email} forced={forced} />;
}
