# Stripe Standard Connect for Malaysia

## Context

The current Connect onboarding route creates an Express account with the
platform as the loss-liable party. Stripe rejects that configuration for a
Malaysia-based platform. The working tree also contains an unsafe demo
variant that writes `acct_demo_*` and `stripe_payouts_enabled = true`; that
cannot be used in a real withdrawal path.

## Goal

Use a real Stripe connected account configuration in which Stripe collects the
connected account's requirements and owns connected-account payment losses.
Persist only a real `acct_*` identifier, and let Stripe's account status and
webhooks determine whether payouts are enabled.

## Design

### Onboarding route

- Keep the existing KYC/tier gate (`tier = kyc_verified`).
- For a user without a real connected account, create a Standard-equivalent
  account using controller properties:
  - `losses.payments = stripe`
  - `fees.payer = account`
  - `requirement_collection = stripe`
  - `stripe_dashboard.type = full`
- Request the `transfers` capability required by the withdrawal flow.
- Store the returned real account ID only after account creation succeeds.
- For an existing real account, create a fresh Stripe-hosted onboarding link.
- Treat legacy `acct_demo_*` values as invalid demo data and replace them with
  a real account on the next onboarding attempt. Never mark payouts enabled in
  this route.

### Status and withdrawals

- Keep `stripe_payouts_enabled` false until the signed `account.updated`
  webhook or an equivalent server-side Stripe status sync confirms it.
- Preserve the existing fail-closed withdrawal checks: missing account,
  `payouts_enabled = false`, or an invalid Stripe account must prevent payout.
- Do not create transfers or payouts for synthetic/demo account IDs.

### Error handling

- Return a clear 502 for Stripe onboarding failures and log the Stripe request
  ID server-side.
- Return a 403 for missing KYC/tier prerequisites.
- Never expose the secret key or raw account data to the browser.

### Verification

- Add route-level tests asserting Standard-equivalent controller parameters,
  real-account persistence, retry-link behavior, demo-ID rejection, and the
  absence of forced `stripe_payouts_enabled = true`.
- Run the existing test suite and a Stripe test-mode onboarding smoke test.

## Non-goals

- No mock Stripe account or fake payout success state.
- No migration to Accounts v2 in this change; the existing SDK and webhook
  paths remain on the compatible Accounts v1 endpoint while using the
  supported Standard-equivalent liability configuration.
- No change to the wallet ledger or withdrawal state machine beyond keeping
  it fail-closed for real Stripe status.
