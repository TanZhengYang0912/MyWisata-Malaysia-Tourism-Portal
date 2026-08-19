# ADR-011: Strict JIT Stripe payout onboarding for customer earnings

**Status:** Accepted

## Decision

Customer wallet load, top-up, and purchase flows do not fetch or display Stripe
Connect by default. Payout setup becomes visible only when:

1. available earnings reach the RM50 withdrawal minimum;
2. a customer with positive available earnings clicks Withdraw; or
3. the customer returns from Stripe-hosted onboarding.

A customer with zero available earnings is not prompted to create a connected
account. MyWisata KYC approval remains a server-side prerequisite for starting
Stripe onboarding.

Customer reward accounts request the `transfers` capability only. Stripe-hosted
Account Links collect `currently_due` requirements incrementally. MyWisata
stores the connected account ID and payout-enabled status, but does not copy
Stripe-hosted bank details or Stripe verification files.

The wallet displays normalized Stripe states:

- `currently_due`: the customer must complete details;
- `pending_verification`: Stripe is reviewing and no customer action is needed;
- `payouts_enabled`: bank withdrawals are enabled;
- `past_due`: requirements missed their deadline and setup must be remediated;
- `restricted`: payouts remain disabled for another Stripe restriction.

## Rationale

Connect is a payout-recipient concern, not a payer concern. Loading it for every
wallet visitor made ordinary tourists believe Stripe account verification was
required for top-up. Strict JIT keeps payer Checkout separate and defers payout
friction until it is relevant.

Stripe requirements can change asynchronously, so a return URL is never treated
as proof of completion. The application retrieves the Account server-side,
checks `payouts_enabled` and the `requirements` hash, and continues listening for
`account.updated`. Withdrawal submission still performs its own fail-closed
server-side Stripe status check; the wallet intercept is UX, not authorization.
