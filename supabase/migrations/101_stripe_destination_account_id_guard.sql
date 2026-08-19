-- Stripe payout destinations must reference a Connect account ID, never raw
-- bank details. TNG provider references keep their provider-defined format.

ALTER TABLE public.payout_destinations
  DROP CONSTRAINT IF EXISTS payout_destinations_stripe_account_id;

ALTER TABLE public.payout_destinations
  ADD CONSTRAINT payout_destinations_stripe_account_id
  CHECK (
    provider <> 'stripe_connect'
    OR (
      provider_reference IS NOT NULL
      AND provider_reference ~ '^acct_[A-Za-z0-9]+$'
    )
  );
