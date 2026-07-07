import "../account/account.css";
import { FeatureOff } from "../account/_components/AuthClient";
import { isMemberPlatformEnabled } from "../../lib/platform/flags.mjs";
import FeedbackForm from "./FeedbackForm";

// Public feedback / support-ticket page (M7, DL-070). Gated behind the
// member_platform plugin (the legacy portal shows the "not available" card while
// off). The form posts to the CSRF + rate-limited /api/feedback route.
export const dynamic = "force-dynamic";
export const metadata = { title: "Send feedback · Student Affairs IIT Jammu" };

export default async function FeedbackPage() {
  let enabled = false;
  try { enabled = await isMemberPlatformEnabled(); } catch { enabled = false; }
  return (
    <div className="acc-root">
      {enabled ? <FeedbackForm /> : <FeatureOff />}
    </div>
  );
}
