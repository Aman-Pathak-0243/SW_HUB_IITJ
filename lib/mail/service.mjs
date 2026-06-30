// Bulk mail (M8, DL-073) — nodemailer on the institute VM, rate-limited, with a
// progress bar, restricted to an admin/dev-maintained AUTHORIZED-SENDER allowlist.
// (Initial account passwords still go via the institute's EXTERNAL mail, not here —
// this is for stakeholder bulk comms.)
//
// Conventions: authorize FIRST (mail.send to send, mail.manage to maintain the
// allowlist); the allowlist mutations are audited (one semantic row); a bulk send
// writes ONE semantic audit row summarizing the run (cross-stakeholder action). The
// nodemailer transport is LAZY + INJECTABLE: the module imports fine without
// nodemailer installed (it is only require()d when an actual send runs and no
// transport was injected), so the static suite + a plugin-off deploy never need it.
import prisma, { prismaBase } from "../prisma.mjs";
import { assertActorPermission } from "../year/context.mjs";
import { auditedMutation } from "../cms/audited-mutation.mjs";
import { recordAudit } from "../cms/audit.mjs";
import { CmsValidationError, CmsError } from "../cms/errors.mjs";
import { normalizeEmail } from "../auth/email.mjs";
import { chunk, mailProgress, normalizeRecipients, DEFAULT_RATE_PER_MINUTE } from "./progress.mjs";

const ENTITY = "authorized_sender";
const MAIL_ENTITY = "mail";
const MAX_RECIPIENTS = 5000;

// ── PURE ──
export function shapeSender(s) {
  if (!s) return null;
  return {
    id: s.id,
    email: s.email,
    name: s.name ?? null,
    active: !!s.active,
    createdByEmail: s.createdBy?.email ?? null,
    createdAt: s.createdAt instanceof Date ? s.createdAt.toISOString() : s.createdAt ?? null,
  };
}

// ── authorized-sender allowlist ──
export async function listAuthorizedSenders(actor = {}, { client = prisma } = {}) {
  await assertActorPermission(actor, "mail.send"); // a sender needs to see the list to pick a "from"
  const rows = await client.authorizedSender.findMany({ orderBy: { email: "asc" }, include: { createdBy: { select: { email: true } } } });
  return rows.map(shapeSender);
}

// Internal (ungated) — is `email` an ACTIVE authorized sender? Used by sendBulk.
export async function isAuthorizedSender(email) {
  const clean = normalizeEmail(email);
  if (!clean) return false;
  const row = await prismaBase.authorizedSender.findUnique({ where: { email: clean }, select: { active: true } });
  return !!row?.active;
}

export async function addAuthorizedSender({ email, name, active = true } = {}, actor = {}) {
  await assertActorPermission(actor, "mail.manage");
  const clean = normalizeEmail(email);
  if (!clean) throw new CmsValidationError("A valid sender email is required.");
  const existing = await prisma.authorizedSender.findUnique({ where: { email: clean } });
  const { row } = await auditedMutation(
    actor,
    async (tx) => ({
      row: await tx.authorizedSender.upsert({
        where: { email: clean },
        update: { name: name ?? null, active: !!active },
        create: { email: clean, name: name ?? null, active: !!active, createdById: actor?.userId ?? null },
        include: { createdBy: { select: { email: true } } },
      }),
    }),
    ({ row }) => ({
      action: existing ? "update" : "create",
      entityType: ENTITY,
      entityId: row.id,
      after: { email: row.email, active: row.active },
      summary: `${existing ? "Updated" : "Authorized"} mail sender ${row.email}${row.active ? "" : " (inactive)"}`,
    })
  );
  return { sender: shapeSender(row) };
}

export async function removeAuthorizedSender(id, actor = {}) {
  await assertActorPermission(actor, "mail.manage");
  const existing = await prisma.authorizedSender.findUnique({ where: { id } });
  if (!existing) return { removed: false };
  await auditedMutation(
    actor,
    async (tx) => ({ row: await tx.authorizedSender.delete({ where: { id } }) }),
    () => ({ action: "delete", entityType: ENTITY, entityId: id, before: { email: existing.email }, summary: `Removed mail sender ${existing.email}` })
  );
  return { removed: true };
}

// ── transport (lazy + injectable) ──
// Returns a nodemailer-like transport with `.sendMail({from,to,subject,text,html})`.
// In tests a fake transport is injected. In prod we lazily require nodemailer and
// build an SMTP transport from env (MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS).
async function resolveTransport(injected) {
  if (injected) return injected;
  if (!process.env.MAIL_HOST) {
    throw new CmsError("Mail is not configured (set MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS).", { status: 503, code: "MAIL_NOT_CONFIGURED" });
  }
  let nodemailer;
  try {
    ({ default: nodemailer } = await import("nodemailer"));
  } catch {
    throw new CmsError("nodemailer is not installed on this deployment (run `npm install nodemailer`).", { status: 503, code: "MAIL_NOT_INSTALLED" });
  }
  return nodemailer.createTransport({
    host: process.env.MAIL_HOST,
    port: Number(process.env.MAIL_PORT) || 587,
    secure: process.env.MAIL_SECURE === "true",
    auth: process.env.MAIL_USER ? { user: process.env.MAIL_USER, pass: process.env.MAIL_PASS } : undefined,
  });
}

// ── bulk send (gated mail.send, rate-limited, audited) ──
// input: { from, subject, text?, html?, recipients: string[] }. opts.transport
// injects a fake transport (tests); opts.sleep injects the inter-batch pause (tests
// pass a no-op); opts.ratePerMinute bounds each batch; opts.onProgress(progress) is
// called after each recipient for a live progress bar.
export async function sendBulk(input = {}, actor = {}, { transport, sleep, ratePerMinute = DEFAULT_RATE_PER_MINUTE, onProgress } = {}) {
  await assertActorPermission(actor, "mail.send");
  const from = normalizeEmail(input.from);
  if (!from) throw new CmsValidationError("A 'from' sender is required.");
  if (!(await isAuthorizedSender(from))) {
    throw new CmsError(`'${input.from}' is not an active authorized sender.`, { status: 403, code: "SENDER_NOT_AUTHORIZED" });
  }
  const subject = String(input.subject ?? "").trim();
  if (!subject) throw new CmsValidationError("A subject is required.");
  if (!input.text && !input.html) throw new CmsValidationError("A text or html body is required.");
  const { valid, invalid } = normalizeRecipients(input.recipients);
  if (!valid.length) throw new CmsValidationError("At least one valid recipient is required.");
  if (valid.length > MAX_RECIPIENTS) {
    throw new CmsError(`Too many recipients (${valid.length} > ${MAX_RECIPIENTS}).`, { status: 422, code: "TOO_MANY_RECIPIENTS" });
  }

  const tx = await resolveTransport(transport);
  const pause = sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const total = valid.length;
  const results = [];
  let sent = 0;
  let failed = 0;

  const batches = chunk(valid, ratePerMinute);
  for (let b = 0; b < batches.length; b++) {
    for (const to of batches[b]) {
      try {
        await tx.sendMail({ from, to, subject, text: input.text, html: input.html });
        sent++;
        results.push({ to, ok: true });
      } catch (e) {
        failed++;
        results.push({ to, ok: false, error: e?.message ?? "send failed" });
      }
      if (onProgress) onProgress(mailProgress({ total, sent, failed }));
    }
    // Pace: pause a rolling minute between batches (skipped after the last batch).
    if (b < batches.length - 1) await pause(60_000);
  }

  const progress = mailProgress({ total, sent, failed });
  // One semantic audit row for the run (cross-stakeholder action). Mail bodies/
  // recipients are NOT stored in the audit log (PII/size) — only the accounting.
  await recordAudit(prismaBase, {
    actorUserId: actor?.userId ?? null,
    action: "create",
    entityType: MAIL_ENTITY,
    after: { from, subject, total, sent, failed },
    summary: `Bulk mail from ${from}: ${sent}/${total} sent${failed ? `, ${failed} failed` : ""}`,
  }).catch(() => {});

  return { from, subject, total, sent, failed, invalid, progress, results };
}
