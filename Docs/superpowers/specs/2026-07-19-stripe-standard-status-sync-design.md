# Stripe Standard Connect status synchronization

## Context

MyWisata uses Stripe Standard connected accounts with the Stripe Dashboard set to
`full`. The wallet currently assumes that every linked account can receive a new
`account_onboarding` Account Link. A completed Standard account can reject that
request, leaving the user with the generic `Unable to start Stripe onboarding`
message even when Stripe reports payouts as enabled.

## Goals

- Keep the existing Standard + Full Dashboard business model.
- Treat Stripe as the source of truth for connected-account capabilities.
- Synchronize `public.users.stripe_payouts_enabled` from Stripe without allowing a
  stale client or failed synchronization to unlock withdrawals.
- Avoid creating a new Account Link for an account that is already connected or
  already completed.
- Present actionable, stable user-facing messages while keeping Stripe request
  details in server logs.

## Non-goals

- Switching to Express or changing the Connect business model.
- Manually setting `stripe_payouts_enabled` to `true` from SQL or the browser.
- Changing wallet ledger, withdrawal approval, or KYC rules.
- Calling real Stripe from Playwright tests.

## Design

### Server-side status reconciliation

Create a server-only helper that retrieves the stored connected account with the
platform Stripe client, reads `details_submitted`, `payouts_enabled`, and the
controller/dashboard properties, and persists the payout flag for the matching
Supabase user. The helper is fail-closed: if retrieval or persistence fails, it
returns an unavailable state and never enables withdrawals.

The helper is used when the wallet loads and immediately before a withdrawal is
submitted. The existing `account.updated` webhook remains the asynchronous,
idempotent synchronization path.

### Onboarding endpoint

`POST /api/stripe/connect-onboard` first retrieves an existing account. If Stripe
reports `payouts_enabled`, it synchronizes the database and returns a connected
status without creating an Account Link. If the account is Standard with a full
Dashboard and still has requirements, it returns a dedicated response telling the
user to complete them in Stripe Dashboard. Account Link creation is retained only
for a newly-created account where Stripe accepts the link request. Stripe errors
are logged with request identifiers but mapped to stable application errors.

### Wallet UI

The wallet treats the reconciled server status as authoritative. An enabled
account shows “Bank account connected” and no onboarding button. An incomplete
Standard/full-Dashboard account shows a Stripe Dashboard instruction and a
“Retry status check” action. A synchronization failure leaves withdrawals blocked
and shows a retryable status message.

### Withdrawal safety

The withdrawal endpoint performs a final server-side reconciliation before the
existing database/RPC withdrawal gate. A positive browser state alone is never
enough to submit a withdrawal.

## Error mapping

- Account missing or not linked to this platform: ask the user to contact support.
- Standard/full-Dashboard requirements incomplete: ask the user to complete Stripe
  Dashboard requirements.
- Stripe unavailable or database update failed: show a retryable verification
  message and keep withdrawals blocked.

## Tests

- Route tests prove enabled accounts skip `accountLinks.create`.
- Route tests cover incomplete Standard/full-Dashboard and Stripe failure cases.
- Webhook tests prove `account.updated` updates the payout flag safely.
- Wallet tests prove enabled status hides onboarding and failed reconciliation is
  fail-closed.
- Existing Stripe, wallet, and withdrawal tests must remain green.

## Acceptance criteria

1. The current enabled `acct_...` account no longer produces a 502 when the wallet
   page or Continue Setup action is used.
2. The database flag becomes true only after a successful server-side Stripe
   status read or verified webhook event.
3. A missing, unrelated, or incomplete account never enables withdrawal.
4. No new migration is required.
5. Tests cover every branch above without depending on a live Stripe account.
