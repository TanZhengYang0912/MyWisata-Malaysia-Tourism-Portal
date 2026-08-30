-- Public contributor profiles may show the moderated bio.
-- Keep contact, verification internals, survey answers and KYC evidence private.

CREATE OR REPLACE VIEW public.public_users AS
SELECT
  id,
  full_name,
  display_name,
  avatar_url,
  city,
  country,
  (kyc_status = 'approved') AS is_kyc_verified,
  (profile_completed_at IS NOT NULL) AS has_completed_profile,
  created_at,
  bio
FROM public.users
WHERE status = 'active';

ALTER VIEW public.public_users OWNER TO postgres;
GRANT SELECT ON public.public_users TO authenticated, anon;;
