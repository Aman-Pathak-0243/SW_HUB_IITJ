-- ============================================================================
-- Session 5 fix — appointment_type_guard: is_singleton must never be NULL.
-- ============================================================================
-- The original trigger computed `NEW.is_singleton := (v_max_holders = 1)`. For an
-- UNLIMITED position (position.max_holders IS NULL — coordinators, caretakers,
-- wellness wardens, attendants, mess committee members) that expression is
-- `(NULL = 1)` → NULL, which violates appointment.is_singleton NOT NULL. No prior
-- session created an unlimited-holder appointment (Session 4 only copied a
-- singleton secretary), so the bug was latent until the Session-5 org import /
-- roster service inserted the first multi-holder appointment. Fix: a NULL
-- max_holders is NOT a singleton (false). CREATE OR REPLACE is idempotent and
-- leaves the existing appointment_type_guard_trg trigger pointing at the function.
CREATE OR REPLACE FUNCTION appointment_type_guard() RETURNS trigger AS $$
DECLARE
  v_unit_type uuid;
  v_applies_to uuid;
  v_max_holders int;
BEGIN
  SELECT org_unit_type_id INTO v_unit_type FROM org_unit
    WHERE id = NEW.org_unit_id AND academic_year_id = NEW.academic_year_id;
  IF v_unit_type IS NULL THEN
    RAISE EXCEPTION 'appointment_type_guard: org_unit % not found in academic year %',
      NEW.org_unit_id, NEW.academic_year_id USING ERRCODE = 'foreign_key_violation';
  END IF;

  IF NEW.org_unit_type_id IS NULL THEN
    NEW.org_unit_type_id := v_unit_type;
  ELSIF NEW.org_unit_type_id <> v_unit_type THEN
    RAISE EXCEPTION 'appointment_type_guard: org_unit_type_id % does not match org_unit''s actual type %',
      NEW.org_unit_type_id, v_unit_type USING ERRCODE = 'check_violation';
  END IF;

  SELECT applies_to_type_id, max_holders INTO v_applies_to, v_max_holders
    FROM position WHERE id = NEW.position_id;
  IF v_applies_to IS NOT NULL AND v_applies_to <> v_unit_type THEN
    RAISE EXCEPTION 'appointment_type_guard: position % (applies to type %) is not valid for org_unit of type %',
      NEW.position_id, v_applies_to, v_unit_type USING ERRCODE = 'check_violation';
  END IF;

  -- Maintain the denormalized singleton flag that backs appointment_singleton_position_uq.
  -- COALESCE guards the NULL max_holders (unlimited) case → not a singleton.
  NEW.is_singleton := COALESCE(v_max_holders = 1, false);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
