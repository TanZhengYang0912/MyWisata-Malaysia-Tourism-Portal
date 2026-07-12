-- Supabase Auth creates public.users before the profile is completed.
-- Keep the default unverified state valid for newly-created manager accounts.
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_kyc_status_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_kyc_status_check
  CHECK (kyc_status IN ('unverified', 'pending', 'approved', 'rejected'));
