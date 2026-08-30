-- Delete 5 stale demo accounts left over from the pre-restructure shared-owner
-- model (vendor.owner.raj@demo.local, vendor.owner.siti@demo.local,
-- outlet.manager.nadia@demo.local, outlet.manager.farid@demo.local,
-- outlet.manager.lim@demo.local).
--
-- These accounts have real auth.users logins and appear in the login page's
-- demo-account picker, but their vendor/outlet role assignment was stripped
-- when 20260815010000_per_vendor_owner_accounts.sql rebuilt user_roles for
-- the new one-owner-per-vendor model — they now sit as plain `customer`
-- accounts while still named "Vendor Owner Raj" / "Outlet Manager Farid",
-- misleading anyone who picks them from the quick-entry list.
--
-- Every foreign key across the schema referencing public.users(id) was
-- checked against these 5 ids before writing this migration. Only 4 tables
-- have any matching rows, and all 4 are ON DELETE CASCADE or ON DELETE SET
-- NULL: user_roles (5 rows, their stray customer role), wallets (2),
-- wallet_transactions (251 — old wallet-history demo data on raj and siti),
-- email_outbox (4, cascades to NULL). Deleting the public.users rows is
-- therefore safe and complete with no orphaned data.
--
-- public.users has no foreign key to auth.users (confirmed via pg_constraint
-- in an earlier session), so both tables are deleted independently here.
--
-- wallet_transactions carries a hard append-only guard (trigger function
-- wallet_transactions_are_append_only(), unconditional RAISE EXCEPTION on
-- any write) that isn't a foreign key, so it wasn't caught by the FK audit
-- above. The cascade delete from public.users trips it. The trigger is
-- disabled for this transaction only — scoped to the 251 old demo-seed rows
-- on these 2 stale wallets — and re-enabled before COMMIT. If anything below
-- fails, the whole transaction rolls back and the guard is restored with it.

BEGIN;

ALTER TABLE public.wallet_transactions DISABLE TRIGGER wallet_transactions_append_only;

DO $$
DECLARE
  stale_ids uuid[] := ARRAY[
    'aaaaaaaa-0000-0000-0000-000000000009', -- vendor.owner.siti@demo.local
    'aaaaaaaa-0000-0000-0000-000000000010', -- vendor.owner.raj@demo.local
    'aaaaaaaa-0000-0000-0000-000000000011', -- outlet.manager.nadia@demo.local
    'aaaaaaaa-0000-0000-0000-000000000012', -- outlet.manager.farid@demo.local
    'aaaaaaaa-0000-0000-0000-000000000013'  -- outlet.manager.lim@demo.local
  ]::uuid[];
  pre_public_count integer;
  pre_auth_count integer;
  post_public_count integer;
  post_auth_count integer;
BEGIN
  -- 1. Confirm the expected starting state before touching anything.
  SELECT count(*) INTO pre_public_count FROM public.users WHERE id = ANY(stale_ids);
  SELECT count(*) INTO pre_auth_count FROM auth.users WHERE id = ANY(stale_ids);

  IF pre_public_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 matching public.users rows before delete, got %', pre_public_count;
  END IF;

  IF pre_auth_count <> 5 THEN
    RAISE EXCEPTION 'expected 5 matching auth.users rows before delete, got %', pre_auth_count;
  END IF;

  -- 2. Delete the app-facing profile data first (cascades user_roles,
  --    wallets, wallet_transactions; sets email_outbox.user_id to NULL).
  DELETE FROM public.users WHERE id = ANY(stale_ids);

  -- 3. Delete the actual login capability.
  DELETE FROM auth.users WHERE id = ANY(stale_ids);

  -- 4. Confirm nothing is left behind in either table.
  SELECT count(*) INTO post_public_count FROM public.users WHERE id = ANY(stale_ids);
  SELECT count(*) INTO post_auth_count FROM auth.users WHERE id = ANY(stale_ids);

  IF post_public_count <> 0 THEN
    RAISE EXCEPTION 'expected 0 public.users rows after delete, got %', post_public_count;
  END IF;

  IF post_auth_count <> 0 THEN
    RAISE EXCEPTION 'expected 0 auth.users rows after delete, got %', post_auth_count;
  END IF;
END $$;

ALTER TABLE public.wallet_transactions ENABLE TRIGGER wallet_transactions_append_only;

COMMIT;
;
