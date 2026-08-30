-- Keep the effective Profile completion fact aligned with the four
-- customer-owned Profile sections. Preserve historical timestamps, but never
-- accept a timestamp as authorization proof when current evidence is missing.

CREATE OR REPLACE FUNCTION public.profile_completion_eligible(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS user_row
     WHERE user_row.id = p_user_id
       AND char_length(btrim(COALESCE(user_row.full_name, ''))) >= 2
       AND btrim(COALESCE(user_row.city, '')) <> ''
       AND btrim(COALESCE(user_row.country, '')) <> ''
       AND btrim(COALESCE(user_row.avatar_url, '')) <> ''
       AND lower(regexp_replace(
         split_part(btrim(COALESCE(user_row.avatar_url, '')), '?', 1),
         '^.*/',
         ''
       )) NOT IN (
         'default-avatar.png',
         'default-avatar.jpg',
         'default-avatar.jpeg',
         'default-avatar.webp',
         'default-avatar.svg'
       )
       AND char_length(btrim(COALESCE(user_row.bio, ''))) BETWEEN 30 AND 200
       AND EXISTS (
         SELECT 1
           FROM public.preference_survey_responses AS response
          WHERE response.user_id = p_user_id
            AND COALESCE(cardinality(response.interests), 0) > 0
       )
  );
$$;

REVOKE ALL ON FUNCTION public.profile_completion_eligible(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recompute_compatibility_tier(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tier TEXT;
BEGIN
  SELECT CASE
    WHEN user_row.email_verified_at IS NULL THEN 'email_unverified'
    WHEN user_row.phone_verified_at IS NOT NULL
     AND user_row.profile_completed_at IS NOT NULL
     AND public.profile_completion_eligible(p_user_id)
     AND user_row.kyc_status = 'approved' THEN 'kyc_verified'
    WHEN user_row.phone_verified_at IS NOT NULL
     AND user_row.profile_completed_at IS NOT NULL
     AND public.profile_completion_eligible(p_user_id) THEN 'profile_complete'
    WHEN user_row.phone_verified_at IS NOT NULL THEN 'phone_verified'
    ELSE 'email_verified'
  END
  INTO v_tier
  FROM public.users AS user_row
  WHERE user_row.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'user_not_found: %', p_user_id;
  END IF;

  PERFORM set_config('app.allow_verification_write', 'on', true);
  UPDATE public.users
     SET tier = v_tier,
         updated_at = now()
   WHERE id = p_user_id;
END;
$$;

REVOKE ALL ON FUNCTION public.recompute_compatibility_tier(UUID)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_can_submit_recommendation(p_user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.users AS user_row
     WHERE user_row.id = p_user_id
       AND user_row.email_verified_at IS NOT NULL
       AND COALESCE(user_row.status, 'suspended') = 'active'
       AND (
         (
           user_row.profile_completed_at IS NOT NULL
           AND public.profile_completion_eligible(p_user_id)
         )
         OR user_row.kyc_status = 'approved'
       )
  );
$$;

REVOKE ALL ON FUNCTION public.customer_can_submit_recommendation(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_can_submit_recommendation(UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.customer_affiliate_mode(p_user_id UUID)
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT CASE
    WHEN EXISTS (
      SELECT 1
        FROM public.user_roles AS user_role
        JOIN public.roles AS role_row ON role_row.id = user_role.role_id
       WHERE user_role.user_id = p_user_id
         AND role_row.name IN ('vendor_owner', 'outlet_manager')
    ) THEN 'none'
    WHEN NOT EXISTS (
      SELECT 1
        FROM public.user_roles AS user_role
        JOIN public.roles AS role_row ON role_row.id = user_role.role_id
       WHERE user_role.user_id = p_user_id
         AND role_row.name = 'customer'
    ) THEN 'none'
    ELSE COALESCE((
      SELECT CASE
        WHEN user_row.kyc_status = 'approved' THEN 'full'
        WHEN user_row.profile_completed_at IS NOT NULL
         AND public.profile_completion_eligible(p_user_id) THEN 'limited'
        ELSE 'none'
      END
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id
         AND user_row.email_verified_at IS NOT NULL
         AND COALESCE(user_row.status, 'suspended') = 'active'
    ), 'none')
  END;
$$;

REVOKE ALL ON FUNCTION public.customer_affiliate_mode(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.customer_affiliate_mode(UUID)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.entitlement_fact_value(
  p_user_id UUID,
  p_fact_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_value JSONB;
BEGIN
  CASE p_fact_key
    WHEN 'email_verified' THEN
      SELECT to_jsonb(user_row.email_verified_at IS NOT NULL)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'phone_verified' THEN
      SELECT to_jsonb(user_row.phone_verified_at IS NOT NULL)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'profile_complete' THEN
      SELECT to_jsonb(
        user_row.profile_completed_at IS NOT NULL
        AND public.profile_completion_eligible(p_user_id)
      )
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'kyc_status' THEN
      SELECT to_jsonb(user_row.kyc_status::TEXT)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'account_status' THEN
      SELECT to_jsonb(user_row.status::TEXT)
        INTO v_value
        FROM public.users AS user_row
       WHERE user_row.id = p_user_id;
    WHEN 'role' THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(role_row.name) ORDER BY role_row.name), '[]'::JSONB)
        INTO v_value
        FROM public.user_roles AS user_role
        JOIN public.roles AS role_row ON role_row.id = user_role.role_id
       WHERE user_role.user_id = p_user_id;
    WHEN 'plan' THEN
      RAISE EXCEPTION 'policy_unavailable';
    WHEN 'partner' THEN
      RAISE EXCEPTION 'policy_unavailable';
    ELSE
      RAISE EXCEPTION 'policy_invalid';
  END CASE;

  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.capability_hard_guard(
  p_user_id UUID,
  p_capability_key TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email BOOLEAN;
  v_phone BOOLEAN;
  v_profile BOOLEAN;
  v_kyc TEXT;
  v_status TEXT;
  v_roles JSONB;
  v_customer_eligible BOOLEAN;
BEGIN
  SELECT
    user_row.email_verified_at IS NOT NULL,
    user_row.phone_verified_at IS NOT NULL,
    user_row.profile_completed_at IS NOT NULL
      AND public.profile_completion_eligible(p_user_id),
    user_row.kyc_status,
    user_row.status
  INTO v_email, v_phone, v_profile, v_kyc, v_status
  FROM public.users AS user_row
  WHERE user_row.id = p_user_id;

  IF NOT FOUND OR v_status IS DISTINCT FROM 'active' THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'ACCOUNT_RESTRICTED',
      'qualificationPaths', '[]'::JSONB
    );
  END IF;

  v_roles := public.entitlement_fact_value(p_user_id, 'role');
  v_customer_eligible := v_roles ? 'customer'
    AND NOT (v_roles ? 'vendor_owner')
    AND NOT (v_roles ? 'outlet_manager');

  IF p_capability_key = 'wallet.approve_withdrawal' THEN
    IF NOT (v_roles ? 'super_admin' OR v_roles ? 'approver') THEN
      RETURN jsonb_build_object('allowed', FALSE, 'blockerCode', 'ENTITLEMENT_DENIED', 'qualificationPaths', '[]'::JSONB);
    END IF;
    RETURN jsonb_build_object('allowed', TRUE, 'blockerCode', NULL, 'qualificationPaths', '[]'::JSONB);
  END IF;

  IF p_capability_key IN (
    'platform.browse', 'commerce.booking', 'commerce.purchase',
    'commerce.checkout', 'ai.basic_recommendation', 'recommendation.submit',
    'affiliate.limited', 'affiliate.full', 'affiliate.earn_commission',
    'wallet.request_withdrawal'
  ) AND NOT v_email THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'EMAIL_VERIFICATION_REQUIRED',
      'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'email', 'href', '/customer/profile'))
    );
  END IF;

  IF p_capability_key IN (
    'commerce.booking', 'commerce.purchase', 'commerce.checkout', 'ai.basic_recommendation'
  ) AND NOT v_phone THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'PHONE_VERIFICATION_REQUIRED',
      'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'phone', 'href', '/customer/phone'))
    );
  END IF;

  IF p_capability_key = 'recommendation.submit'
     AND NOT v_profile
     AND v_kyc IS DISTINCT FROM 'approved' THEN
    RETURN jsonb_build_object(
      'allowed', FALSE,
      'blockerCode', 'PROFILE_OR_KYC_REQUIRED',
      'qualificationPaths', jsonb_build_array(
        jsonb_build_object('type', 'profile', 'href', '/customer/profile'),
        jsonb_build_object('type', 'kyc', 'href', '/customer/kyc')
      )
    );
  END IF;

  IF p_capability_key = 'affiliate.limited' THEN
    IF NOT v_customer_eligible OR v_kyc = 'approved' THEN
      RETURN jsonb_build_object('allowed', FALSE, 'blockerCode', 'ENTITLEMENT_DENIED', 'qualificationPaths', '[]'::JSONB);
    END IF;
    IF NOT v_profile THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'blockerCode', 'PROFILE_REQUIRED',
        'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'profile', 'href', '/customer/profile'))
      );
    END IF;
  END IF;

  IF p_capability_key IN ('affiliate.full', 'affiliate.earn_commission', 'wallet.request_withdrawal') THEN
    IF NOT v_customer_eligible THEN
      RETURN jsonb_build_object('allowed', FALSE, 'blockerCode', 'ENTITLEMENT_DENIED', 'qualificationPaths', '[]'::JSONB);
    END IF;
    IF v_kyc IS DISTINCT FROM 'approved' THEN
      RETURN jsonb_build_object(
        'allowed', FALSE,
        'blockerCode', CASE v_kyc
          WHEN 'pending' THEN 'KYC_PENDING'
          WHEN 'rejected' THEN 'KYC_RESUBMISSION_REQUIRED'
          ELSE 'KYC_REQUIRED'
        END,
        'qualificationPaths', jsonb_build_array(jsonb_build_object('type', 'kyc', 'href', '/customer/kyc'))
      );
    END IF;
  END IF;

  RETURN jsonb_build_object('allowed', TRUE, 'blockerCode', NULL, 'qualificationPaths', '[]'::JSONB);
END;
$$;
