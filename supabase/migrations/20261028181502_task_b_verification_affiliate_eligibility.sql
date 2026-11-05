-- Task B: apply the cumulative verification tiers without changing user,
-- wallet, or affiliate-attribution records. Survey answers only drive
-- personalization; profile completion is exactly the five core fields.

ALTER TABLE public.preference_survey_responses
  ADD COLUMN IF NOT EXISTS travel_style text;

ALTER TABLE public.preference_survey_responses
  DROP CONSTRAINT IF EXISTS preference_survey_responses_travel_style_check;
ALTER TABLE public.preference_survey_responses
  ADD CONSTRAINT preference_survey_responses_travel_style_check
  CHECK (travel_style IS NULL OR travel_style IN ('solo', 'couple', 'family', 'group'));

CREATE OR REPLACE FUNCTION public.profile_completion_eligible(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users u
    WHERE u.id = p_user_id
      AND char_length(btrim(coalesce(u.full_name, ''))) >= 2
      AND btrim(coalesce(u.city, '')) <> ''
      AND btrim(coalesce(u.country, '')) <> ''
      AND btrim(coalesce(u.avatar_url, '')) <> ''
      AND lower(regexp_replace(split_part(btrim(coalesce(u.avatar_url, '')), '?', 1), '^.*/', '')) NOT IN
        ('default-avatar.png', 'default-avatar.jpg', 'default-avatar.jpeg', 'default-avatar.webp', 'default-avatar.svg')
      AND (
        char_length(btrim(coalesce(u.bio, ''))) BETWEEN 3 AND 30
        OR (u.profile_completed_at IS NOT NULL AND char_length(btrim(coalesce(u.bio, ''))) BETWEEN 31 AND 200)
      )
  );
$$;

CREATE OR REPLACE FUNCTION app_private.promote_to_profile_complete(p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_user public.users%ROWTYPE;
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;
  SELECT * INTO v_user FROM public.users WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'user_not_found: %', p_user_id; END IF;
  IF NOT public.profile_completion_eligible(p_user_id) THEN
    RAISE EXCEPTION 'profile_incomplete: core_fields_required';
  END IF;
  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users SET profile_completed_at = coalesce(profile_completed_at, now()), updated_at = now()
   WHERE id = p_user_id;
  PERFORM public.recompute_compatibility_tier(p_user_id);
END;
$$;

-- Keep the public RPC contract for older clients; the new overload adds the
-- optional preference value and neither signature promotes profile status.
CREATE OR REPLACE FUNCTION app_private.complete_preference_survey(
  p_user_id uuid, p_interests text[], p_budget_range text, p_mobility_needs text DEFAULT 'none',
  p_pet_friendly boolean DEFAULT false, p_preferred_radius_km integer DEFAULT 20, p_notes text DEFAULT NULL
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  INSERT INTO public.preference_survey_responses
    (user_id, interests, budget_range, mobility_needs, pet_friendly, preferred_radius_km, notes)
  VALUES (p_user_id, p_interests, p_budget_range, p_mobility_needs, p_pet_friendly, p_preferred_radius_km, p_notes)
  ON CONFLICT (user_id) DO UPDATE SET interests=EXCLUDED.interests, budget_range=EXCLUDED.budget_range,
    mobility_needs=EXCLUDED.mobility_needs, pet_friendly=EXCLUDED.pet_friendly,
    preferred_radius_km=EXCLUDED.preferred_radius_km, notes=EXCLUDED.notes, updated_at=now();
END;
$$;

CREATE OR REPLACE FUNCTION app_private.complete_preference_survey(
  p_user_id uuid, p_interests text[], p_budget_range text, p_mobility_needs text,
  p_pet_friendly boolean, p_preferred_radius_km integer, p_notes text, p_travel_style text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'unauthorized'; END IF;
  IF p_travel_style NOT IN ('solo', 'couple', 'family', 'group') THEN RAISE EXCEPTION 'travel_style_invalid'; END IF;
  INSERT INTO public.preference_survey_responses
    (user_id, interests, travel_style, budget_range, mobility_needs, pet_friendly, preferred_radius_km, notes)
  VALUES (p_user_id, p_interests, p_travel_style, p_budget_range, p_mobility_needs, p_pet_friendly, p_preferred_radius_km, p_notes)
  ON CONFLICT (user_id) DO UPDATE SET interests=EXCLUDED.interests, travel_style=EXCLUDED.travel_style,
    budget_range=EXCLUDED.budget_range, mobility_needs=EXCLUDED.mobility_needs,
    pet_friendly=EXCLUDED.pet_friendly, preferred_radius_km=EXCLUDED.preferred_radius_km,
    notes=EXCLUDED.notes, updated_at=now();
END;
$$;

REVOKE ALL ON FUNCTION app_private.complete_preference_survey(uuid,text[],text,text,boolean,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.complete_preference_survey(uuid,text[],text,text,boolean,integer,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.complete_preference_survey(uuid,text[],text,text,boolean,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.complete_preference_survey(uuid,text[],text,text,boolean,integer,text,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.complete_preference_survey(
  p_user_id uuid, p_interests text[], p_budget_range text,
  p_mobility_needs text DEFAULT 'none', p_pet_friendly boolean DEFAULT false,
  p_preferred_radius_km integer DEFAULT 20, p_notes text DEFAULT NULL
) RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT app_private.complete_preference_survey(p_user_id,p_interests,p_budget_range,p_mobility_needs,p_pet_friendly,p_preferred_radius_km,p_notes);
$$;

CREATE OR REPLACE FUNCTION public.complete_preference_survey(
  p_user_id uuid, p_interests text[], p_travel_style text, p_budget_range text,
  p_mobility_needs text, p_pet_friendly boolean, p_preferred_radius_km integer, p_notes text
) RETURNS void LANGUAGE sql VOLATILE SECURITY INVOKER SET search_path = public, pg_temp AS $$
  SELECT app_private.complete_preference_survey(p_user_id,p_interests,p_budget_range,p_mobility_needs,p_pet_friendly,p_preferred_radius_km,p_notes,p_travel_style);
$$;
REVOKE ALL ON FUNCTION public.complete_preference_survey(uuid,text[],text,text,boolean,integer,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.complete_preference_survey(uuid,text[],text,text,text,boolean,integer,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.complete_preference_survey(uuid,text[],text,text,boolean,integer,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_preference_survey(uuid,text[],text,text,text,boolean,integer,text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.customer_can_submit_recommendation(p_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT EXISTS (SELECT 1 FROM public.users u WHERE u.id=p_user_id AND u.status='active'
    AND u.email_verified_at IS NOT NULL AND u.phone_verified_at IS NOT NULL
    AND u.profile_completed_at IS NOT NULL AND public.profile_completion_eligible(u.id));
$$;

CREATE OR REPLACE FUNCTION public.enforce_recommendation_profile_or_kyc()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF coalesce(auth.role(),'') <> 'service_role'
     AND (auth.uid() IS NULL OR NEW.recommender_id IS DISTINCT FROM auth.uid()) THEN
    RAISE EXCEPTION 'recommendation_not_owned';
  END IF;
  IF NOT public.customer_can_submit_recommendation(NEW.recommender_id) THEN
    RAISE EXCEPTION 'verification_requirements_required';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION app_private.customer_affiliate_mode(p_user_id uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
      WHERE ur.user_id=p_user_id AND r.name IN ('vendor_owner','outlet_manager')) THEN 'none'
    WHEN NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
      WHERE ur.user_id=p_user_id AND r.name='customer') THEN 'none'
    ELSE coalesce((SELECT CASE WHEN u.email_verified_at IS NULL OR u.phone_verified_at IS NULL
        OR u.profile_completed_at IS NULL OR NOT public.profile_completion_eligible(u.id) THEN 'none'
      WHEN u.kyc_status='approved' THEN 'full' ELSE 'limited' END
      FROM public.users u WHERE u.id=p_user_id AND u.status='active'),'none')
  END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_phone_verified_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.guest_subject_id IS NOT NULL THEN
    IF coalesce(auth.role(),'') <> 'service_role' OR NEW.user_id IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.guest_checkout_subjects WHERE id=NEW.guest_subject_id AND revoked_at IS NULL AND expires_at>now())
      OR NEW.contact_email IS NULL OR NEW.contact_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
  ELSE
    IF coalesce(auth.role(),'') <> 'service_role' AND (auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'checkout_not_owned'; END IF;
    IF NOT public.customer_is_active_email_verified(NEW.user_id) THEN RAISE EXCEPTION 'email_verification_required'; END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_phone_verified_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.guest_subject_id IS NOT NULL THEN
    IF coalesce(auth.role(),'') <> 'service_role' OR NEW.customer_id IS NOT NULL
      OR NOT EXISTS (SELECT 1 FROM public.guest_checkout_subjects WHERE id=NEW.guest_subject_id AND revoked_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'booking_not_owned'; END IF;
  ELSE
    IF coalesce(auth.role(),'') <> 'service_role' AND (auth.uid() IS NULL OR NEW.customer_id IS DISTINCT FROM auth.uid()) THEN RAISE EXCEPTION 'booking_not_owned'; END IF;
    IF NOT public.customer_is_active_email_verified(NEW.customer_id) THEN RAISE EXCEPTION 'email_verification_required'; END IF;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.order_items oi JOIN public.orders o ON o.id=oi.order_id
    WHERE oi.id=NEW.order_item_id AND o.user_id IS NOT DISTINCT FROM NEW.customer_id AND o.guest_subject_id IS NOT DISTINCT FROM NEW.guest_subject_id)
  THEN RAISE EXCEPTION 'booking_not_owned'; END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.capability_hard_guard(p_user_id uuid, p_capability_key text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public, pg_temp AS $$
DECLARE v_email boolean; v_phone boolean; v_profile boolean; v_kyc text; v_status text; v_roles jsonb; v_customer boolean;
BEGIN
  SELECT u.email_verified_at IS NOT NULL, u.phone_verified_at IS NOT NULL,
    u.profile_completed_at IS NOT NULL AND public.profile_completion_eligible(u.id), u.kyc_status, u.status
    INTO v_email,v_phone,v_profile,v_kyc,v_status FROM public.users u WHERE u.id=p_user_id;
  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN RETURN jsonb_build_object('allowed',false,'blockerCode','ACCOUNT_RESTRICTED','qualificationPaths','[]'::jsonb); END IF;
  v_roles := public.entitlement_fact_value(p_user_id,'role');
  v_customer := v_roles ? 'customer' AND NOT (v_roles ? 'vendor_owner') AND NOT (v_roles ? 'outlet_manager');
  IF p_capability_key='wallet.approve_withdrawal' THEN
    RETURN jsonb_build_object('allowed',v_roles ? 'super_admin' OR v_roles ? 'approver',
      'blockerCode',CASE WHEN v_roles ? 'super_admin' OR v_roles ? 'approver' THEN NULL ELSE 'ENTITLEMENT_DENIED' END,'qualificationPaths','[]'::jsonb);
  END IF;
  IF p_capability_key IN ('platform.browse','commerce.booking','commerce.purchase','commerce.checkout','ai.basic_recommendation',
    'recommendation.submit','affiliate.limited','affiliate.full','affiliate.earn_commission','wallet.request_withdrawal') AND NOT v_email
  THEN RETURN jsonb_build_object('allowed',false,'blockerCode','EMAIL_VERIFICATION_REQUIRED','qualificationPaths',jsonb_build_array(jsonb_build_object('type','email','href','/customer/profile'))); END IF;
  IF p_capability_key IN ('wallet.top_up','ai.basic_recommendation','recommendation.submit','affiliate.limited','affiliate.full','affiliate.earn_commission','wallet.request_withdrawal') AND NOT v_phone
  THEN RETURN jsonb_build_object('allowed',false,'blockerCode','PHONE_VERIFICATION_REQUIRED','qualificationPaths',jsonb_build_array(jsonb_build_object('type','phone','href','/customer/phone'))); END IF;
  IF p_capability_key IN ('recommendation.submit','affiliate.limited','affiliate.full','affiliate.earn_commission','wallet.request_withdrawal') AND NOT v_profile
  THEN RETURN jsonb_build_object('allowed',false,'blockerCode','PROFILE_REQUIRED','qualificationPaths',jsonb_build_array(jsonb_build_object('type','profile','href','/customer/profile'))); END IF;
  IF p_capability_key='recommendation.submit' AND NOT v_customer THEN RETURN jsonb_build_object('allowed',false,'blockerCode','ENTITLEMENT_DENIED','qualificationPaths','[]'::jsonb); END IF;
  IF p_capability_key='affiliate.limited' AND (NOT v_customer OR v_kyc='approved') THEN RETURN jsonb_build_object('allowed',false,'blockerCode','ENTITLEMENT_DENIED','qualificationPaths','[]'::jsonb); END IF;
  IF p_capability_key IN ('affiliate.full','affiliate.earn_commission','wallet.request_withdrawal') THEN
    IF NOT v_customer THEN RETURN jsonb_build_object('allowed',false,'blockerCode','ENTITLEMENT_DENIED','qualificationPaths','[]'::jsonb); END IF;
    IF v_kyc IS DISTINCT FROM 'approved' THEN RETURN jsonb_build_object('allowed',false,
      'blockerCode',CASE v_kyc WHEN 'pending' THEN 'KYC_PENDING' WHEN 'rejected' THEN 'KYC_RESUBMISSION_REQUIRED' ELSE 'KYC_REQUIRED' END,
      'qualificationPaths',jsonb_build_array(jsonb_build_object('type','kyc','href','/customer/kyc'))); END IF;
  END IF;
  RETURN jsonb_build_object('allowed',true,'blockerCode',NULL,'qualificationPaths','[]'::jsonb);
END;
$$;

-- Public contributor surface gets one derived boolean, never contact data or
-- KYC artifacts. Appending preserves the existing public_users column order.
ALTER TABLE app_private.public_user_profiles ADD COLUMN IF NOT EXISTS is_verified_contributor boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION app_private.sync_public_user_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_verified boolean;
BEGIN
  IF TG_OP='DELETE' THEN DELETE FROM app_private.public_user_profiles WHERE id=OLD.id; RETURN OLD; END IF;
  IF NEW.status='active' THEN
    v_verified := NEW.email_verified_at IS NOT NULL AND NEW.phone_verified_at IS NOT NULL
      AND NEW.kyc_status='approved' AND NEW.profile_completed_at IS NOT NULL
      AND public.profile_completion_eligible(NEW.id);
    INSERT INTO app_private.public_user_profiles(id,full_name,display_name,avatar_url,city,country,is_kyc_verified,
      has_completed_profile,created_at,bio,is_verified_contributor)
    VALUES(NEW.id,NEW.full_name,NEW.display_name,NEW.avatar_url,NEW.city,NEW.country,NEW.kyc_status='approved',
      NEW.profile_completed_at IS NOT NULL,NEW.created_at,NEW.bio,v_verified)
    ON CONFLICT(id) DO UPDATE SET full_name=EXCLUDED.full_name,display_name=EXCLUDED.display_name,
      avatar_url=EXCLUDED.avatar_url,city=EXCLUDED.city,country=EXCLUDED.country,is_kyc_verified=EXCLUDED.is_kyc_verified,
      has_completed_profile=EXCLUDED.has_completed_profile,created_at=EXCLUDED.created_at,bio=EXCLUDED.bio,
      is_verified_contributor=EXCLUDED.is_verified_contributor;
  ELSE DELETE FROM app_private.public_user_profiles WHERE id=NEW.id;
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS sync_public_user_profile_update ON public.users;
CREATE TRIGGER sync_public_user_profile_update AFTER UPDATE OF full_name,display_name,avatar_url,city,country,
  kyc_status,profile_completed_at,created_at,bio,status,email_verified_at,phone_verified_at ON public.users
  FOR EACH ROW EXECUTE FUNCTION app_private.sync_public_user_profile();
UPDATE app_private.public_user_profiles p SET is_verified_contributor =
  u.email_verified_at IS NOT NULL AND u.phone_verified_at IS NOT NULL AND u.kyc_status='approved'
  AND u.profile_completed_at IS NOT NULL AND public.profile_completion_eligible(u.id)
  FROM public.users u WHERE u.id=p.id;
CREATE OR REPLACE VIEW public.public_users WITH (security_invoker = true) AS
SELECT id,full_name,display_name,avatar_url,city,country,is_kyc_verified,has_completed_profile,created_at,bio,is_verified_contributor
FROM app_private.public_user_profiles;
GRANT SELECT ON public.public_users TO anon,authenticated,service_role;

-- Replace active built-in requirements atomically with a new policy version;
-- custom policies remain untouched and are still evaluated as additional rules.
DO $policy_versions$
DECLARE p record; old_id uuid; new_id uuid; next_version integer; v_requirements jsonb;
BEGIN
  FOR p IN SELECT id,key FROM public.entitlement_policies WHERE key IN (
    'builtin.commerce.booking','builtin.commerce.purchase','builtin.commerce.checkout','builtin.ai.basic_recommendation',
    'builtin.recommendation.submit','builtin.affiliate.limited','builtin.affiliate.full',
    'builtin.affiliate.earn_commission','builtin.wallet.request_withdrawal'
  ) LOOP
    SELECT id INTO old_id FROM public.entitlement_policy_versions WHERE policy_id=p.id AND status='active' FOR UPDATE;
    SELECT coalesce(max(version),0)+1 INTO next_version FROM public.entitlement_policy_versions WHERE policy_id=p.id;
    INSERT INTO public.entitlement_policy_versions(policy_id,version,status,effect,effective_from)
      VALUES(p.id,next_version,'draft','allow',now()) RETURNING id INTO new_id;
    v_requirements := CASE p.key
      WHEN 'builtin.ai.basic_recommendation' THEN '[{"fact_key":"email_verified","operator":"eq","expected_value":true},{"fact_key":"phone_verified","operator":"eq","expected_value":true}]'::jsonb
      WHEN 'builtin.recommendation.submit' THEN '[{"fact_key":"email_verified","operator":"eq","expected_value":true},{"fact_key":"phone_verified","operator":"eq","expected_value":true},{"fact_key":"profile_complete","operator":"eq","expected_value":true}]'::jsonb
      WHEN 'builtin.affiliate.limited' THEN '[{"fact_key":"email_verified","operator":"eq","expected_value":true},{"fact_key":"phone_verified","operator":"eq","expected_value":true},{"fact_key":"profile_complete","operator":"eq","expected_value":true},{"fact_key":"kyc_status","operator":"not_eq","expected_value":"approved"}]'::jsonb
      WHEN 'builtin.affiliate.full' THEN '[{"fact_key":"email_verified","operator":"eq","expected_value":true},{"fact_key":"phone_verified","operator":"eq","expected_value":true},{"fact_key":"profile_complete","operator":"eq","expected_value":true},{"fact_key":"kyc_status","operator":"eq","expected_value":"approved"}]'::jsonb
      WHEN 'builtin.affiliate.earn_commission' THEN '[{"fact_key":"email_verified","operator":"eq","expected_value":true},{"fact_key":"phone_verified","operator":"eq","expected_value":true},{"fact_key":"profile_complete","operator":"eq","expected_value":true},{"fact_key":"kyc_status","operator":"eq","expected_value":"approved"}]'::jsonb
      WHEN 'builtin.wallet.request_withdrawal' THEN '[{"fact_key":"email_verified","operator":"eq","expected_value":true},{"fact_key":"phone_verified","operator":"eq","expected_value":true},{"fact_key":"profile_complete","operator":"eq","expected_value":true},{"fact_key":"kyc_status","operator":"eq","expected_value":"approved"}]'::jsonb
      ELSE '[{"fact_key":"email_verified","operator":"eq","expected_value":true}]'::jsonb
    END;
    INSERT INTO public.entitlement_policy_requirements(policy_version_id,alternative_group,fact_key,operator,expected_value)
      SELECT new_id,1,item->>'fact_key',item->>'operator',item->'expected_value' FROM jsonb_array_elements(v_requirements) item;
    UPDATE public.entitlement_policy_versions SET status='retired' WHERE id=old_id;
    UPDATE public.entitlement_policy_versions SET status='active',activated_at=now() WHERE id=new_id;
    PERFORM public.increment_entitlement_generation();
  END LOOP;
END;
$policy_versions$;

-- Rewrite the commission checks without changing any attribution or wallet row.
DO $affiliate_checks$
DECLARE definition text; changed text;
BEGIN
  definition := pg_get_functiondef('app_private.create_affiliate_attribution(uuid,uuid,numeric)'::regprocedure);
  changed := replace(definition,
    'IF NOT FOUND OR v_owner.kyc_status = ''rejected'' THEN',
    'IF NOT FOUND OR v_owner.kyc_status = ''rejected'' OR v_owner.email_verified_at IS NULL OR v_owner.phone_verified_at IS NULL OR v_owner.profile_completed_at IS NULL OR NOT public.profile_completion_eligible(v_owner.id) THEN');
  IF changed=definition THEN RAISE EXCEPTION 'affiliate_attribution_gate_shape_changed'; END IF;
  EXECUTE changed;

  definition := pg_get_functiondef('public.clear_affiliate_commission(uuid,timestamptz)'::regprocedure);
  changed := replace(definition,
    'OR v_owner.email_verified_at IS NULL OR v_owner.kyc_status IS DISTINCT FROM ''approved''\n    OR v_owner.tier IS DISTINCT FROM ''kyc_verified'' THEN',
    'OR v_owner.email_verified_at IS NULL OR v_owner.phone_verified_at IS NULL OR v_owner.profile_completed_at IS NULL\n    OR NOT public.profile_completion_eligible(v_owner.id) OR v_owner.kyc_status IS DISTINCT FROM ''approved'' THEN');
  IF changed=definition THEN
    changed := replace(definition,
      E'OR v_owner.email_verified_at IS NULL OR v_owner.kyc_status IS DISTINCT FROM ''approved''\n    OR v_owner.tier IS DISTINCT FROM ''kyc_verified'' THEN',
      E'OR v_owner.email_verified_at IS NULL OR v_owner.phone_verified_at IS NULL OR v_owner.profile_completed_at IS NULL\n    OR NOT public.profile_completion_eligible(v_owner.id) OR v_owner.kyc_status IS DISTINCT FROM ''approved'' THEN');
  END IF;
  IF changed=definition THEN RAISE EXCEPTION 'affiliate_clear_gate_shape_changed'; END IF;
  EXECUTE changed;

  definition := pg_get_functiondef('app_private.confirm_pending_earnings()'::regprocedure);
  changed := replace(definition, 'AND u.kyc_status = ''approved''',
    'AND u.kyc_status = ''approved'' AND u.phone_verified_at IS NOT NULL AND u.profile_completed_at IS NOT NULL AND public.profile_completion_eligible(u.id)');
  IF changed=definition THEN RAISE EXCEPTION 'legacy_affiliate_clear_gate_shape_changed'; END IF;
  EXECUTE changed;
END;
$affiliate_checks$;

-- Keep both withdrawal entry points aligned: the UI-facing readiness and the
-- direct RPC/trigger boundary must enforce the same cumulative tier.
DO $withdrawal_checks$
DECLARE definition text; changed text;
BEGIN
  definition := pg_get_functiondef('public.enforce_withdrawal_eligibility()'::regprocedure);
  changed := regexp_replace(definition,
    'IF v_user\.email_verified_at IS NULL OR COALESCE\(v_user\.status, ''suspended''\) <> ''active''\s+OR v_user\.kyc_status <> ''approved'' THEN',
    'IF v_user.email_verified_at IS NULL OR v_user.phone_verified_at IS NULL OR v_user.profile_completed_at IS NULL OR NOT public.profile_completion_eligible(v_user.id) OR COALESCE(v_user.status, ''suspended'') <> ''active'' OR v_user.kyc_status <> ''approved'' THEN');
  IF changed=definition THEN RAISE EXCEPTION 'withdrawal_trigger_gate_shape_changed'; END IF;
  EXECUTE changed;

  definition := pg_get_functiondef('public.submit_wallet_withdrawal(bigint,uuid)'::regprocedure);
  changed := replace(definition,
    'SELECT email_verified_at, status, kyc_status, stripe_connect_account_id, stripe_payouts_enabled',
    'SELECT email_verified_at, phone_verified_at, profile_completed_at, status, kyc_status, stripe_connect_account_id, stripe_payouts_enabled');
  changed := regexp_replace(changed,
    'IF v_user\.email_verified_at IS NULL OR COALESCE\(v_user\.status, ''suspended''\) <> ''active''\s+OR v_user\.kyc_status <> ''approved'' THEN',
    'IF v_user.email_verified_at IS NULL OR v_user.phone_verified_at IS NULL OR v_user.profile_completed_at IS NULL OR NOT public.profile_completion_eligible(v_user_id) OR COALESCE(v_user.status, ''suspended'') <> ''active'' OR v_user.kyc_status <> ''approved'' THEN');
  IF changed=definition THEN RAISE EXCEPTION 'withdrawal_rpc_gate_shape_changed'; END IF;
  EXECUTE changed;

  definition := pg_get_functiondef('public.submit_wallet_withdrawal_server(uuid,uuid,bigint,uuid,text,text)'::regprocedure);
  changed := replace(definition,
    'SELECT email_verified_at, status, kyc_status, stripe_connect_account_id,',
    'SELECT email_verified_at, phone_verified_at, profile_completed_at, status, kyc_status, stripe_connect_account_id,');
  changed := regexp_replace(changed,
    'IF v_user\.email_verified_at IS NULL OR COALESCE\(v_user\.status, ''suspended''\) <> ''active''\s+OR v_user\.kyc_status <> ''approved'' THEN',
    'IF v_user.email_verified_at IS NULL OR v_user.phone_verified_at IS NULL OR v_user.profile_completed_at IS NULL OR NOT public.profile_completion_eligible(p_user_id) OR COALESCE(v_user.status, ''suspended'') <> ''active'' OR v_user.kyc_status <> ''approved'' THEN');
  IF changed=definition THEN RAISE EXCEPTION 'withdrawal_server_rpc_gate_shape_changed'; END IF;
  EXECUTE changed;
END;
$withdrawal_checks$;

-- Legacy monthly cap and full Affiliate eligibility follow verified facts,
-- not a cached/compatibility tier value.
DO $affiliate_tiers$
DECLARE definition text; changed text;
BEGIN
  definition := pg_get_functiondef('app_private.create_affiliate_attribution(uuid,uuid,numeric)'::regprocedure);
  changed := replace(definition,
    'IF NOT (v_owner.tier = ''kyc_verified'' AND v_owner.kyc_status = ''approved'') THEN',
    'IF v_owner.kyc_status IS DISTINCT FROM ''approved'' THEN');
  IF changed=definition THEN RAISE EXCEPTION 'affiliate_monthly_cap_tier_shape_changed'; END IF;
  EXECUTE changed;
END;
$affiliate_tiers$;

NOTIFY pgrst, 'reload schema';
