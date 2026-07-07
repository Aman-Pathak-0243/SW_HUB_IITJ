-- ============================================================================
-- Session 11 / M0 follow-up (adversarial review) — race-free request dedup.
-- ============================================================================
-- The notification service deduped open account/reset requests with a
-- check-then-act (findOpenRequest → create), which is a TOCTOU race under Neon
-- latency: concurrent same-email submissions could each see "no open row" and
-- both insert, flooding the queue. Add a DB-level partial UNIQUE so AT MOST ONE
-- OPEN request (status open|assigned) can exist per (type, subject_email); the
-- service now catches the violation and returns the existing row (DL-060). A
-- forward migration (additive), applied via `npm run db:migrate`.
CREATE UNIQUE INDEX "notification_one_open_per_email_uq"
  ON "notification" ("type", "subject_email")
  WHERE "status" IN ('open', 'assigned') AND "subject_email" IS NOT NULL;
