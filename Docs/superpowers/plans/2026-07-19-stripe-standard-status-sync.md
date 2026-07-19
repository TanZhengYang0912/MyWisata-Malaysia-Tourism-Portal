# Stripe Standard status synchronization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop MyWisata from creating invalid onboarding links for completed Standard/Full Dashboard accounts, while synchronizing Stripe payout status safely before wallet display and withdrawal.

**Architecture:** Add a server-only Stripe account retrieval helper, a status-reconciliation API used by the wallet, and a final reconciliation check in the withdrawal route. Keep `account.updated` as the asynchronous path; all writes to `stripe_payouts_enabled` remain server-side and fail closed.

**Tech Stack:** Next.js App Router, TypeScript, Stripe Node SDK, Supabase server client/RPCs, Vitest.

## Global Constraints

- Keep Stripe Standard + Full Dashboard; do not switch to Express.
- Never set `stripe_payouts_enabled` from browser code or SQL.
- Do not change wallet ledger, KYC, or withdrawal approval rules.
- Do not call live Stripe from Playwright tests.
- Preserve unrelated dirty-worktree changes.

## File Map

- Create `lib/stripe/connect-status.ts`: server-only Stripe account retrieval and normalized status types.
- Create `app/api/stripe/connect-status/route.ts`: authenticated wallet status reconciliation endpoint.
- Modify `app/api/stripe/connect-onboard/route.ts`: retrieve existing accounts first and avoid invalid Account Links.
- Modify `app/api/wallet/withdrawals/route.ts`: reconcile Stripe status before the guarded withdrawal RPC.
- Modify `app/customer/wallet/page.tsx`: consume the status endpoint and show retry/dashboard guidance.
- Extend `app/api/stripe/connect-onboard/__tests__/route.test.ts` and create `app/api/stripe/connect-status/__tests__/route.test.ts`.
- Extend `app/api/wallet/withdrawals/__tests__/route.test.ts` for fail-closed reconciliation.

### Task 1: Add the Stripe account status helper

**Files:**
- Create: `lib/stripe/connect-status.ts`
- Test: `lib/stripe/__tests__/connect-status.test.ts`

**Interfaces:**
- Produces `retrieveConnectAccountStatus(accountId: string): Promise<StripeConnectStatus>`.
- `StripeConnectStatus` includes `accountId`, `accountType`, `dashboardType`, `detailsSubmitted`, `payoutsEnabled`, `chargesEnabled`, and `requiresDashboardAction`.

- [ ] **Step 1: Write the failing tests**

```ts
it('normalizes an enabled Standard Full Dashboard account', async () => {
  mocks.retrieve.mockResolvedValue({
    id: 'acct_enabled',
    type: 'standard',
    details_submitted: true,
    payouts_enabled: true,
    charges_enabled: true,
    controller: { stripe_dashboard: { type: 'full' } },
  });

  await expect(retrieveConnectAccountStatus('acct_enabled')).resolves.toEqual({
    accountId: 'acct_enabled',
    accountType: 'standard',
    dashboardType: 'full',
    detailsSubmitted: true,
    payoutsEnabled: true,
    chargesEnabled: true,
    requiresDashboardAction: false,
  });
});

it('marks an incomplete Full Dashboard account as requiring Dashboard action', async () => {
  mocks.retrieve.mockResolvedValue({
    id: 'acct_incomplete',
    type: 'standard',
    details_submitted: false,
    payouts_enabled: false,
    charges_enabled: false,
    controller: { stripe_dashboard: { type: 'full' } },
  });

  await expect(retrieveConnectAccountStatus('acct_incomplete')).resolves.toMatchObject({
    requiresDashboardAction: true,
    payoutsEnabled: false,
  });
});
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
npx vitest run lib/stripe/__tests__/connect-status.test.ts
```

Expected: FAIL because `retrieveConnectAccountStatus` does not exist.

- [ ] **Step 3: Implement the minimal helper**

Call `stripe.accounts.retrieve(accountId)`, map nullable Stripe fields to booleans, and set `requiresDashboardAction` only when the dashboard type is `full` and payouts are disabled. Do not mutate Supabase in this helper.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run the same Vitest command. Expected: both tests pass.

- [ ] **Step 5: Commit**

```powershell
git add lib/stripe/connect-status.ts lib/stripe/__tests__/connect-status.test.ts
git commit -m "feat: normalize Stripe connected account status"
```

### Task 2: Add authenticated status reconciliation

**Files:**
- Create: `app/api/stripe/connect-status/route.ts`
- Test: `app/api/stripe/connect-status/__tests__/route.test.ts`

**Interfaces:**
- `GET /api/stripe/connect-status` returns `{ data: { accountId, tier, payoutsEnabled, detailsSubmitted, requiresDashboardAction, sync: 'stripe' | 'database' } }`.
- Returns `403` for non-KYC users, `404` for missing user rows, `503` for Stripe or Supabase synchronization failures.

- [ ] **Step 1: Write failing route tests**

Cover an enabled account updating its row to `stripe_payouts_enabled: true`, an incomplete Full Dashboard account returning `requiresDashboardAction: true`, and a Stripe retrieval failure returning `503` without updating the row.

- [ ] **Step 2: Run focused tests and verify RED**

```powershell
npx vitest run app/api/stripe/connect-status/__tests__/route.test.ts
```

Expected: FAIL because the route does not exist.

- [ ] **Step 3: Implement the route**

Authenticate with `createClient()`, select the user’s tier and account ID, call `retrieveConnectAccountStatus`, update only that user’s `stripe_payouts_enabled`, and return stable error codes. A failed retrieve or failed update must not return an enabled status.

- [ ] **Step 4: Run focused tests and verify GREEN**

```powershell
npx vitest run app/api/stripe/connect-status/__tests__/route.test.ts
```

- [ ] **Step 5: Commit**

```powershell
git add app/api/stripe/connect-status
git commit -m "feat: reconcile Stripe payout status on demand"
```

### Task 3: Make onboarding status-aware

**Files:**
- Modify: `app/api/stripe/connect-onboard/route.ts`
- Test: `app/api/stripe/connect-onboard/__tests__/route.test.ts`

- [ ] **Step 1: Add failing tests**

Add mocked `accounts.retrieve` cases proving:

```ts
it('returns verified status and skips Account Links for enabled accounts', async () => {
  mocks.single.mockResolvedValue({ data: { ...kycUser, stripe_connect_account_id: 'acct_enabled' }, error: null });
  mocks.accountsRetrieve.mockResolvedValue(enabledAccount);

  const response = await POST(request());

  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ status: 'verified', accountId: 'acct_enabled' });
  expect(mocks.accountLinksCreate).not.toHaveBeenCalled();
});

it('returns Dashboard action guidance for incomplete Full Dashboard accounts', async () => {
  mocks.single.mockResolvedValue({ data: { ...kycUser, stripe_connect_account_id: 'acct_incomplete' }, error: null });
  mocks.accountsRetrieve.mockResolvedValue(incompleteFullDashboardAccount);

  const response = await POST(request());

  expect(response.status).toBe(409);
  expect(await response.json()).toMatchObject({ error: { code: 'STRIPE_DASHBOARD_ACTION_REQUIRED' } });
  expect(mocks.accountLinksCreate).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused test and verify RED**

```powershell
npx vitest run app/api/stripe/connect-onboard/__tests__/route.test.ts
```

Expected: the new tests fail because the route always creates an Account Link for a stored ID.

- [ ] **Step 3: Implement minimal route changes**

For a stored real account ID, retrieve status first. Persist the payout flag. Return `{ status: 'verified', accountId }` when enabled. Return a `409` Dashboard-action response when the account is Full Dashboard and not enabled. Only call `accountLinks.create` when the account is newly created or not Full Dashboard. Map account-link errors to stable application errors.

- [ ] **Step 4: Run all onboarding tests**

```powershell
npx vitest run app/api/stripe/connect-onboard/__tests__/route.test.ts
```

Expected: existing KYC, legacy demo-account, and failure tests plus new status tests pass.

- [ ] **Step 5: Commit**

```powershell
git add app/api/stripe/connect-onboard/route.ts app/api/stripe/connect-onboard/__tests__/route.test.ts
git commit -m "fix: skip invalid Stripe onboarding links"
```

### Task 4: Reconcile before wallet display and withdrawal

**Files:**
- Modify: `app/customer/wallet/page.tsx`
- Modify: `app/api/wallet/withdrawals/route.ts`
- Test: `app/api/wallet/withdrawals/__tests__/route.test.ts`

- [ ] **Step 1: Add failing withdrawal tests**

Mock the status helper and Supabase user update to prove an enabled account synchronizes before `submit_wallet_withdrawal`, while a Stripe failure returns `503` and never calls the RPC.

- [ ] **Step 2: Run the focused withdrawal tests and verify RED**

```powershell
npx vitest run app/api/wallet/withdrawals/__tests__/route.test.ts
```

Expected: the new preflight assertions fail because the route currently calls the RPC immediately.

- [ ] **Step 3: Implement server-side preflight**

Before `submit_wallet_withdrawal`, select the authenticated user’s connected account ID, retrieve Stripe status, persist the payout flag, return `STRIPE_STATUS_UNAVAILABLE` when Stripe retrieval or the Supabase update fails, and return `PAYOUT_ACCOUNT_REQUIRED` when the account is missing or `payouts_enabled` is false. Keep the existing RPC as the final KYC/tier/ledger gate.

- [ ] **Step 4: Update wallet status loading**

Replace the browser-only `getConnectStatus` read with `GET /api/stripe/connect-status`. Map `verified` to “Bank account connected”; map `requiresDashboardAction` to the Stripe Dashboard instruction and a “Retry status check” action; keep the button disabled/hidden when verified.

- [ ] **Step 5: Run focused tests and verify GREEN**

```powershell
npx vitest run app/api/wallet/withdrawals/__tests__/route.test.ts app/api/stripe/connect-status/__tests__/route.test.ts
```

- [ ] **Step 6: Commit**

```powershell
git add app/customer/wallet/page.tsx app/api/wallet/withdrawals/route.ts app/api/wallet/withdrawals/__tests__/route.test.ts
git commit -m "fix: reconcile Stripe status before wallet actions"
```

### Task 5: Full verification

**Files:** No additional production files.

- [ ] **Step 1: Run all Stripe and wallet unit tests**

```powershell
npx vitest run app/api/stripe app/api/wallet/withdrawals lib/stripe
```

Expected: all targeted tests pass.

- [ ] **Step 2: Run typecheck and lint**

```powershell
npx tsc --noEmit
npx eslint app/api/stripe/connect-onboard/route.ts app/api/stripe/connect-status/route.ts app/api/wallet/withdrawals/route.ts app/customer/wallet/page.tsx lib/stripe/connect-status.ts
```

Expected: no TypeScript errors and no new ESLint errors.

- [ ] **Step 3: Run the existing wallet Playwright smoke suite**

```powershell
npx playwright test tests/e2e/wallet-governance.spec.ts
```

Expected: existing wallet governance tests remain green without contacting Stripe.

- [ ] **Step 4: Inspect the final diff**

```powershell
git diff --check
git status --short
```

Confirm only intended Stripe status files are part of these commits and unrelated dirty-worktree changes remain untouched.
