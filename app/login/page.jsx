import "../account/account.css";
import { SignInCard } from "../account/_components/AuthClient";
import { isMemberPlatformEnabled } from "../../lib/platform/flags.mjs";

// Member sign-in (M0). Email + password (the member platform is email+password
// only when its plugin is on). The "Request an account" / "Forgot password" links
// show only when the plugin is enabled (those flows are member-platform features).
export const dynamic = "force-dynamic";
export const metadata = { title: "Sign in · Student Affairs IIT Jammu" };

export default async function LoginPage() {
  let enabled = false;
  try {
    enabled = await isMemberPlatformEnabled();
  } catch {
    enabled = false;
  }
  return <SignInCard callbackUrl="/" showRequestLinks={enabled} />;
}
