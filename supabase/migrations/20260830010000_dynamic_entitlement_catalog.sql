-- Versioned, default-deny entitlement catalog.
-- Policy requirements are structured data only; governed evaluation and mutation
-- RPCs are added by the following entitlement-governance migration.

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

CREATE TABLE public.capabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  category TEXT NOT NULL
    CHECK (category IN ('platform','commerce','ai','recommendation','affiliate','wallet')),
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','critical')),
  customer_visible BOOLEAN NOT NULL DEFAULT FALSE,
  manually_assignable BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.entitlement_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE CHECK (key ~ '^[a-z][a-z0-9_.]*[a-z0-9]$'),
  capability_key TEXT NOT NULL REFERENCES public.capabilities(key) ON UPDATE RESTRICT ON DELETE RESTRICT,
  name TEXT NOT NULL CHECK (char_length(BTRIM(name)) BETWEEN 1 AND 160),
  scope TEXT NOT NULL DEFAULT 'customer' CHECK (scope IN ('customer','admin','system')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.entitlement_policy_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.entitlement_policies(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL CHECK (version > 0),
  status TEXT NOT NULL
    CHECK (status IN ('draft','pending_approval','scheduled','active','retired')),
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  effective_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  effective_until TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  activated_at TIMESTAMPTZ,
  UNIQUE (policy_id, version),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (approved_by IS NULL OR created_by IS NULL OR approved_by <> created_by),
  CHECK (
    (status IN ('active','retired') AND activated_at IS NOT NULL)
    OR (status NOT IN ('active','retired') AND activated_at IS NULL)
  )
);

CREATE TABLE public.entitlement_policy_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id UUID NOT NULL
    REFERENCES public.entitlement_policy_versions(id) ON DELETE CASCADE,
  alternative_group INTEGER NOT NULL CHECK (alternative_group > 0),
  fact_key TEXT NOT NULL
    CHECK (fact_key IN ('email_verified','phone_verified','profile_complete','kyc_status','account_status','role','plan','partner')),
  operator TEXT NOT NULL CHECK (operator IN ('eq','not_eq','contains')),
  expected_value JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_version_id, alternative_group, fact_key),
  CHECK (jsonb_typeof(expected_value) IN ('boolean','string','number','array'))
);

CREATE TABLE public.entitlement_policy_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version_id UUID NOT NULL
    REFERENCES public.entitlement_policy_versions(id) ON DELETE RESTRICT,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected')),
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reason TEXT NOT NULL CHECK (char_length(BTRIM(reason)) BETWEEN 10 AND 2000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (policy_version_id, actor_id)
);

CREATE TABLE public.entitlement_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type TEXT NOT NULL CHECK (subject_type IN ('user','role','plan','partner')),
  subject_id TEXT NOT NULL CHECK (char_length(BTRIM(subject_id)) BETWEEN 1 AND 255),
  capability_key TEXT NOT NULL REFERENCES public.capabilities(key) ON UPDATE RESTRICT ON DELETE RESTRICT,
  effect TEXT NOT NULL CHECK (effect IN ('allow','deny')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,
  reason TEXT NOT NULL CHECK (char_length(BTRIM(reason)) BETWEEN 10 AND 2000),
  granted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  active_during TSTZRANGE GENERATED ALWAYS AS (tstzrange(starts_at, COALESCE(expires_at, 'infinity'::timestamptz), '[)')) STORED,
  CHECK (expires_at IS NULL OR expires_at > starts_at),
  CHECK ((revoked_at IS NULL AND revoked_by IS NULL) OR revoked_at IS NOT NULL),
  CONSTRAINT entitlement_assignments_no_unrevoked_overlap
    EXCLUDE USING gist (
      subject_type WITH =,
      subject_id WITH =,
      capability_key WITH =,
      effect WITH =,
      active_during WITH &&
    )
    WHERE (revoked_at IS NULL)
);

CREATE TABLE public.entitlement_generation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  singleton BOOLEAN NOT NULL DEFAULT TRUE UNIQUE CHECK (singleton),
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX entitlement_policy_versions_one_active_per_policy
  ON public.entitlement_policy_versions (policy_id)
  WHERE status = 'active';

CREATE INDEX entitlement_policies_capability_idx
  ON public.entitlement_policies (capability_key, scope);

CREATE INDEX entitlement_policy_versions_effective_idx
  ON public.entitlement_policy_versions (status, effective_from, effective_until);

CREATE INDEX entitlement_policy_requirements_group_idx
  ON public.entitlement_policy_requirements (policy_version_id, alternative_group);

CREATE INDEX entitlement_policy_approvals_version_idx
  ON public.entitlement_policy_approvals (policy_version_id, created_at);

CREATE INDEX entitlement_assignments_lookup_idx
  ON public.entitlement_assignments (subject_type, subject_id, capability_key, starts_at, expires_at);

CREATE OR REPLACE FUNCTION public.protect_capability_key()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'capability_keys_are_immutable';
  END IF;

  IF NEW.key IS DISTINCT FROM OLD.key THEN
    RAISE EXCEPTION 'capability_keys_are_immutable';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER capabilities_key_immutable
  BEFORE UPDATE OR DELETE ON public.capabilities
  FOR EACH ROW EXECUTE FUNCTION public.protect_capability_key();

CREATE OR REPLACE FUNCTION public.protect_activated_entitlement_policy_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF OLD.activated_at IS NULL THEN
    IF TG_OP = 'DELETE' THEN
      RETURN OLD;
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'activated_entitlement_policy_versions_are_immutable';
  END IF;

  -- Retirement is the sole lifecycle transition after activation. The policy
  -- definition, approval, effective dates, and activation evidence stay fixed.
  IF OLD.status = 'active'
     AND NEW.status = 'retired'
     AND ROW(
       NEW.id,
       NEW.policy_id,
       NEW.version,
       NEW.effect,
       NEW.effective_from,
       NEW.effective_until,
       NEW.created_by,
       NEW.approved_by,
       NEW.created_at,
       NEW.activated_at
     ) IS NOT DISTINCT FROM ROW(
       OLD.id,
       OLD.policy_id,
       OLD.version,
       OLD.effect,
       OLD.effective_from,
       OLD.effective_until,
       OLD.created_by,
       OLD.approved_by,
       OLD.created_at,
       OLD.activated_at
     ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'activated_entitlement_policy_versions_are_immutable';
END;
$$;

CREATE TRIGGER entitlement_policy_versions_immutable_after_activation
  BEFORE UPDATE OR DELETE ON public.entitlement_policy_versions
  FOR EACH ROW EXECUTE FUNCTION public.protect_activated_entitlement_policy_version();

INSERT INTO public.capabilities(key, category, risk_level, customer_visible, manually_assignable)
VALUES
  ('platform.browse', 'platform', 'low', TRUE, FALSE),
  ('commerce.booking', 'commerce', 'medium', TRUE, TRUE),
  ('commerce.purchase', 'commerce', 'medium', TRUE, TRUE),
  ('commerce.checkout', 'commerce', 'high', TRUE, FALSE),
  ('ai.basic_recommendation', 'ai', 'low', TRUE, TRUE),
  ('recommendation.submit', 'recommendation', 'medium', TRUE, TRUE),
  ('affiliate.limited', 'affiliate', 'medium', TRUE, TRUE),
  ('affiliate.full', 'affiliate', 'high', TRUE, FALSE),
  ('affiliate.earn_commission', 'affiliate', 'high', TRUE, FALSE),
  ('wallet.request_withdrawal', 'wallet', 'critical', TRUE, FALSE),
  ('wallet.approve_withdrawal', 'wallet', 'critical', FALSE, FALSE)
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entitlement_policies(key, capability_key, name, scope)
VALUES
  ('builtin.platform.browse', 'platform.browse', 'Authenticated browsing', 'customer'),
  ('builtin.commerce.booking', 'commerce.booking', 'Customer booking', 'customer'),
  ('builtin.commerce.purchase', 'commerce.purchase', 'Customer purchase', 'customer'),
  ('builtin.commerce.checkout', 'commerce.checkout', 'Customer checkout', 'customer'),
  ('builtin.ai.basic_recommendation', 'ai.basic_recommendation', 'Basic AI recommendation', 'customer'),
  ('builtin.recommendation.submit', 'recommendation.submit', 'Recommendation submission', 'customer'),
  ('builtin.affiliate.limited', 'affiliate.limited', 'Limited affiliate', 'customer'),
  ('builtin.affiliate.full', 'affiliate.full', 'Full affiliate', 'customer'),
  ('builtin.affiliate.earn_commission', 'affiliate.earn_commission', 'Affiliate commission earning', 'customer'),
  ('builtin.wallet.request_withdrawal', 'wallet.request_withdrawal', 'Withdrawal request', 'customer')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.entitlement_policy_versions(
  policy_id,
  version,
  status,
  effect,
  effective_from,
  activated_at
)
SELECT
  policy.id,
  1,
  'active',
  'allow',
  now(),
  now()
FROM public.entitlement_policies AS policy
WHERE policy.key IN (
  'builtin.platform.browse',
  'builtin.commerce.booking',
  'builtin.commerce.purchase',
  'builtin.commerce.checkout',
  'builtin.ai.basic_recommendation',
  'builtin.recommendation.submit',
  'builtin.affiliate.limited',
  'builtin.affiliate.full',
  'builtin.affiliate.earn_commission',
  'builtin.wallet.request_withdrawal'
)
ON CONFLICT (policy_id, version) DO NOTHING;

INSERT INTO public.entitlement_policy_requirements(
  policy_version_id,
  alternative_group,
  fact_key,
  operator,
  expected_value
)
SELECT
  version.id,
  seed.alternative_group,
  seed.fact_key,
  seed.operator,
  seed.expected_value
FROM (
  VALUES
    ('builtin.platform.browse', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.commerce.booking', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.commerce.booking', 1, 'phone_verified', 'eq', 'true'::jsonb),
    ('builtin.commerce.purchase', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.commerce.purchase', 1, 'phone_verified', 'eq', 'true'::jsonb),
    ('builtin.commerce.checkout', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.commerce.checkout', 1, 'phone_verified', 'eq', 'true'::jsonb),
    ('builtin.ai.basic_recommendation', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.ai.basic_recommendation', 1, 'phone_verified', 'eq', 'true'::jsonb),
    ('builtin.recommendation.submit', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.recommendation.submit', 1, 'profile_complete', 'eq', 'true'::jsonb),
    ('builtin.recommendation.submit', 2, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.recommendation.submit', 2, 'kyc_status', 'eq', '"approved"'::jsonb),
    ('builtin.affiliate.limited', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.affiliate.limited', 1, 'profile_complete', 'eq', 'true'::jsonb),
    ('builtin.affiliate.limited', 1, 'kyc_status', 'not_eq', '"approved"'::jsonb),
    ('builtin.affiliate.full', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.affiliate.full', 1, 'kyc_status', 'eq', '"approved"'::jsonb),
    ('builtin.affiliate.earn_commission', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.affiliate.earn_commission', 1, 'kyc_status', 'eq', '"approved"'::jsonb),
    ('builtin.wallet.request_withdrawal', 1, 'email_verified', 'eq', 'true'::jsonb),
    ('builtin.wallet.request_withdrawal', 1, 'kyc_status', 'eq', '"approved"'::jsonb)
) AS seed(policy_key, alternative_group, fact_key, operator, expected_value)
JOIN public.entitlement_policies AS policy
  ON policy.key = seed.policy_key
JOIN public.entitlement_policy_versions AS version
  ON version.policy_id = policy.id
 AND version.version = 1
ON CONFLICT (policy_version_id, alternative_group, fact_key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.protect_activated_entitlement_policy_requirement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF EXISTS (
      SELECT 1
        FROM public.entitlement_policy_versions AS version
       WHERE version.id IN (OLD.policy_version_id, NEW.policy_version_id)
         AND version.activated_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'activated_entitlement_policy_requirements_are_immutable';
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    IF EXISTS (
      SELECT 1
        FROM public.entitlement_policy_versions AS version
       WHERE version.id = OLD.policy_version_id
         AND version.activated_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'activated_entitlement_policy_requirements_are_immutable';
    END IF;
  ELSE
    IF EXISTS (
      SELECT 1
        FROM public.entitlement_policy_versions AS version
       WHERE version.id = NEW.policy_version_id
         AND version.activated_at IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'activated_entitlement_policy_requirements_are_immutable';
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER entitlement_policy_requirements_immutable_after_activation
  BEFORE INSERT OR UPDATE OR DELETE ON public.entitlement_policy_requirements
  FOR EACH ROW EXECUTE FUNCTION public.protect_activated_entitlement_policy_requirement();

REVOKE ALL ON FUNCTION public.protect_capability_key()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_activated_entitlement_policy_version()
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.protect_activated_entitlement_policy_requirement()
  FROM PUBLIC, anon, authenticated, service_role;

INSERT INTO public.entitlement_generation(singleton, generation)
VALUES (TRUE, 1)
ON CONFLICT (singleton) DO NOTHING;

ALTER TABLE public.capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_policy_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_policy_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_policy_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entitlement_generation ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.capabilities
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.entitlement_policies
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.entitlement_policy_versions
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.entitlement_policy_requirements
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.entitlement_policy_approvals
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.entitlement_assignments
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.entitlement_generation
  FROM PUBLIC, anon, authenticated, service_role;

GRANT SELECT ON TABLE public.capabilities
  TO service_role;
GRANT SELECT ON TABLE public.entitlement_policies
  TO service_role;
GRANT SELECT ON TABLE public.entitlement_policy_versions
  TO service_role;
GRANT SELECT ON TABLE public.entitlement_policy_requirements
  TO service_role;
GRANT SELECT ON TABLE public.entitlement_policy_approvals
  TO service_role;
GRANT SELECT ON TABLE public.entitlement_assignments
  TO service_role;
GRANT SELECT ON TABLE public.entitlement_generation
  TO service_role;
