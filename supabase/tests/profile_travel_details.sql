-- Synthetic fixtures and writes are transaction-local; do not remove ROLLBACK.
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';
SELECT set_config('travel_test.owner_a', gen_random_uuid()::text, true);
SELECT set_config('travel_test.owner_b', gen_random_uuid()::text, true);
INSERT INTO public.users(id,email,full_name) VALUES
  (current_setting('travel_test.owner_a')::uuid, 'travel-fixture-a-'||current_setting('travel_test.owner_a')||'@example.invalid', 'Travel Fixture A'),
  (current_setting('travel_test.owner_b')::uuid, 'travel-fixture-b-'||current_setting('travel_test.owner_b')||'@example.invalid', 'Travel Fixture B');
SELECT set_config('request.jwt.claim.sub',current_setting('travel_test.owner_a'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('travel_test.owner_a'),'role','authenticated','is_anonymous',false)::text,true);
SET LOCAL ROLE authenticated;
INSERT INTO public.profile_personal_details(user_id,date_of_birth,nationality_code)
VALUES (auth.uid(),'2000-01-01','CN');
-- The same upsert shape used by PostgREST must be permitted.
INSERT INTO public.profile_personal_details(user_id,legal_name,date_of_birth,nationality_code)
VALUES (auth.uid(),'Fixture Owner','2000-01-01','MY')
ON CONFLICT(user_id) DO UPDATE SET user_id=excluded.user_id,legal_name=excluded.legal_name,date_of_birth=excluded.date_of_birth,nationality_code=excluded.nationality_code;
INSERT INTO public.saved_travellers(user_id,legal_name,date_of_birth,nationality_code)
VALUES (auth.uid(),'Fixture Child','2020-02-29','CN');
SELECT set_config('travel_test.traveller',(SELECT id::text FROM public.saved_travellers WHERE user_id=auth.uid() LIMIT 1),true);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.saved_travellers)<>1 THEN RAISE EXCEPTION 'owner read failed'; END IF;
  UPDATE public.saved_travellers SET gender='other' WHERE id=current_setting('travel_test.traveller')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'owner update failed'; END IF;
  BEGIN
    INSERT INTO public.saved_travellers(user_id,legal_name) VALUES(current_setting('travel_test.owner_b')::uuid,'Wrong Owner');
    RAISE EXCEPTION 'cross-owner insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.profile_personal_details SET user_id=current_setting('travel_test.owner_b')::uuid WHERE user_id=auth.uid();
    RAISE EXCEPTION 'owner reassignment allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    UPDATE public.saved_travellers SET user_id=current_setting('travel_test.owner_b')::uuid WHERE user_id=auth.uid();
    RAISE EXCEPTION 'traveller owner reassignment allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN
    INSERT INTO public.saved_travellers(user_id,legal_name,nationality_code) VALUES(auth.uid(),'Invalid Country','ZZ');
    RAISE EXCEPTION 'invalid nationality allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.saved_travellers(user_id,legal_name,date_of_birth) VALUES(auth.uid(),'Future DOB','2999-01-01');
    RAISE EXCEPTION 'future DOB allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
  BEGIN
    INSERT INTO public.saved_travellers(user_id,legal_name,emergency_contact_name) VALUES(auth.uid(),'Partial Contact','Contact Name');
    RAISE EXCEPTION 'partial emergency contact allowed';
  EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('travel_test.owner_b'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('travel_test.owner_b'),'role','authenticated','is_anonymous',false)::text,true);
DO $$
DECLARE affected integer;
BEGIN
  IF (SELECT count(*) FROM public.saved_travellers)<>0 OR (SELECT count(*) FROM public.profile_personal_details)<>0 THEN RAISE EXCEPTION 'cross-owner read allowed'; END IF;
  UPDATE public.saved_travellers SET legal_name='Foreign Edit' WHERE id=current_setting('travel_test.traveller')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-owner update allowed'; END IF;
  DELETE FROM public.saved_travellers WHERE id=current_setting('travel_test.traveller')::uuid;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 THEN RAISE EXCEPTION 'cross-owner delete allowed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub',current_setting('travel_test.owner_a'),true);
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('travel_test.owner_a'),'role','authenticated','is_anonymous',true)::text,true);
DO $$ BEGIN
  IF (SELECT count(*) FROM public.saved_travellers)<>0 OR (SELECT count(*) FROM public.profile_personal_details)<>0 THEN RAISE EXCEPTION 'anonymous-session read allowed'; END IF;
  BEGIN
    INSERT INTO public.saved_travellers(user_id,legal_name) VALUES(auth.uid(),'Anonymous Write');
    RAISE EXCEPTION 'anonymous-session insert allowed';
  EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN
  BEGIN PERFORM 1 FROM public.saved_travellers; RAISE EXCEPTION 'anon table read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM 1 FROM public.profile_personal_details; RAISE EXCEPTION 'anon personal read allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SELECT set_config('request.jwt.claims',jsonb_build_object('sub',current_setting('travel_test.owner_a'),'role','authenticated','is_anonymous',false)::text,true);
SELECT set_config('app.allow_account_status_write','on',true);
UPDATE public.users SET status='suspended' WHERE id=current_setting('travel_test.owner_a')::uuid;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.saved_travellers)<>0 OR (SELECT count(*) FROM public.profile_personal_details)<>0 THEN RAISE EXCEPTION 'suspended read allowed'; END IF;
END $$;
RESET ROLE;
UPDATE public.users SET status='deleted' WHERE id=current_setting('travel_test.owner_a')::uuid;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.saved_travellers)<>0 OR (SELECT count(*) FROM public.profile_personal_details)<>0 THEN RAISE EXCEPTION 'closed-account read allowed'; END IF;
END $$;
RESET ROLE;
UPDATE public.users SET status='active' WHERE id=current_setting('travel_test.owner_a')::uuid;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
  IF (SELECT count(*) FROM public.saved_travellers)<>1 THEN RAISE EXCEPTION 'restore did not restore access'; END IF;
  UPDATE public.profile_personal_details SET legal_name=NULL,date_of_birth=NULL,gender=NULL,nationality_code=NULL,emergency_contact_name=NULL,emergency_contact_relationship=NULL,emergency_contact_phone=NULL WHERE user_id=auth.uid();
  DELETE FROM public.saved_travellers WHERE user_id=auth.uid();
  DELETE FROM public.profile_personal_details WHERE user_id=auth.uid();
  IF EXISTS(SELECT 1 FROM public.saved_travellers) OR EXISTS(SELECT 1 FROM public.profile_personal_details) THEN RAISE EXCEPTION 'owner delete failed'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: owner CRUD, cross-owner isolation, anonymous/closed/suspended denial, constraints and clearing; all fixtures rolled back' AS result;
