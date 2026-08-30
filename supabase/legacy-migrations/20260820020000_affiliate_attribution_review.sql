-- P4: admin per-attribution review (accept/reject a single pending
-- commission) at /admin/affiliate's "All attributions" table.
--
-- 'rejected' is a new, distinct terminal status alongside the existing
-- 'pending' | 'confirmed' | 'reversed' — deliberately NOT reusing 'reversed'
-- (that means "the underlying order was cancelled/refunded", automatic, no
-- human actor) so a supervisor reviewing history can still tell the two
-- apart. rejected_at/rejected_by mirror reversed_at's shape, plus the actor.
--
-- The status CHECK constraint was declared inline in 001_initial_schema.sql
-- (no explicit name), so this finds and drops it dynamically rather than
-- guessing Postgres's auto-generated name.

DO $$
DECLARE
  con_name text;
BEGIN
  SELECT conname INTO con_name
  FROM pg_constraint
  WHERE conrelid = 'affiliate_attributions'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%status%IN%';
  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE affiliate_attributions DROP CONSTRAINT %I', con_name);
  END IF;
END $$;

ALTER TABLE affiliate_attributions
  ADD CONSTRAINT affiliate_attributions_status_check
  CHECK (status IN ('pending', 'confirmed', 'reversed', 'rejected'));

ALTER TABLE affiliate_attributions
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES users(id);
