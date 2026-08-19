-- ============================================================
-- P4 — CLAUDE-ADMIN-CONDUCT.md: make admin_conduct_flags genuinely
-- append-only, enforced by the DATABASE rather than by application code.
--
-- WHY THREE LAYERS, AND WHY RLS IS THE WEAKEST OF THEM
-- ----------------------------------------------------
-- The obvious implementation ("add RLS policies for SELECT/INSERT, omit
-- DELETE/UPDATE") does NOT make this table immutable, and believing it does
-- would make "immutable" a false claim. Verified empirically against the live
-- project before writing this migration:
--
--   as an authenticated super_admin (RLS applies):
--     SELECT ok; UPDATE/DELETE/INSERT all blocked by RLS default-deny
--   as service_role (BYPASSRLS — and every write in this app goes through it):
--     UPDATE original_text  *** ALLOWED ***
--     DELETE                *** ALLOWED ***
--
-- Supabase's `service_role` carries the BYPASSRLS attribute, so no RLS policy
-- is ever consulted for it. `ALTER TABLE ... FORCE ROW LEVEL SECURITY` does
-- not help either: FORCE removes the table-OWNER exemption, but a BYPASSRLS
-- role still bypasses. What DOES constrain service_role is (a) the privilege
-- system — GRANT/REVOKE apply to it normally — and (b) triggers, which fire
-- regardless of RLS. Hence:
--
--   Layer 1  RLS policies        -> which ROWS, and which principals (browser/JWT)
--   Layer 2  column-level GRANTs -> which COLUMNS may ever be written (binds service_role)
--   Layer 3  triggers            -> backstop + the open->reviewed one-way latch
--
-- RLS cannot express column immutability at all: an UPDATE policy's WITH CHECK
-- sees only the NEW row, never OLD, so "these columns did not change" is not
-- statable. That is Layer 2's job, and Layer 3 re-states it so the guarantee
-- survives anyone re-running 006_fix_default_grants.sql (whose ALTER DEFAULT
-- PRIVILEGES granted this table table-wide UPDATE/DELETE at creation time,
-- which is precisely what Layer 2 below revokes).
--
-- WHAT IS MUTABLE
-- ---------------
-- Exactly three columns, once, in one direction: status ('open' -> 'reviewed'),
-- reviewed_at, reviewed_by. Marking a flag reviewed neither hides nor alters
-- the incident. Everything describing the incident itself — flagged_admin_id,
-- target_user_id, source, source_ref_id, original_text, severity, created_at —
-- is write-once. A reviewed row is frozen entirely.
--
-- BREAK-GLASS (deliberate, auditable, requires the `postgres` role)
-- ----------------------------------------------------------------
-- An append-only audit table still needs a documented escape hatch (a GDPR
-- erasure request, a row created by a genuine bug). It is intentionally NOT
-- reachable from the application: service_role has no DELETE privilege, so
-- restoring one is an explicit, logged act by a database owner.
--
--   ALTER TABLE admin_conduct_flags DISABLE TRIGGER admin_conduct_flags_no_delete;
--   GRANT DELETE ON admin_conduct_flags TO service_role;
--   -- ... perform the deletion, recording who authorised it and why ...
--   REVOKE DELETE ON admin_conduct_flags FROM service_role;
--   ALTER TABLE admin_conduct_flags ENABLE TRIGGER admin_conduct_flags_no_delete;
--
-- Also below: moderation_flags' read policy is tightened so an approver can no
-- longer read super-admin-authored slur excerpts through the older customer-
-- safety panel (the side channel that otherwise defeated this table's
-- super-admin-only gate).
--
-- Additive and idempotent. No data is modified.
-- ============================================================


-- ────────────────────────────────────────────────────────────
-- LAYER 1 — RLS: which rows, and who (browser / authenticated JWT)
-- ────────────────────────────────────────────────────────────

ALTER TABLE admin_conduct_flags ENABLE ROW LEVEL SECURITY;

-- Every super admin reads every flag. Conduct records are shared governance
-- material, not private to whoever happened to open the panel.
DROP POLICY IF EXISTS admin_conduct_flags_super_admin_read ON admin_conduct_flags;
CREATE POLICY admin_conduct_flags_super_admin_read ON admin_conduct_flags
  FOR SELECT TO authenticated
  USING (is_super_admin(auth.uid()));

-- A super admin may file a flag, but only attributed to THEMSELVES, so one
-- super admin cannot fabricate an incident against a colleague. (The automatic
-- path — lib/moderation/admin-conduct.ts — inserts via service_role and is
-- unaffected; that always attributes the flag to the real author anyway.)
DROP POLICY IF EXISTS admin_conduct_flags_super_admin_insert ON admin_conduct_flags;
CREATE POLICY admin_conduct_flags_super_admin_insert ON admin_conduct_flags
  FOR INSERT TO authenticated
  WITH CHECK (is_super_admin(auth.uid()) AND flagged_admin_id = auth.uid());

-- A super admin may mark ANY flag reviewed. WHICH COLUMNS they may touch is
-- not expressible here — see Layer 2.
DROP POLICY IF EXISTS admin_conduct_flags_super_admin_review ON admin_conduct_flags;
CREATE POLICY admin_conduct_flags_super_admin_review ON admin_conduct_flags
  FOR UPDATE TO authenticated
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

-- NO DELETE POLICY IS CREATED, ANYWHERE, ON PURPOSE.
-- RLS is default-deny, so DELETE is denied for every non-BYPASSRLS role.


-- ────────────────────────────────────────────────────────────
-- LAYER 2 — column privileges: the real write-once enforcement.
-- This is the layer that binds service_role.
-- ────────────────────────────────────────────────────────────

-- Undo 006_fix_default_grants.sql's blanket grants on THIS table only.
REVOKE ALL                        ON admin_conduct_flags FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE   ON admin_conduct_flags FROM authenticated, service_role;

GRANT  SELECT, INSERT             ON admin_conduct_flags TO   authenticated, service_role;

-- The complete set of ever-writable columns, for every app-reachable role.
-- After this, `UPDATE ... SET original_text = ...` fails with
-- 42501 permission denied for column original_text — even as service_role.
GRANT  UPDATE (status, reviewed_at, reviewed_by)
                                  ON admin_conduct_flags TO   authenticated, service_role;


-- ────────────────────────────────────────────────────────────
-- LAYER 3 — triggers: backstop, and the one rule grants cannot express
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_conduct_flags_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- TRUNCATE skips row-level triggers entirely, hence its own statement-level
  -- trigger below. OLD/NEW are not available here.
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION 'admin_conduct_flags is append-only: TRUNCATE is not permitted'
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'admin_conduct_flags is append-only: DELETE is not permitted (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Write-once incident content.
  IF  NEW.id               IS DISTINCT FROM OLD.id
   OR NEW.flagged_admin_id IS DISTINCT FROM OLD.flagged_admin_id
   OR NEW.target_user_id   IS DISTINCT FROM OLD.target_user_id
   OR NEW.source           IS DISTINCT FROM OLD.source
   OR NEW.source_ref_id    IS DISTINCT FROM OLD.source_ref_id
   OR NEW.original_text    IS DISTINCT FROM OLD.original_text
   OR NEW.severity         IS DISTINCT FROM OLD.severity
   OR NEW.created_at       IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'admin_conduct_flags is append-only: incident content is write-once (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Review is a ONE-WAY LATCH. Once reviewed, the whole row freezes — the
  -- reviewer's identity and timestamp are part of the record.
  IF OLD.status = 'reviewed' THEN
    RAISE EXCEPTION 'admin_conduct_flags: flag % is already reviewed and is frozen', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF NEW.status <> 'reviewed' THEN
    RAISE EXCEPTION 'admin_conduct_flags: status may only move open -> reviewed (id=%)', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS admin_conduct_flags_no_delete ON admin_conduct_flags;
CREATE TRIGGER admin_conduct_flags_no_delete
  BEFORE DELETE ON admin_conduct_flags
  FOR EACH ROW EXECUTE FUNCTION public.admin_conduct_flags_append_only();

DROP TRIGGER IF EXISTS admin_conduct_flags_write_once ON admin_conduct_flags;
CREATE TRIGGER admin_conduct_flags_write_once
  BEFORE UPDATE ON admin_conduct_flags
  FOR EACH ROW EXECUTE FUNCTION public.admin_conduct_flags_append_only();

DROP TRIGGER IF EXISTS admin_conduct_flags_no_truncate ON admin_conduct_flags;
CREATE TRIGGER admin_conduct_flags_no_truncate
  BEFORE TRUNCATE ON admin_conduct_flags
  FOR EACH STATEMENT EXECUTE FUNCTION public.admin_conduct_flags_append_only();

COMMENT ON TABLE admin_conduct_flags IS
  'Append-only staff conduct incidents. Enforced by column-level GRANTs + triggers, '
  'not only RLS (service_role has BYPASSRLS). Only status/reviewed_at/reviewed_by are '
  'writable, once, open->reviewed. See migration 20260812000000 for the break-glass procedure.';


-- ────────────────────────────────────────────────────────────
-- Close the approver side channel on moderation_flags
-- ────────────────────────────────────────────────────────────
--
-- 036_moderation_flags.sql gates reads on is_admin() = super_admin OR approver.
-- Because an admin slur writes BOTH tables, an approver could read the raw
-- excerpt (and its author, via moderation_flags.user_id) through the older
-- customer-safety panel — defeating admin_conduct_flags' super-admin-only gate.
-- Verified live before this migration: approver got 403 on /api/admin/conduct-flags
-- but 200 on /api/admin/moderation/flags, including the uncensored text.
--
-- Fixed in RLS rather than in getModerationFlags(), so it holds for any future
-- reader of this table. moderation_flags.user_id is nullable and
-- is_super_admin(NULL) is false, so guest-authored flags stay visible to
-- approvers — only super-admin-authored rows become super-admin-only.
-- No application code changes: /api/admin/moderation/flags already reads
-- through the cookie-aware client, so the list filters itself.

DROP POLICY IF EXISTS moderation_flags_admin_read ON moderation_flags;
CREATE POLICY moderation_flags_admin_read ON moderation_flags
  FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR (is_admin(auth.uid()) AND NOT is_super_admin(user_id))
  );
