# Provider Simulator Payment Engineering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented; final verification recorded in the task handoff

**Goal:** Replace client-declared external checkout success with provider-shaped, signed, idempotent asynchronous simulators for TNG eWallet, GrabPay, and bank transfer while preserving Stripe Sandbox, Wallet settlement, refunds, and the existing TNG payout simulator.

**Architecture:** Checkout preparation continues to own pricing and reservations. A small payment-provider boundary creates opaque simulator sessions, while one signed-event processor and a service-role-only PostgreSQL RPC own every external transition. Authenticated customers can settle only Wallet checkouts; external success is accepted only from Stripe verification or a signed simulator event.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase/PostgreSQL, Zod, Vitest, Playwright, Node `crypto`.

**Design:** `Docs/superpowers/specs/2026-08-17-provider-simulator-payment-engineering-design.md`

## Global Constraints

- Stripe remains the official Sandbox/Test integration; existing Stripe top-up behavior is unchanged.
- TNG eWallet, GrabPay, bank transfer, and TNG payout remain explicitly simulated and never claim live connectivity.
- Simulator routes require `NODE_ENV !== 'production'`, `PAYMENT_SIMULATOR_MODE=enabled`, and a non-empty `PAYMENT_SIMULATOR_WEBHOOK_SECRET`.
- Do not store or log PINs, OTPs, card numbers, complete bank account numbers, raw signed webhook bodies, or provider identity documents.
- Existing applied migrations remain immutable; all database changes use one forward-only migration.
- No new dependencies. Preserve all unrelated user changes in the dirty shared worktree.

## File Map and Scope

**Create:**

- `lib/payments/providers.ts`
- `lib/payments/simulator-config.ts`
- `lib/payments/simulator-webhook.ts`
- `lib/payments/settle-simulator-event.ts`
- focused tests under `lib/payments/__tests__/`
- `app/api/payments/simulator/sessions/[sessionId]/route.ts`
- `app/api/payments/simulator/sessions/[sessionId]/action/route.ts`
- `app/api/payments/simulator/refunds/[refundId]/action/route.ts`
- `app/api/payments/simulator/webhook/route.ts`
- focused tests beside the simulator routes
- `app/customer/checkout/simulator/[sessionId]/page.tsx`
- `app/customer/checkout/simulator/[sessionId]/__tests__/page.contract.test.ts`
- `supabase/migrations/20260817172900_provider_simulator_payment_engineering.sql`
- `supabase/migrations/__tests__/20260817172900_provider_simulator_payment_engineering.test.ts`
- `app/admin/refunds/page.tsx`
- `app/admin/refunds/__tests__/page.contract.test.ts`
- `app/api/admin/refunds/route.ts`
- `app/api/admin/refunds/__tests__/route.test.ts`
- `tests/e2e/payment-provider-simulator.spec.ts`

**Modify:**

- `lib/validation/schemas.ts`
- `lib/checkout/idempotency.ts`
- `lib/checkout/__tests__/idempotency.test.ts`
- `app/api/checkout/prepare/route.ts`
- `app/api/checkout/finalize/route.ts`
- focused tests under `app/api/checkout/__tests__/`
- `app/api/stripe/webhook/route.ts`
- `app/api/checkout/confirm-stripe/route.ts`
- focused Stripe route tests
- `app/customer/checkout/page.tsx`
- `app/api/admin/refunds/[refundId]/route.ts`
- `app/api/admin/refunds/[refundId]/__tests__/wallet-route.test.ts`
- `app/admin/layout.tsx`
- `README.md`
- `.env.example` only if it is already tracked

**Do not touch:** Stripe Connect routes, TNG payout/withdrawal code, Wallet top-up and `credit_topup`, KYC documents, Vendor registration, recommendation, map, chat, Guest Mode, catalogue modeling, or existing migrations.

## Database Changes

- Harden `finalize_checkout(UUID,TEXT,TEXT,TEXT)` so authenticated callers can succeed only for `payment_method='wallet'`.
- Correct failed/cancelled/expired state mapping.
- Add service-only `settle_provider_checkout(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,BIGINT,TEXT) RETURNS JSONB`.
- Validate provider-method mapping, amount, currency, payment reference, event identity, payload hash, and terminal-state compatibility while rows are locked.
- Store the actual provider in `payment_events`; exact replay is idempotent and conflicting replay raises `provider_event_conflict`.
- Add refund attempt fields: `provider_refund_id`, `provider_refund_event_id`, `provider_failure_code`, `provider_failure_message`, `attempt_count`, and `updated_at`.
- Add service-only `begin_simulated_refund(UUID,TEXT,TEXT)` and `settle_simulated_refund(UUID,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,BOOLEAN)`.
- Revoke every new SECURITY DEFINER function from `PUBLIC`, `anon`, and `authenticated`; grant only to `service_role`.

## Risks

- Tightening customer finalization can break Stripe or Wallet split unless both move to the service-only RPC in the same implementation.
- Provider events and financial state must share one transaction; otherwise a recorded event could exist without settlement.
- Stripe browser confirmation and Stripe webhook can carry different event IDs for one payment; a terminal-state replay must suppress duplicate notifications.
- Historical `provider='platform'` rows must not be rewritten or change balances.
- Admin refunds have an API but no current Admin page; the new UI must reuse existing Admin/Approver authorization.
- Playwright requires seeded test fixtures and must never mutate Production.

---

### Task 1: Pure provider contract, configuration, and signed event parser

**Files:** Create `lib/payments/providers.ts`, `lib/payments/simulator-config.ts`, `lib/payments/simulator-webhook.ts`, and their focused tests.

**Produces:**

```ts
type CheckoutProviderName =
  | 'stripe'
  | 'platform_wallet'
  | 'tng_ewallet_simulator'
  | 'grabpay_simulator'
  | 'bank_transfer_simulator';

function resolveCheckoutProvider(paymentMethod: string, requestedProvider?: string): CheckoutProviderName;
function isPaymentSimulatorEnabled(env?: Record<string, string | undefined>): boolean;
function createSimulatorPaymentSession(input: {
  checkoutSessionId: string;
  provider: 'tng_ewallet_simulator' | 'grabpay_simulator' | 'bank_transfer_simulator';
  expiresAt: string;
  secret: string;
}): { providerPaymentId: string; actionUrl: string; expiresAt: string };
```

- [ ] Write failing tests for every valid provider pair, invalid pair, missing secret, disabled mode, and Production fail-closed behavior.
- [ ] Run `npx vitest run lib/payments/__tests__/providers.test.ts lib/payments/__tests__/simulator-config.test.ts` and confirm failure because the modules are absent.
- [ ] Implement the minimal provider mapping and HMAC-derived opaque `sim_pay_...` references.
- [ ] Write failing signed-event tests for discriminated payment/refund events, valid signature, altered raw body, malformed JSON, unknown fields, invalid UUID/provider, amount `<= 0`, non-MYR currency, and oversized failure values.
- [ ] Implement `signSimulatorWebhookPayload`, `verifySimulatorWebhookSignature` with `timingSafeEqual`, `hashSimulatorWebhookPayload`, and strict Zod parsing.
- [ ] Run all Task 1 tests and confirm zero failures.

### Task 2: Database authorization, event idempotency, and atomic settlement

**Files:** Create the new migration and migration test; modify `app/api/checkout/finalize/route.ts`, `lib/validation/schemas.ts`, and focused checkout tests.

**Produces:**

```sql
public.settle_provider_checkout(
  p_checkout_session_id UUID,
  p_provider TEXT,
  p_outcome TEXT,
  p_provider_payment_id TEXT,
  p_provider_event_id TEXT,
  p_payload_sha256 TEXT,
  p_amount_sen BIGINT,
  p_currency TEXT
) RETURNS JSONB
```

- [ ] Write a failing migration contract test requiring `provider_confirmation_required`, row locks, actual provider event insertion, payload conflict detection, and service-role-only grants.
- [ ] Run the migration test and confirm failure because the migration is absent.
- [ ] Add the forward migration with exact mapping: Stripe to `stripe_card|wallet_split`, TNG/GrabPay simulator to `ewallet`, bank simulator to `bank_transfer`.
- [ ] Lock checkout, latest payment, and existing event; validate authoritative amount/currency/provider/reference; insert the event and finalize in the same transaction.
- [ ] Return `idempotent=true` for identical replay or an already matching terminal state; raise `provider_event_conflict` for changed payload, target, or outcome.
- [ ] Remove provider IDs from the customer finalize schema. Route Wallet success through `finalize_checkout` with null provider fields and map `provider_confirmation_required` to HTTP 403.
- [ ] Run the migration, Wallet finalize, and external-finalize guard tests.

### Task 3: Simulator preparation, owned session API, action, and webhook

**Files:** Modify idempotency/schema/prepare files; create `lib/payments/settle-simulator-event.ts`, three simulator routes, and focused tests.

**Consumes:** Task 1 provider types and Task 2 settlement RPC.

**Produces:**

```ts
type SimulatorCheckoutRequest = {
  paymentMethod: 'ewallet' | 'bank_transfer';
  paymentProvider: 'tng_ewallet_simulator' | 'grabpay_simulator' | 'bank_transfer_simulator';
};
```

- [ ] Add failing idempotency tests proving provider selection changes the request hash.
- [ ] Add failing prepare tests for invalid pairs, disabled simulator, provider assignment, opaque reference, `requires_action`, and safe `simulatorUrl` response.
- [ ] Implement provider normalization without changing pricing, cart selection, vouchers, reservations, Stripe, or Wallet logic.
- [ ] Add failing session GET tests for unauthenticated access, cross-user denial, safe owned projection, disabled mode, and secret non-disclosure.
- [ ] Add failing action/webhook tests for valid success/failure/cancel/expire, bank pending-to-paid, signature tampering, expired session, provider mismatch, replay, and conflict.
- [ ] Implement `settleSimulatorEvent(rawBody, signature)` so verification/parsing happens before the service client is created.
- [ ] Make the authenticated simulator action endpoint read amount/currency/provider from the server, build canonical JSON, sign server-side, and call the same settlement function as the raw webhook route.
- [ ] Trigger receipt/email/Vendor notification hooks only when the RPC reports a new paid transition.
- [ ] Run all Task 3 tests and confirm zero failures.

### Task 4: Stripe uses the trusted provider settlement RPC

**Files:** Modify Stripe webhook, confirm-stripe route, and their focused tests.

- [ ] Add failing tests that expect `settle_provider_checkout`, authoritative Stripe amount/currency, session ownership, and no notification when `idempotent=true`.
- [ ] Run the focused Stripe tests and confirm RED.
- [ ] Update the verified Stripe webhook to hash its raw body and call the new RPC with provider `stripe`.
- [ ] Update browser confirmation to retrieve Stripe state server-side, hash a canonical safe event, and call the new RPC; browser data supplies only the Stripe session ID.
- [ ] Keep webhook signature verification and Stripe session ownership checks unchanged.
- [ ] Run `npx vitest run app/api/stripe app/api/checkout/__tests__` and confirm Stripe, Wallet, and checkout regressions pass.

### Task 5: Customer simulator experience

**Files:** Modify `app/customer/checkout/page.tsx`; create simulator page and contract test.

- [ ] Write failing UI contract tests requiring separate TNG, GrabPay, and Bank options; removal of generic external `Pay (Success)` controls; and explicit `Sandbox / Simulated — no real money moves` copy.
- [ ] Run the new contract test and confirm RED.
- [ ] Submit database method `ewallet` with the selected TNG/GrabPay provider; submit `bank_transfer` with the bank simulator provider.
- [ ] Redirect Stripe to Stripe, Wallet to customer finalize, and simulated methods to `simulatorUrl`.
- [ ] Build the simulator page from the safe session API: TNG/GrabPay QR/deep-link presentation, fictitious bank reference, Pending state, and success/failure/cancel/expire actions.
- [ ] Navigate only after the server returns the accepted settlement state.
- [ ] Run the simulator and existing checkout UI tests.

### Task 6: Provider-neutral simulated refunds and Admin review

**Files:** Extend the new migration/test; create the Admin refunds list route/test; modify Admin refund action route/test; create `app/api/payments/simulator/refunds/[refundId]/action/route.ts` and its test; create `app/admin/refunds/page.tsx` and test; modify Admin navigation.

**Produces:**

```sql
public.begin_simulated_refund(p_refund_id UUID, p_provider TEXT, p_provider_refund_id TEXT) RETURNS JSONB
public.settle_simulated_refund(p_refund_id UUID, p_provider TEXT, p_event_id TEXT, p_provider_refund_id TEXT, p_outcome TEXT, p_payload_sha256 TEXT, p_failure_code TEXT, p_failure_message TEXT, p_retryable BOOLEAN) RETURNS JSONB
```

- [ ] Add failing tests for role denial, pending-only approval, opaque reference, service-only grants, idempotent success, conflict, and retryable failure returning to `pending` with redacted bounded fields.
- [ ] Add a failing Stripe test requiring idempotency key `refund:<refund-id>` and retain the Wallet refund regression test.
- [ ] Implement refund attempt fields and both RPCs in the same forward migration.
- [ ] Branch the Admin route: Wallet uses existing RPC; Stripe uses Stripe Sandbox with deterministic idempotency; simulators begin an asynchronous attempt and do not mark terminal state directly.
- [ ] Implement the Admin-only simulator refund action route. It reads the refund/payment attempt server-side, builds and signs a canonical refund event, then invokes the same shared webhook settlement function; no secret or caller-supplied provider reference is accepted.
- [ ] Implement an Admin/Approver-only GET route that returns refunds with safe order/payment/provider fields; it uses the service client only after checking the caller role and never returns failure secrets or unmasked payment credentials.
- [ ] Add the minimal Admin Refunds page listing safe order/payment/provider details, statuses, attempt count, and Approve/Reject actions; expose simulator outcome controls only when enabled.
- [ ] Run migration, Admin refund route, Admin page, and Admin layout tests.

### Task 7: Documentation, Playwright, and final verification

**Files:** Modify README and tracked `.env.example`; create `tests/e2e/payment-provider-simulator.spec.ts`.

- [ ] Document non-production configuration, developer/staging secrets, Production fail-closed behavior, and the exact provider status table.
- [ ] Add Playwright journeys for TNG success, GrabPay failure, bank pending-to-paid, cancellation, duplicate action, Stripe redirect regression, Wallet no-simulator regression, and Admin simulated refund.
- [ ] Run the affected Vitest suite once after the final code change:

```bash
npx vitest run lib/payments lib/checkout app/api/checkout app/api/payments/simulator app/api/stripe app/api/admin/refunds app/customer/checkout app/admin/refunds supabase/migrations/__tests__/20260817172900_provider_simulator_payment_engineering.test.ts
```

- [ ] Run static verification:

```bash
npx tsc --noEmit
npm run lint -- --quiet
git diff --check
```

- [ ] Run Playwright once: `npx playwright test tests/e2e/payment-provider-simulator.spec.ts --project=chromium`.
- [ ] Run one BLOCKING, 10-minute, read-only `luna_worker` review over the new migration, `lib/payments/**`, simulator routes, checkout finalization, Stripe settlement callers, and refund route. The main agent must not inspect or edit that exclusive scope while the review is running.
- [ ] Fix at most one confirmed authorization/privacy/data-loss/core-flow blocker and rerun only affected verification. Record non-blocking findings as follow-up.
- [ ] Use these exact README classifications:

```text
Stripe Checkout / Top-up: Official Sandbox integration
MyWisata Wallet checkout: Implemented
TNG eWallet Checkout: Signed non-production simulator
GrabPay Checkout: Signed non-production simulator
Bank Transfer Checkout: Signed non-production simulator
TNG Direct Credit Withdrawal: Signed non-production simulator
Live TNG / GrabPay / Bank APIs: Not implemented; requires provider approval
```

## Completion Criteria

- Authenticated customers cannot mark Stripe or simulated external payments successful through the customer finalize API.
- Every external success comes from verified Stripe state or an accepted signed simulator event.
- Provider events are provider-specific, payload-bound, replay-safe, and atomic with order/payment state.
- Simulator methods fail closed in Production and expose no secret or sensitive credential.
- Stripe, Wallet, reservations, refunds, TNG withdrawal, Affiliate, and Vendor notification regressions remain passing.
- Browser demonstration accurately labels simulation and proves pending, success, failure, cancellation, expiry, refund, and replay behavior.
