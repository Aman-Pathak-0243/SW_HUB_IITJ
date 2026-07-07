import "../account.css";
import { RequestAccountCard, FeatureOff } from "../_components/AuthClient";
import { isMemberPlatformEnabled } from "../../../lib/platform/flags.mjs";

export const dynamic = "force-dynamic";
export const metadata = { title: "Request an account · Student Affairs IIT Jammu" };

export default async function RequestAccountPage() {
  let enabled = false;
  try { enabled = await isMemberPlatformEnabled(); } catch { enabled = false; }
  return enabled ? <RequestAccountCard /> : <FeatureOff />;
}
