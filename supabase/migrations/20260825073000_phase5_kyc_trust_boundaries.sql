-- Phase 5 corrective trust boundaries for KYC review and verified identity.

CREATE OR REPLACE FUNCTION public.protect_verification_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.phone IS DISTINCT FROM OLD.phone
     AND current_setting('app.allow_verification_write', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'phone_change_requires_otp';
  END IF;

  IF current_setting('app.allow_verification_write', true) = 'on' THEN
    RETURN NEW;
  END IF;

  -- KYC reviewers may only change another user's tier/KYC outcome through an
  -- existing SECURITY DEFINER review flow. They cannot mutate verified contact
  -- fields, and direct self-mutation remains blocked.
  IF public.can_review_kyc(auth.uid())
     AND auth.uid() IS DISTINCT FROM OLD.id
     AND NEW.email IS NOT DISTINCT FROM OLD.email
     AND NEW.phone IS NOT DISTINCT FROM OLD.phone
     AND NEW.email_verified_at IS NOT DISTINCT FROM OLD.email_verified_at
     AND NEW.phone_verified_at IS NOT DISTINCT FROM OLD.phone_verified_at THEN
    RETURN NEW;
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email
     OR NEW.tier IS DISTINCT FROM OLD.tier
     OR NEW.email_verified_at IS DISTINCT FROM OLD.email_verified_at
     OR NEW.kyc_status IS DISTINCT FROM OLD.kyc_status
     OR NEW.phone_verified_at IS DISTINCT FROM OLD.phone_verified_at THEN
    RAISE EXCEPTION 'verification_fields_are_server_managed';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.promote_to_kyc_verified(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.can_review_kyc(auth.uid()) THEN
    RAISE EXCEPTION 'admin_required';
  END IF;
  IF auth.uid() = p_user_id THEN
    RAISE EXCEPTION 'self_dealing';
  END IF;

  UPDATE public.users
     SET tier = 'kyc_verified',
         kyc_status = 'approved',
         updated_at = now()
   WHERE id = p_user_id
     AND public.tier_rank(tier) >= public.tier_rank('profile_complete');

  IF NOT FOUND THEN
    IF NOT EXISTS (SELECT 1 FROM public.users WHERE id = p_user_id) THEN
      RAISE EXCEPTION 'user_not_found: %', p_user_id;
    END IF;
    RAISE EXCEPTION 'tier_insufficient: profile_complete required before kyc_verified';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_to_kyc_verified(UUID) FROM PUBLIC, anon, authenticated;

-- `review_reason_detail` was previously both a customer-readable snapshot
-- field and an internal review-event note. Keep the immutable event copy and
-- make the customer-owned submission snapshot incapable of retaining it.
ALTER TABLE public.kyc_submissions
  DROP CONSTRAINT IF EXISTS kyc_submissions_other_reason_detail_check;

UPDATE public.kyc_submissions
   SET review_reason_detail = NULL
 WHERE review_reason_detail IS NOT NULL;

CREATE OR REPLACE FUNCTION public.keep_kyc_internal_note_private()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.review_reason_detail := NULL;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.keep_kyc_internal_note_private() FROM PUBLIC, anon, authenticated, service_role;
DROP TRIGGER IF EXISTS keep_kyc_internal_note_private ON public.kyc_submissions;
CREATE TRIGGER keep_kyc_internal_note_private
  BEFORE INSERT OR UPDATE OF review_reason_detail ON public.kyc_submissions
  FOR EACH ROW EXECUTE FUNCTION public.keep_kyc_internal_note_private();
