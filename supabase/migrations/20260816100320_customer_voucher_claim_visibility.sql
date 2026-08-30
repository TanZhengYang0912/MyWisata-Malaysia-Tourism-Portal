-- Keep claimed vouchers visible to their owner even after the public deal
-- filters stop matching (for example, after expiry or deactivation).
DROP POLICY IF EXISTS vouchers_claim_owner_read ON public.vouchers;
CREATE POLICY vouchers_claim_owner_read
  ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    review_status = 'approved'
    AND EXISTS (
      SELECT 1
      FROM public.customer_voucher_claims AS claims
      WHERE claims.voucher_id = vouchers.id
        AND claims.user_id = (SELECT auth.uid())
    )
  );

-- The claim and checkout entry points are SECURITY DEFINER functions. The
-- application calls them only after authenticating the current user.
REVOKE EXECUTE ON FUNCTION public.claim_voucher(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_voucher(UUID) FROM public;

REVOKE EXECUTE ON FUNCTION public.prepare_checkout(
  UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB
) FROM anon;
REVOKE EXECUTE ON FUNCTION public.prepare_checkout(
  UUID, UUID[], TEXT, TEXT, TEXT, NUMERIC, NUMERIC, NUMERIC, TEXT, UUID, JSONB
) FROM public;

REVOKE EXECUTE ON FUNCTION public.mark_customer_voucher_claim_redeemed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_customer_voucher_claim_redeemed() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.mark_customer_voucher_claim_redeemed() FROM public;;
