DROP POLICY IF EXISTS vendor_onboarding_owner_insert ON public.vendor_onboarding_profiles;
CREATE POLICY vendor_onboarding_owner_insert ON public.vendor_onboarding_profiles
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS vendor_onboarding_owner_update ON public.vendor_onboarding_profiles;
CREATE POLICY vendor_onboarding_owner_update ON public.vendor_onboarding_profiles
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = (SELECT auth.uid())))
  WITH CHECK (EXISTS (SELECT 1 FROM public.vendors v WHERE v.id = vendor_id AND v.owner_id = (SELECT auth.uid())));
