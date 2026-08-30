-- Disposable-local-only pgTAP coverage for independent verification facts.
-- Run only after `supabase status` confirms a disposable localhost stack.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;

SELECT extensions.plan(11);

-- Reserved UUIDs and .invalid addresses keep this fixture deterministic and
-- ensure that it never contains or targets personal data.
INSERT INTO public.roles(name, description)
VALUES
  ('customer', 'Independent entitlement matrix customer'),
  ('super_admin', 'Independent entitlement matrix administrator')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.users(
  id,
  email,
  full_name,
  email_verified_at,
  phone_verified_at,
  profile_completed_at,
  kyc_status,
  status
)
VALUES
  (
    '10000000-0000-0000-0000-000000000001',
    'entitlement-kyc-only@example.invalid',
    'Matrix KYC Only',
    now(),
    NULL,
    NULL,
    'approved',
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000002',
    'entitlement-profile-only@example.invalid',
    'Matrix Profile Only',
    now(),
    NULL,
    now(),
    'unverified',
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000003',
    'entitlement-phone-only@example.invalid',
    'Matrix Phone Only',
    now(),
    now(),
    NULL,
    'unverified',
    'active'
  ),
  (
    '10000000-0000-0000-0000-000000000004',
    'entitlement-admin@example.invalid',
    'Matrix Administrator',
    now(),
    now(),
    now(),
    'approved',
    'active'
  );

INSERT INTO public.user_roles(user_id, role_id)
SELECT fixture.user_id, role_row.id
FROM (
  VALUES
    ('10000000-0000-0000-0000-000000000001'::UUID, 'customer'),
    ('10000000-0000-0000-0000-000000000002'::UUID, 'customer'),
    ('10000000-0000-0000-0000-000000000003'::UUID, 'customer'),
    ('10000000-0000-0000-0000-000000000004'::UUID, 'super_admin')
) AS fixture(user_id, role_name)
JOIN public.roles AS role_row ON role_row.name = fixture.role_name;

CREATE FUNCTION pg_temp.capability_allowed(p_user_id UUID, p_capability_key TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (public.resolve_user_capability(p_user_id, p_capability_key) ->> 'allowed')::BOOLEAN,
    FALSE
  );
$$;

SET LOCAL "request.jwt.claims" TO '{"role":"service_role"}';

SELECT extensions.is(
  jsonb_build_object(
    'recommendation.submit', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'recommendation.submit'),
    'affiliate.full', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'affiliate.full'),
    'affiliate.earn_commission', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'affiliate.earn_commission'),
    'wallet.request_withdrawal', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'wallet.request_withdrawal')
  ),
  '{
    "recommendation.submit": true,
    "affiliate.full": true,
    "affiliate.earn_commission": true,
    "wallet.request_withdrawal": true
  }'::JSONB,
  'Email plus approved KYC allows recommendation, Full Affiliate, commission earning, and withdrawal request'
);

SELECT extensions.is(
  jsonb_build_object(
    'commerce.booking', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'commerce.booking'),
    'commerce.purchase', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'commerce.purchase'),
    'commerce.checkout', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'commerce.checkout'),
    'ai.basic_recommendation', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000001', 'ai.basic_recommendation')
  ),
  '{
    "commerce.booking": false,
    "commerce.purchase": false,
    "commerce.checkout": false,
    "ai.basic_recommendation": false
  }'::JSONB,
  'Email plus approved KYC without Phone denies commerce and basic AI'
);

SELECT extensions.is(
  jsonb_build_object(
    'recommendation.submit', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'recommendation.submit'),
    'affiliate.limited', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'affiliate.limited')
  ),
  '{
    "recommendation.submit": true,
    "affiliate.limited": true
  }'::JSONB,
  'Email plus Profile allows recommendation and Limited Affiliate'
);

SELECT extensions.is(
  jsonb_build_object(
    'affiliate.full', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'affiliate.full'),
    'affiliate.earn_commission', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'affiliate.earn_commission'),
    'wallet.request_withdrawal', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'wallet.request_withdrawal')
  ),
  '{
    "affiliate.full": false,
    "affiliate.earn_commission": false,
    "wallet.request_withdrawal": false
  }'::JSONB,
  'Email plus Profile without KYC denies Full Affiliate, commission earning, and withdrawal request'
);

SELECT extensions.is(
  jsonb_build_object(
    'commerce.booking', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'commerce.booking'),
    'commerce.purchase', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'commerce.purchase'),
    'commerce.checkout', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'commerce.checkout'),
    'ai.basic_recommendation', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000002', 'ai.basic_recommendation')
  ),
  '{
    "commerce.booking": false,
    "commerce.purchase": false,
    "commerce.checkout": false,
    "ai.basic_recommendation": false
  }'::JSONB,
  'Email plus Profile without Phone denies commerce and basic AI'
);

SELECT extensions.is(
  jsonb_build_object(
    'commerce.booking', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'commerce.booking'),
    'commerce.purchase', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'commerce.purchase'),
    'commerce.checkout', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'commerce.checkout'),
    'ai.basic_recommendation', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'ai.basic_recommendation')
  ),
  '{
    "commerce.booking": true,
    "commerce.purchase": true,
    "commerce.checkout": true,
    "ai.basic_recommendation": true
  }'::JSONB,
  'Email plus Phone allows commerce and basic AI'
);

SELECT extensions.is(
  jsonb_build_object(
    'recommendation.submit', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'recommendation.submit'),
    'affiliate.limited', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'affiliate.limited'),
    'affiliate.full', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'affiliate.full'),
    'affiliate.earn_commission', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'affiliate.earn_commission'),
    'wallet.request_withdrawal', pg_temp.capability_allowed('10000000-0000-0000-0000-000000000003', 'wallet.request_withdrawal')
  ),
  '{
    "recommendation.submit": false,
    "affiliate.limited": false,
    "affiliate.full": false,
    "affiliate.earn_commission": false,
    "wallet.request_withdrawal": false
  }'::JSONB,
  'Email plus Phone without Profile or KYC denies recommendation, affiliate, commission, and withdrawal capabilities'
);

-- Exercise the governed assignment RPC before proving that its manual allow
-- remains subordinate to the immutable Phone hard guard.
SET LOCAL "request.jwt.claims" TO
  '{"sub":"10000000-0000-0000-0000-000000000004","role":"authenticated"}';

DO $setup$
BEGIN
  PERFORM public.set_entitlement_assignment(
    'user',
    '10000000-0000-0000-0000-000000000001',
    'commerce.purchase',
    'allow',
    now(),
    NULL,
    'Matrix verifies that manual allow cannot bypass Phone'
  );
END;
$setup$;

INSERT INTO public.entitlement_policy_versions(
  id,
  policy_id,
  version,
  status,
  effect,
  effective_from,
  created_by
)
SELECT
  '10000000-0000-0000-0000-000000000005',
  policy_row.id,
  2147483647,
  'pending_approval',
  'allow',
  now(),
  '10000000-0000-0000-0000-000000000004'
FROM public.entitlement_policies AS policy_row
WHERE policy_row.key = 'builtin.affiliate.full';

SELECT extensions.throws_ok(
  $$
    SELECT public.approve_entitlement_policy_version(
      '10000000-0000-0000-0000-000000000005',
      'Matrix rejects high-risk creator self-approval'
    )
  $$,
  'P0001',
  'self_approval_forbidden',
  'A high-risk policy creator cannot approve their own version'
);

SET LOCAL "request.jwt.claims" TO '{"role":"service_role"}';

SELECT extensions.is(
  jsonb_build_object(
    'allowed', (
      public.resolve_user_capability(
        '10000000-0000-0000-0000-000000000001',
        'commerce.purchase'
      ) ->> 'allowed'
    )::BOOLEAN,
    'blockerCode', public.resolve_user_capability(
      '10000000-0000-0000-0000-000000000001',
      'commerce.purchase'
    ) ->> 'blockerCode',
    'source', public.resolve_user_capability(
      '10000000-0000-0000-0000-000000000001',
      'commerce.purchase'
    ) ->> 'source'
  ),
  '{
    "allowed": false,
    "blockerCode": "PHONE_VERIFICATION_REQUIRED",
    "source": "hard_guard"
  }'::JSONB,
  'A manual allow assignment cannot bypass the Phone hard guard'
);

INSERT INTO public.audit_logs(
  id,
  actor_id,
  action,
  entity_type,
  entity_id,
  after_data,
  note
)
VALUES (
  '10000000-0000-0000-0000-000000000006',
  '10000000-0000-0000-0000-000000000004',
  'matrix.audit_probe',
  'entitlement_matrix',
  '10000000-0000-0000-0000-000000000006',
  '{"fixture": true}'::JSONB,
  'Disposable append-only audit probe'
);

SELECT extensions.throws_ok(
  $$
    UPDATE public.audit_logs
       SET note = 'Mutation must be rejected'
     WHERE id = '10000000-0000-0000-0000-000000000006'
  $$,
  'P0001',
  'audit_logs_append_only',
  'Audit records reject UPDATE'
);

SELECT extensions.throws_ok(
  $$
    DELETE FROM public.audit_logs
     WHERE id = '10000000-0000-0000-0000-000000000006'
  $$,
  'P0001',
  'audit_logs_append_only',
  'Audit records reject DELETE'
);

SELECT * FROM extensions.finish();

ROLLBACK;
