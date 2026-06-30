// Admin-mediated password-reset orchestration (M0, DL-058). NO self-serve
// email-link reset by design — a stakeholder fulfils a queued password-reset
// request: take it (assign, audited) → generate a random password → set it +
// must_change_password → mark the request resolved → hand the operator the
// plaintext ONCE to deliver via the institute's external mail.
//
// This composes the existing services (notifications + users) — it adds no new
// mutation/audit pipeline. Each sub-call authorizes independently (notification.read
// /assign/resolve + user.update), so an actor missing any of them is rejected.
import { getNotification, assignNotification, resolveNotification, NOTIFICATION_TYPES } from "../notifications/service.mjs";
import { forcePasswordReset } from "../users/admin.mjs";
import prisma from "../prisma.mjs";
import { normalizeEmail } from "./email.mjs";
import { CmsError, CmsValidationError, CmsNotFoundError } from "../cms/errors.mjs";

// Fulfil a queued password-reset request end-to-end. Returns the generated
// plaintext ONCE (never stored / audited) for external delivery.
export async function fulfilResetRequest(notificationId, actor = {}) {
  const notif = await getNotification(notificationId, actor); // gated notification.read
  if (notif.type !== NOTIFICATION_TYPES.PASSWORD_RESET) {
    throw new CmsValidationError("That request is not a password-reset request.");
  }
  if (notif.status === "resolved" || notif.status === "dismissed") {
    throw new CmsError("This request is already closed.", { status: 409, code: "REQUEST_CLOSED" });
  }
  const email = normalizeEmail(notif.subjectEmail);
  const account = email ? await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } }) : null;
  if (!account) {
    throw new CmsNotFoundError(
      "No account exists for that email — dismiss this request instead of fulfilling it."
    );
  }

  // Take it (idempotent if already held), reset, then resolve. Each is audited.
  await assignNotification(notificationId, actor);
  const { generatedPassword, user } = await forcePasswordReset(account.id, actor);
  const { notification } = await resolveNotification(
    notificationId,
    { status: "resolved", note: "Password reset; new credential delivered via external mail." },
    actor
  );

  return { generatedPassword, user, userEmail: account.email, notification };
}
