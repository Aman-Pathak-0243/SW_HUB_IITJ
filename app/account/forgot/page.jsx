import "../account.css";
import { ForgotCard, FeatureOff } from "../_components/AuthClient";
import { isMemberPlatformEnabled } from "../../../lib/platform/flags.mjs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Forgot password · Student Affairs IIT Jammu" };

export default async function ForgotPage() {
  let enabled = false;
  try { enabled = await isMemberPlatformEnabled(); } catch { enabled = false; }
  return enabled ? <ForgotCard /> : <FeatureOff />;
}
