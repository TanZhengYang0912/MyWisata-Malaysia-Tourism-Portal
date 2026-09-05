-- Keep public Vendor reads independent from authenticated staff authorization.
-- PostgreSQL checks function privileges for every function referenced by an RLS
-- policy, even when another OR branch would admit the row. The previous policy
-- therefore made anon catalogue reads require EXECUTE on has_staff_permission().

DROP POLICY IF EXISTS vendors_read_only_access ON public.vendors;
DROP POLICY IF EXISTS vendors_public_read ON public.vendors;
DROP POLICY IF EXISTS vendors_authenticated_read ON public.vendors;

CREATE POLICY vendors_public_read
  ON public.vendors
  FOR SELECT
  TO anon
  USING (status = 'approved');

CREATE POLICY vendors_authenticated_read
  ON public.vendors
  FOR SELECT
  TO authenticated
  USING (
    status = 'approved'
    OR owner_id = auth.uid()
    OR public.has_staff_permission(auth.uid(), 'admin.vendor.manage')
  );
