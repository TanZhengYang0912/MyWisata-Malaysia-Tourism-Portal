# Stripe Standard Connect Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Malaysia-blocked Express/mock Connect flow with a real Stripe Standard-equivalent connected-account onboarding and fail-closed payout path.

**Architecture:** The onboarding route remains a server-side Next.js route. It creates a real connected account with Stripe-liable controller properties, stores only the returned `acct_*` ID, and creates a single-use Stripe-hosted onboarding link. `account.updated` remains the source of truth for `stripe_payouts_enabled`; payout approval continues to retrieve the real account and refuses missing/invalid/not-enabled accounts.

**Tech Stack:** Next.js App Router, TypeScript, `stripe` Node SDK `22.3.1`, Supabase server client, Vitest.

## Global Constraints

- Never generate or persist `acct_demo_*` as a production payout account.
- Never set `stripe_payouts_enabled = true` in the onboarding route.
- The connected-account configuration must assign `losses.payments = stripe`, `fees.payer = account`, `requirement_collection = stripe`, and `stripe_dashboard.type = full`.
- Preserve the existing KYC/tier gate: only `tier = 'kyc_verified'` may start onboarding.
- Do not change unrelated uncommitted work in `app/api/admin/kyc/submissions/route.ts`.
- Do not change the wallet ledger, withdrawal state machine, webhook module, or any other contributor's module.

---

### Task 1: Add a failing contract test for Standard onboarding

**Files:**
- Create: `app/api/stripe/connect-onboard/__tests__/route.test.ts`
- Reference: `app/api/stripe/connect-onboard/route.ts`, `lib/stripe.ts`

**Interfaces:**
- Consumes the route's exported `POST(req: Request)` handler.
- Mocks `@/lib/supabase/server` and `@/lib/stripe` so no network or database mutation occurs.
- Produces assertions for account creation parameters, account-link parameters, and database updates.

- [ ] **Step 1: Write the failing tests**

  Mock an authenticated `kyc_verified` user, a Supabase query chain, `stripe.accounts.create`, and `stripe.accountLinks.create`. Add tests that assert:

  ```ts
  expect(stripe.accounts.create).toHaveBeenCalledWith(expect.objectContaining({
    country: 'MY',
    controller: {
      losses: { payments: 'stripe' },
      fees: { payer: 'account' },
      requirement_collection: 'stripe',
      stripe_dashboard: { type: 'full' },
    },
  }));
  expect(update).not.toHaveBeenCalledWith(expect.objectContaining({ stripe_payouts_enabled: true }));
  expect(response.status).toBe(200);
  ```

  Add a second test where the user has `acct_demo_123`; the route must create a real account instead of creating an onboarding link for that fake ID.

- [ ] **Step 2: Run the focused tests and verify they fail**

  Run:

  ```powershell
  npx vitest run app/api/stripe/connect-onboard/__tests__/route.test.ts
  ```

  Expected: FAIL because the current route neither calls Stripe nor creates Standard-equivalent controller properties.

- [ ] **Step 3: Commit the failing contract tests**

  ```powershell
  git add app/api/stripe/connect-onboard/__tests__/route.test.ts
  git commit -m "test: specify Standard Stripe Connect onboarding"
  ```

### Task 2: Replace the mock/Express onboarding route

**Files:**
- Modify: `app/api/stripe/connect-onboard/route.ts`
- Test: `app/api/stripe/connect-onboard/__tests__/route.test.ts`

**Interfaces:**
- `POST(req: Request)` keeps returning `{ url: string }` on success.
- It reads `tier`, `stripe_connect_account_id`, `full_name`, `phone`, and `email` from `users`.
- It persists `{ stripe_connect_account_id: account.id, stripe_payouts_enabled: false }` only after a successful real account creation.

- [ ] **Step 1: Restore the Stripe client import and implement real account creation**

  Replace the synthetic-account block with:

  ```ts
  import { stripe } from '@/lib/stripe';
  import type Stripe from 'stripe';

  const isRealStripeAccountId = (value: string | null): value is string =>
    Boolean(value && /^acct_[A-Za-z0-9]+$/.test(value) && !value.startsWith('acct_demo_'));
  ```

  If no real account ID exists, call `stripe.accounts.create` with the Malaysian country, the existing email/metadata, the `transfers` capability, and the controller configuration from the global constraints. Do not set `stripe_payouts_enabled` to true. If a demo ID exists, overwrite it only after the real account call succeeds.

- [ ] **Step 2: Create a real Stripe-hosted onboarding link**

  For a real existing or newly-created ID, call:

  ```ts
  const accountLink = await stripe.accountLinks.create({
    account: accountId,
    refresh_url: `${origin}/customer/wallet?onboarding=refresh`,
    return_url: `${origin}/customer/wallet?onboarding=complete`,
    type: 'account_onboarding',
  });
  ```

  Persist the ID with the service-role Supabase client only after account creation, and return `accountLink.url`.

- [ ] **Step 3: Add fail-closed Stripe error handling**

  Catch Stripe errors, log only the request ID and error type server-side, and return HTTP 502 with a generic onboarding error. Keep 401 for unauthenticated and 403 for non-`kyc_verified` users. Never return the Stripe secret, raw error object, or account requirements to the browser.

- [ ] **Step 4: Run the focused tests**

  ```powershell
  npx vitest run app/api/stripe/connect-onboard/__tests__/route.test.ts
  ```

  Expected: all Standard controller, retry, fake-ID, tier-gate, and error-handling tests PASS.

- [ ] **Step 5: Commit the route implementation**

  ```powershell
  git add app/api/stripe/connect-onboard/route.ts app/api/stripe/connect-onboard/__tests__/route.test.ts
  git commit -m "feat: use real Standard Stripe Connect onboarding"
  ```

### Task 3: Review existing status synchronization without touching other modules

**Files:**
- Read-only review: `app/api/stripe/connect-webhook/route.ts`
- Read-only review: `app/api/admin/withdrawals/[id]/approve/route.ts`

**Interfaces:**
- `account.updated` continues to call `update_connect_status` with the real `acct_*` ID and Stripe's `payouts_enabled` value.
- Existing withdrawal approval remains fail-closed because Stripe account
  retrieval fails for an invalid ID; no other contributor's module is edited.

- [ ] **Step 1: Verify the existing webhook and payout guards**

  Confirm by inspection that `account.updated` uses the event's
  `payouts_enabled` value and that approval retrieves the Stripe account before
  creating a transfer or payout. Record any discrepancy and stop for user
  approval instead of editing those modules.

- [ ] **Step 2: Verify no module changes occurred**

  ```powershell
  git status --short
  ```

  Expected: only the onboarding route and its test are changed by this plan;
  pre-existing `app/api/admin/kyc/submissions/route.ts` changes remain intact.

### Task 4: Full verification and Stripe test-mode smoke check

**Files:**
- Modify only if a test exposes a real regression: the files from Tasks 2–3.

- [ ] **Step 1: Run the complete test suite**

  ```powershell
  npm test
  npm run lint
  ```

  Expected: all existing tests pass and lint reports no new errors.

- [ ] **Step 2: Verify environment and Stripe dashboard configuration**

  Confirm only on the local machine:

  ```env
  STRIPE_SECRET_KEY=sk_test_...
  STRIPE_CONNECT_WEBHOOK_SECRET=whsec_...
  ```

  Configure the test-mode Connect webhook for `account.updated`, `payout.paid`, and `payout.failed`. Do not paste any secret values into chat or Git.

- [ ] **Step 3: Perform the user smoke test**

  1. Sign in as a `kyc_verified` user.
  2. Open `/customer/wallet` and click the Stripe onboarding action.
  3. Confirm the redirect is a Stripe-hosted onboarding URL and the account ID stored in Supabase starts with `acct_` and is not `acct_demo_`.
  4. Complete Stripe test onboarding.
  5. Confirm `account.updated` changes `stripe_payouts_enabled` from the event value.
  6. Confirm a withdrawal cannot be approved before payouts are enabled and can proceed only after Stripe reports the account ready.

- [ ] **Step 4: Commit any final test-only adjustments**

  ```powershell
  git status --short
  git diff --check
  ```
