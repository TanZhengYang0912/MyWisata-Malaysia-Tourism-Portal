# Wallet, Withdrawal and Approval Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a transaction-safe MYR Wallet that supports Wallet checkout, full refunds, governed adjustments, secure withdrawal approval, customer/admin notifications, escalation and monthly finance reports.

**Architecture:** Keep `wallets` as the authoritative two spendable-bucket balance (`topup_sen`, `earnings_sen`) and make every money mutation an append-only `wallet_transactions` row inside a `SECURITY DEFINER` PostgreSQL function. Add a small reserved and withdrawn projection for clear UI/reporting, but derive all customer-facing transaction history from the ledger. Move withdrawal submission and all admin withdrawal decisions through server routes plus database RPCs; browser code must never write money, audit, notification, role, or withdrawal state directly.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase PostgreSQL/RLS/`SECURITY DEFINER` RPCs, Stripe Connect, Nodemailer email outbox, Gemini moderation, Vitest, Playwright.

## Global Constraints

- Add one forward-only migration named `supabase/migrations/073_wallet_withdrawal_governance.sql`; do not rename or edit already-applied migrations.
- Preserve existing `topup_sen`, `earnings_sen`, `pending_earnings_sen`, wallet transactions, reward records, completed orders, and payout history; no reset or destructive migration.
- Currency is MYR only and every database money calculation uses integer sen; never use JavaScript floating point as the source of truth.
- Wallet checkout drains Top-up balance first, then Earnings balance. Pending rewards and Reserved withdrawal money are never spendable.
- Do not implement split payment. If Wallet spendable amount is insufficient, offer Top Up or Card; do not create a partial Wallet debit.
- Only `kyc_verified` users with an enabled Stripe Connect payout account may submit a withdrawal. The destination is the single Stripe-managed, masked bank account; do not collect bank/e-wallet numbers in MyWisata.
- **Wallet Approver** is the existing database `approver` role, relabelled in UI. It can review withdrawals only. Super Admin alone manages Wallet Approvers, Wallet settings, adjustments, escalation and reports.
- Reject, Hold, adjustment, fraud override and role changes require a clean Gemini moderation result and a reason of at least 10 characters. Approve note is optional, but if supplied it must contain at least 10 characters.
- Use existing Gmail/outbox plumbing for Customer email. Do not include KYC images, IC/passport numbers, raw fraud rules, secrets, or full bank details in email/notifications.
- The customer notification Bell is immediately to the left of Cart in desktop and mobile navigation; each icon keeps its own unread/count badge.
- Do not change catalogue, vendor/outlet, KYC document storage/review, chat, profile, or affiliate-link authorization behaviour except where this plan explicitly reads their existing data.

---

## File Map

| File | Responsibility |
|---|---|
| `supabase/migrations/073_wallet_withdrawal_governance.sql` | Additive wallet projections, entries in the existing `platform_settings`, immutable governance tables, all money/RPC state transitions, RLS and report functions. |
| `lib/wallet/types.ts` | Shared API-safe Wallet, ledger, risk, report and notification types. |
| `lib/wallet/amounts.ts` | Integer-sen conversion/display helpers and deterministic Top-up-first allocation. |
| `lib/wallet/withdrawal-email.ts` | Server-only fan-out to Customer and active approver recipients through the existing outbox. |
| `lib/wallet/request-ip.ts` | Trusted server-side IP extraction; no browser-provided IP. |
| `app/api/wallet/withdrawals/route.ts` | Customer submits one withdrawal through the database RPC and server email fan-out. |
| `app/api/admin/withdrawals/[id]/approve/route.ts` | Moderated optional note, first/second approval, Stripe transition and server audit. |
| `app/api/admin/withdrawals/[id]/reject/route.ts` | Moderated required reason, atomic release/audit/notification. |
| `app/api/admin/withdrawals/[id]/hold/route.ts` | Moderated required reason, retained reserve, audit/notification. |
| `app/api/admin/withdrawals/[id]/fraud-override/route.ts` | Super-Admin-only, moderated override of a high-risk approval block. |
| `app/api/admin/wallet-settings/route.ts` | Super-Admin-only read/update of clearance, minimum, dual-approval and escalation settings. |
| `app/api/admin/wallet-approvers/route.ts` | Super-Admin-only grant/revoke Wallet Approver role with audit and notification. |
| `app/api/notifications/route.ts`, `app/api/notifications/[id]/read/route.ts` | Customer notification listing and read acknowledgement. |
| `app/api/internal/wallet-maintenance/route.ts` | CRON-protected reward clearing, overdue escalation and report generation. |
| `app/customer/wallet/page.tsx` | Four-balance summary, withdrawal submission, ledger pagination, receipt detail links and Top Up/Card insufficient-balance recovery. |
| `app/customer/checkout/page.tsx`, `app/api/checkout/finalize/route.ts` | Wallet-only settlement through the checkout RPC, no split payment. |
| `app/api/orders/[orderId]/refund/route.ts`, `app/api/admin/refunds/[refundId]/route.ts` | Full refund request and atomic Wallet/Stripe settlement. |
| `app/admin/withdrawals/page.tsx` | Review context, risk summary, notes, Hold/Reject/Approve state controls and receipt/history links. |
| `app/admin/wallet/page.tsx`, `app/admin/reports/payouts/page.tsx` | Super Admin adjustment/settings and monthly report UI. |
| `app/admin/users/page.tsx`, `components/admin/user-management-drawer.tsx` | Wallet Approver assignment entry point only; retain existing user-management actions. |
| `app/customer/layout.tsx`, `components/customer/notification-menu.tsx` | Notification Bell immediately before Cart. |
| `lib/moderation.ts`, `lib/validation/schemas.ts` | New moderated action contexts and strictly typed request bodies. |
| `vercel.json` | Hourly authenticated maintenance schedule; job itself is idempotent and uses MYT. |

## Task 1: Establish money-domain contracts and failing tests

**Files:**
- Create: `lib/wallet/types.ts`
- Create: `lib/wallet/amounts.ts`
- Create: `lib/wallet/__tests__/amounts.test.ts`
- Create: `lib/wallet/__tests__/withdrawal-contract.test.ts`

**Interfaces:**

```ts
export type WalletBucket = 'topup' | 'earnings' | 'pending_earnings' | 'reserved_earnings';
export type WalletAllocation = { topupSen: number; earningsSen: number };
export function toSen(amountRm: string | number): number | null;
export function fromSen(amountSen: number): number;
export function allocateWalletSpend(topupSen: number, earningsSen: number, totalSen: number): WalletAllocation | null;
```

- [ ] **Step 1: Write failing allocation tests.**

```ts
import { describe, expect, it } from 'vitest';
import { allocateWalletSpend, toSen } from '../amounts';

describe('allocateWalletSpend', () => {
  it('uses top-up before earnings', () => {
    expect(allocateWalletSpend(1_000, 2_000, 1_500)).toEqual({ topupSen: 1_000, earningsSen: 500 });
  });
  it('refuses an insufficient combined balance', () => {
    expect(allocateWalletSpend(300, 400, 701)).toBeNull();
  });
  it('accepts only two-decimal positive MYR amounts', () => {
    expect(toSen('50.01')).toBe(5_001);
    expect(toSen('0')).toBeNull();
    expect(toSen('50.001')).toBeNull();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails.**

Run: `npm test -- lib/wallet/__tests__/amounts.test.ts`

Expected: FAIL because `../amounts` does not exist.

- [ ] **Step 3: Implement the minimal integer-sen helpers.**

```ts
export function allocateWalletSpend(topupSen: number, earningsSen: number, totalSen: number) {
  if (!Number.isSafeInteger(totalSen) || totalSen <= 0 || topupSen + earningsSen < totalSen) return null;
  const topupSpend = Math.min(topupSen, totalSen);
  return { topupSen: topupSpend, earningsSen: totalSen - topupSpend };
}
```

`toSen` must reject exponent notation, more than two decimals, non-finite values and values `<= 0`; it must never round a third decimal.

- [ ] **Step 4: Add contract tests for non-negotiable state names.**

```ts
it('exposes only the agreed active withdrawal statuses', () => {
  expect(ACTIVE_WITHDRAWAL_STATUSES).toEqual(['pending', 'pending_second_approval', 'approved', 'processing', 'hold', 'overdue']);
});
```

- [ ] **Step 5: Run focused tests.**

Run: `npm test -- lib/wallet/__tests__/amounts.test.ts lib/wallet/__tests__/withdrawal-contract.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add lib/wallet/types.ts lib/wallet/amounts.ts lib/wallet/__tests__
git commit -m "test: define wallet money contracts"
```

### Task 2: Add the backward-compatible wallet and governance migration

**Files:**
- Create: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Create: `supabase/tests/wallet_withdrawal_governance.sql`

**Consumes:** `WalletBucket` and active-state contract from Task 1.

**Produces:** `reserved_earnings_sen`, `withdrawn_earnings_sen`, Wallet keys in existing `platform_settings`, `wallet_adjustments`, `withdrawal_risk_assessments`, `monthly_payout_reports`, and the RPCs used by later tasks.

- [ ] **Step 1: Write a failing SQL regression test for safe migration backfill.**

```sql
SELECT plan(6);
SELECT is((SELECT reserved_earnings_sen FROM wallets WHERE user_id = '...'), 5000::bigint,
  'existing pending RM50 request becomes reserved without a second earnings debit');
SELECT is((SELECT earnings_sen FROM wallets WHERE user_id = '...'), 10000::bigint,
  'existing spendable earnings are preserved');
SELECT ok((SELECT value = '7' FROM wallet_settings WHERE key = 'wallet.clearance_days'),
  'default clearance exists');
```

- [ ] **Step 2: Run the database regression against a disposable Supabase project.**

Run: `npx supabase test db --file supabase/tests/wallet_withdrawal_governance.sql`

Expected: FAIL because migration `073` has not been applied.

- [ ] **Step 3: Implement additive schema and backfill.**

The migration must:

```sql
ALTER TABLE public.wallets
  ADD COLUMN IF NOT EXISTS reserved_earnings_sen BIGINT NOT NULL DEFAULT 0 CHECK (reserved_earnings_sen >= 0),
  ADD COLUMN IF NOT EXISTS withdrawn_earnings_sen BIGINT NOT NULL DEFAULT 0 CHECK (withdrawn_earnings_sen >= 0);

UPDATE public.wallets w
SET reserved_earnings_sen = COALESCE(active.total_sen, 0)
FROM (
  SELECT wallet_id, SUM(round(amount * 100))::BIGINT AS total_sen
  FROM public.withdrawal_requests
  WHERE status IN ('pending', 'approved', 'processing')
  GROUP BY wallet_id
) active
WHERE active.wallet_id = w.id AND w.reserved_earnings_sen = 0;
```

Replace the existing withdrawal status CHECK with the additive state machine:

```sql
CHECK (status IN (
  'pending', 'pending_second_approval', 'approved', 'processing',
  'hold', 'overdue', 'rejected', 'paid', 'completed', 'failed'
));
```

`pending_second_approval` is used after the first approval of a dual-approval request; `overdue` retains the previous operational state in a new `overdue_from_status` column so it can still be held, rejected or approved correctly.

Use `INSERT ... ON CONFLICT` for settings, with defaults:

```sql
('wallet.clearance_days', '7'),
('withdrawal.min_amount_sen', '5000'),
('withdrawal.dual_approval_threshold_sen', '50000'),
('withdrawal.escalation_hours', '48'),
('withdrawal.hold_escalation_hours', '168')
```

Add range checks in each setter RPC: clearance `1..30`, minimum `>=100`, dual threshold `>=0`, escalation `24..168` and hold escalation `24..720`.

- [ ] **Step 4: Define append-only transaction semantics.**

Extend the `wallet_transactions` type/bucket constraints to accept exactly these additions:

```sql
-- topup / earnings debit for checkout
('spend', 'topup'), ('spend', 'earnings'),
-- full refund to the original Wallet payment buckets
('refund', 'topup'), ('refund', 'earnings'),
-- Super Admin correction only
('adjustment_credit', 'topup'), ('adjustment_credit', 'earnings'),
('adjustment_debit', 'topup'), ('adjustment_debit', 'earnings'),
-- withdrawal reserve/release/complete remains earnings-only
('withdrawal_reserve', 'earnings'), ('withdrawal_cancel', 'earnings'), ('withdrawal_complete', 'earnings')
```

Add `order_id UUID NULL REFERENCES orders(id)` and `idempotency_key TEXT NULL`; add unique index `(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL`.

- [ ] **Step 5: Add governance tables and immutable RLS.**

```sql
CREATE TABLE public.withdrawal_risk_assessments (
  withdrawal_id UUID PRIMARY KEY REFERENCES public.withdrawal_requests(id) ON DELETE CASCADE,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','review','high')),
  snapshot JSONB NOT NULL,
  overridden_by UUID REFERENCES public.users(id),
  override_reason TEXT,
  assessed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  overridden_at TIMESTAMPTZ
);

CREATE TABLE public.monthly_payout_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  period_start DATE NOT NULL UNIQUE,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kuala_Lumpur',
  summary JSONB NOT NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  generated_by TEXT NOT NULL CHECK (generated_by IN ('scheduler','super_admin'))
);
```

Enable RLS. Customer can read only their own transaction/request/receipt data; Wallet Approver can read withdrawal review data; Super Admin can read reports/settings/adjustments. No `UPDATE` or `DELETE` policy is granted on ledger, risk assessments, audit logs or monthly reports.

- [ ] **Step 6: Run the database regression and schema reload.**

Run: `npx supabase test db --file supabase/tests/wallet_withdrawal_governance.sql`

Expected: PASS.

Then execute in Supabase SQL Editor after deployment:

```sql
NOTIFY pgrst, 'reload schema';
```

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql supabase/tests/wallet_withdrawal_governance.sql
git commit -m "feat: add governed wallet schema"
```

### Task 3: Implement atomic Wallet checkout and insufficient-balance recovery

**Files:**
- Modify: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Modify: `app/api/checkout/finalize/route.ts`
- Modify: `app/customer/checkout/page.tsx`
- Create: `app/api/checkout/__tests__/wallet-finalize.test.ts`
- Create: `tests/e2e/wallet-checkout.spec.ts`

**Consumes:** `allocateWalletSpend()` from Task 1 and `wallet_transactions` schema from Task 2.

**Produces:** Wallet-only checkout settlement that never trusts a browser total and never performs a split payment.

- [ ] **Step 1: Write a failing route/RPC contract test.**

```ts
it('settles a wallet checkout using top-up before earnings', async () => {
  rpc.mockResolvedValue({ data: { order_id: 'order-1', status: 'paid' }, error: null });
  const response = await POST(makeRequest({ checkoutSessionId: 'session-1', outcome: 'succeeded' }));
  expect(rpc).toHaveBeenCalledWith('finalize_checkout', expect.objectContaining({ p_checkout_session_id: 'session-1' }));
  expect(response.status).toBe(200);
});

it('returns WALLET_INSUFFICIENT rather than creating a partial debit', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'wallet_insufficient' } });
  expect((await POST(makeRequest({ checkoutSessionId: 'session-1', outcome: 'succeeded' }))).status).toBe(409);
});
```

- [ ] **Step 2: Run the focused test and verify failure.**

Run: `npm test -- app/api/checkout/__tests__/wallet-finalize.test.ts`

Expected: FAIL because wallet-specific error mapping and settlement do not exist.

- [ ] **Step 3: Add the Wallet branch to `finalize_checkout`.**

Inside the existing `SECURITY DEFINER` function, when `checkout_sessions.payment_method = 'wallet'` and `p_outcome = 'succeeded'`:

```sql
SELECT * INTO v_wallet FROM public.wallets WHERE user_id = v_session.user_id FOR UPDATE;
v_total_sen := round(v_session.total_amount * 100)::BIGINT;
IF v_wallet.topup_sen + v_wallet.earnings_sen < v_total_sen THEN
  RAISE EXCEPTION 'wallet_insufficient';
END IF;
v_topup_sen := LEAST(v_wallet.topup_sen, v_total_sen);
v_earnings_sen := v_total_sen - v_topup_sen;
UPDATE public.wallets
SET topup_sen = topup_sen - v_topup_sen,
    earnings_sen = earnings_sen - v_earnings_sen,
    updated_at = now()
WHERE id = v_wallet.id;
```

Insert one `spend` row per non-zero bucket with `order_id`, `checkout_session_id` reference, and deterministic idempotency keys `wallet-spend:{session}:topup` / `wallet-spend:{session}:earnings`; then mark payment/order/session paid in the same transaction. Any failure rolls back reservation finalization and both debit rows.

- [ ] **Step 4: Map the error and improve the checkout UX.**

In `app/customer/checkout/page.tsx`, disable the Wallet choice when the server-provided spendable amount is less than total. If server still rejects due to a race, show:

```ts
'Wallet balance is no longer sufficient. Top up your Wallet or pay by card.'
```

Render two explicit actions: link to `/customer/wallet?topup=1` and selection of `stripe_card`. Do not render a Wallet+Card amount split control.

- [ ] **Step 5: Add browser coverage.**

```ts
test('wallet payment drains top-up before earnings and does not offer a split payment', async ({ page }) => {
  await signInAs(page, 'wallet-customer');
  await addPurchasableItem(page);
  await page.getByRole('button', { name: 'MyWisata Wallet Balance' }).click();
  await page.getByRole('button', { name: /Pay RM/ }).click();
  await expect(page).toHaveURL(/\/customer\/orders\//);
  await expect(page.getByText('Split payment')).toHaveCount(0);
});
```

- [ ] **Step 6: Run focused verification.**

Run: `npm test -- app/api/checkout/__tests__/wallet-finalize.test.ts && npx playwright test tests/e2e/wallet-checkout.spec.ts`

Expected: all focused tests pass.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql app/api/checkout/finalize/route.ts app/customer/checkout/page.tsx app/api/checkout/__tests__ tests/e2e/wallet-checkout.spec.ts
git commit -m "feat: settle checkout from wallet balance"
```

### Task 4: Implement full refunds and Super-Admin Wallet adjustments

**Files:**
- Modify: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Modify: `app/api/orders/[orderId]/refund/route.ts`
- Modify: `app/api/admin/refunds/[refundId]/route.ts`
- Create: `app/api/admin/wallet-adjustments/route.ts`
- Create: `app/api/admin/wallet-adjustments/__tests__/route.test.ts`
- Create: `app/admin/wallet/page.tsx`

**Consumes:** append-only transaction types from Task 2 and Gemini `moderateAccountText()`.

**Produces:** full-only refund settlement and auditable Super Admin adjustment controls.

- [ ] **Step 1: Write failing tests for refund routing and adjustment moderation.**

```ts
it('requires a clean 10-character reason before a Wallet adjustment RPC', async () => {
  await expect(postAdjustment({ amountRm: 20, reason: 'short' })).rejects.toThrow('Reason must be at least 10 characters');
  expect(moderateAccountText).not.toHaveBeenCalled();
});

it('rejects flagged adjustment text and does not call the mutation RPC', async () => {
  moderateAccountText.mockResolvedValue({ flagged: true, categories: ['harassment'] });
  const response = await POST(makeAdjustmentRequest('offensive content here'));
  expect(response.status).toBe(422);
  expect(rpc).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run focused tests to verify failure.**

Run: `npm test -- app/api/admin/wallet-adjustments/__tests__/route.test.ts`

Expected: FAIL because route/RPC does not exist.

- [ ] **Step 3: Add database RPCs.**

Implement `admin_adjust_wallet(p_user_id UUID, p_bucket TEXT, p_direction TEXT, p_amount_sen BIGINT, p_reason TEXT)` and `process_wallet_refund(p_refund_id UUID, p_note TEXT)`. Both must verify role server-side, lock rows, prohibit negative balances, insert append-only transactions, write audit before/after data, and insert Customer notification in the same transaction.

For a Wallet-paid order, `process_wallet_refund` reads the original `spend` rows by `order_id` and credits the exact original buckets; it does not credit an arbitrary current preferred bucket. For Stripe orders retain `stripe.refunds.create`, then mark refund/order/payment only after Stripe succeeds. Reject any partial-refund amount: `refund.amount` must equal `orders.total_amount`.

- [ ] **Step 4: Add server route and Admin page.**

```ts
const moderation = await moderateAccountText(reason, 'wallet_adjustment_reason');
if ('error' in moderation) return apiFail('MODERATION_UNAVAILABLE', 'Reason review is temporarily unavailable. Try again later.', 503);
if (moderation.flagged) return apiFail('CONTENT_REJECTED', 'Reason contains prohibited content.', 422);
```

Extend `AccountModerationContext` with `wallet_adjustment_reason`, `withdrawal_reject_reason`, `withdrawal_hold_reason`, `withdrawal_fraud_override_reason`, and `wallet_approver_role_change_reason`.

`app/admin/wallet/page.tsx` is Super-Admin-only. It selects Customer, bucket, credit/debit, RM amount and reason; it shows the resulting immutable transaction ID, never an editable ledger table.

- [ ] **Step 5: Add Customer notification/email events.**

Extend `TransactionEmailType` with `wallet_payment_succeeded`, `wallet_refund_completed`, and `wallet_adjustment_completed`; enqueue only after the relevant atomic RPC/Stripe action succeeds.

- [ ] **Step 6: Run focused tests.**

Run: `npm test -- app/api/admin/wallet-adjustments/__tests__/route.test.ts lib/email/__tests__`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql app/api/orders app/api/admin/refunds app/api/admin/wallet-adjustments app/admin/wallet lib/moderation.ts lib/email
git commit -m "feat: add wallet refunds and adjustments"
```

### Task 5: Add the customer Wallet history, balances and receipt detail

**Files:**
- Create: `app/api/wallet/summary/route.ts`
- Create: `app/api/wallet/transactions/route.ts`
- Create: `app/customer/wallet/transactions/[id]/page.tsx`
- Modify: `app/customer/wallet/page.tsx`
- Create: `app/customer/wallet/__tests__/summary.test.tsx`

**Consumes:** Task 2 wallet projections and transaction types.

**Produces:** Customer-safe balance summary and paginated immutable history.

- [ ] **Step 1: Write failing component/API tests.**

```tsx
it('shows all agreed balance labels without treating withdrawn total as spendable', async () => {
  render(<WalletSummary summary={{ topupSen: 1000, earningsSen: 2000, pendingSen: 300, reservedSen: 500, withdrawnSen: 900 }} />);
  expect(screen.getByText('Top-up balance')).toBeVisible();
  expect(screen.getByText('Available earnings')).toBeVisible();
  expect(screen.getByText('Pending rewards')).toBeVisible();
  expect(screen.getByText('Reserved for withdrawal')).toBeVisible();
  expect(screen.getByText('Withdrawn total')).toBeVisible();
});
```

- [ ] **Step 2: Run the test to verify failure.**

Run: `npm test -- app/customer/wallet/__tests__/summary.test.tsx`

Expected: FAIL because the summary/receipt interfaces do not exist.

- [ ] **Step 3: Implement read-only summary and history routes.**

`GET /api/wallet/summary` returns current authenticated user only:

```ts
type WalletSummary = {
  topupSen: number; earningsSen: number; pendingSen: number;
  reservedSen: number; withdrawnSen: number; spendableSen: number; withdrawableSen: number;
};
```

`GET /api/wallet/transactions?page=1&pageSize=20&type=...` accepts page sizes `20|50`, uses user ownership in SQL/RLS, returns date/type/bucket/direction/status/reference/displayReason only, and never returns another user’s rows.

- [ ] **Step 4: Replace local client arithmetic in Wallet page.**

Use the summary API, display the five agreed labels, and use server `withdrawableSen` for the withdrawal hint. List transaction type, credit/debit, bucket, status, reference and reason with pagination. Link withdrawal entries to `/customer/wallet/transactions/[id]` where the Customer can print the receipt containing request ID, masked destination, timeline, Stripe payout reference and customer-visible reason.

- [ ] **Step 5: Run focused tests.**

Run: `npm test -- app/customer/wallet/__tests__/summary.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add app/api/wallet app/customer/wallet
git commit -m "feat: show wallet balances and receipts"
```

### Task 6: Make withdrawal submission atomic, risk-aware and server-notified

**Files:**
- Modify: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Create: `app/api/wallet/withdrawals/route.ts`
- Modify: `backend/domains/commerce.ts`
- Modify: `app/customer/wallet/page.tsx`
- Create: `lib/wallet/withdrawal-email.ts`
- Create: `app/api/wallet/withdrawals/__tests__/route.test.ts`

**Consumes:** Task 2 schema, existing KYC/Stripe status, `affiliate_fraud_flags`, email outbox.

**Produces:** one active request maximum, real reserved balance, risk snapshot, approver notifications and customer submitted notification.

- [ ] **Step 1: Write failing request-route tests.**

```ts
it('does not allow a browser caller to choose another user id', async () => {
  const response = await POST(makeRequest({ amountRm: 50, userId: 'victim-id' }));
  expect(response.status).toBe(400);
});

it('fans out submitted notifications to active approvers and super admins once', async () => {
  await POST(makeRequest({ amountRm: 50 }));
  expect(enqueueWithdrawalReviewEmails).toHaveBeenCalledWith(expect.objectContaining({ eventType: 'withdrawal_submitted' }));
});
```

- [ ] **Step 2: Run focused tests to verify failure.**

Run: `npm test -- app/api/wallet/withdrawals/__tests__/route.test.ts`

Expected: FAIL because the protected submission route does not exist.

- [ ] **Step 3: Implement `submit_wallet_withdrawal` in SQL.**

The RPC receives only `p_amount_sen`; identity is `auth.uid()`. It must:

1. lock `users` and `wallets` with `FOR UPDATE`;
2. require `tier='kyc_verified'`, `kyc_status='approved'`, Connect account and `stripe_payouts_enabled=true`;
3. enforce configured minimum and one active request (`pending`, `pending_second_approval`, `approved`, `processing`, `hold`, `overdue`);
4. deduct `earnings_sen`, add `reserved_earnings_sen`, insert `withdrawal_reserve` transaction and create request with the configured dual flag;
5. calculate and persist the factual risk snapshot: KYC state, payouts state, dual threshold, active request count, unresolved affiliate fraud count and last-30-day failed/rejected count;
6. assign risk level `high` only if unresolved critical fraud flags exist, `review` for non-critical flags/recent failures, otherwise `low`;
7. create one in-app notification per active Wallet Approver/Super Admin and one for Customer; and
8. return `{ requestId, requiresDualApproval, riskLevel, destinationLabel }`.

Revoke `authenticated` execution on legacy `debit_withdrawal`; make it a private compatibility wrapper only if another existing server route still requires it.

- [ ] **Step 4: Implement server route/email fan-out.**

```ts
const { data: result, error } = await db.rpc('submit_wallet_withdrawal', { p_amount_sen: amountSen });
if (error) return mapWithdrawalError(error.message);
await enqueueWithdrawalReviewEmails({ withdrawalId: result.requestId, eventType: 'withdrawal_submitted' });
return NextResponse.json({ data: result }, { status: 201 });
```

`enqueueWithdrawalReviewEmails` queries active Wallet Approver/Super Admin recipients using the service client, excludes duplicates by user ID, creates unique outbox keys `withdrawal_submitted:{request}:{recipient}`, and sends Customer receipt email separately.

- [ ] **Step 5: Replace the browser Supabase RPC call.**

`requestWithdrawal` calls `POST /api/wallet/withdrawals` with `{ amountRm }`; it no longer accepts/passses a user ID and no longer invokes `/api/withdrawals/email` itself. The Wallet page refreshes its summary from the server response rather than subtracting an optimistic floating-point amount.

- [ ] **Step 6: Run focused tests.**

Run: `npm test -- app/api/wallet/withdrawals/__tests__/route.test.ts backend/domains/__tests__/wallet-buckets.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql app/api/wallet/withdrawals backend/domains/commerce.ts app/customer/wallet/page.tsx lib/wallet/withdrawal-email.ts
git commit -m "feat: submit risk-aware withdrawal requests"
```

### Task 7: Build the notification centre and place Bell before Cart

**Files:**
- Create: `components/customer/notification-menu.tsx`
- Create: `app/api/notifications/route.ts`
- Create: `app/api/notifications/[id]/read/route.ts`
- Modify: `app/customer/layout.tsx`
- Create: `components/customer/__tests__/notification-menu.test.tsx`

**Consumes:** existing `notifications` table and Task 6 fan-out notifications.

**Produces:** accessible unread Bell, immediately left of Cart, with safe per-user notification reads.

- [ ] **Step 1: Write a failing layout test.**

```tsx
it('renders the notification Bell immediately before Cart with independent badges', () => {
  render(<CustomerNav unreadNotifications={3} cartCount={5} />);
  expect(screen.getByLabelText('Notifications').compareDocumentPosition(screen.getByLabelText('Cart')))
    .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  expect(screen.getByText('3')).toBeVisible();
  expect(screen.getByText('5')).toBeVisible();
});
```

- [ ] **Step 2: Run the focused test to verify failure.**

Run: `npm test -- components/customer/__tests__/notification-menu.test.tsx`

Expected: FAIL because `NotificationMenu` does not exist.

- [ ] **Step 3: Add secure notification APIs.**

`GET /api/notifications?limit=20` authenticates, returns only own newest notifications and unread count. `POST /api/notifications/:id/read` updates only `auth.uid()`’s row. Do not create a general client notification insert API.

- [ ] **Step 4: Implement `NotificationMenu`.**

Use `Bell` from `lucide-react`, a `button aria-label="Notifications"`, unread badge, keyboard-accessible popover, mark-as-read on open/click, and deep links. Insert it immediately before each `ShoppingCart` link in both nav breakpoints in `app/customer/layout.tsx`.

- [ ] **Step 5: Run focused verification.**

Run: `npm test -- components/customer/__tests__/notification-menu.test.tsx`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add components/customer app/api/notifications app/customer/layout.tsx
git commit -m "feat: add customer notification centre"
```

### Task 8: Add secure Approve, Reject, Hold and fraud-override state transitions

**Files:**
- Modify: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Modify: `app/api/admin/withdrawals/[id]/approve/route.ts`
- Modify: `app/api/admin/withdrawals/[id]/reject/route.ts`
- Create: `app/api/admin/withdrawals/[id]/hold/route.ts`
- Create: `app/api/admin/withdrawals/[id]/fraud-override/route.ts`
- Modify: `lib/moderation.ts`
- Create: `lib/wallet/request-ip.ts`
- Create: `app/api/admin/withdrawals/__tests__/decision-routes.test.ts`

**Consumes:** Task 2 governance schema, Task 6 risk snapshot and the existing Stripe idempotency implementation.

**Produces:** moderated withdrawal decisions with atomic audit/notification and reliable client errors.

- [ ] **Step 1: Write failing decision tests.**

```ts
it('rejects a missing rejection reason before mutation', async () => {
  const response = await rejectRoute(makeRequest({}));
  expect(response.status).toBe(422);
  expect(rpc).not.toHaveBeenCalled();
});

it('blocks approval of high-risk request until a Super Admin override exists', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'fraud_override_required' } });
  expect((await approveRoute(makeRequest({ note: 'Looks valid today.' }))).status).toBe(409);
});
```

- [ ] **Step 2: Run test to verify failure.**

Run: `npm test -- app/api/admin/withdrawals/__tests__/decision-routes.test.ts`

Expected: FAIL because Hold/override routes and validation do not exist.

- [ ] **Step 3: Implement database decision RPCs.**

Create `approve_wallet_withdrawal(p_id, p_note, p_ip)`, `reject_wallet_withdrawal(p_id, p_reason, p_ip)`, `hold_wallet_withdrawal(p_id, p_reason, p_ip)`, and `override_withdrawal_fraud(p_id, p_reason, p_ip)`. Each RPC must use `auth.uid()`, role-check, lock the request, forbid self-dealing and duplicate approvals, write `withdrawal_approvals`, write immutable audit data with before/after/note/IP, and create Customer notification in its transaction.

Rules:

```text
approve: Wallet Approver/Super Admin; optional note >=10 if non-empty; high risk requires Super Admin override; second distinct approval required at configured threshold.
reject: Wallet Approver/Super Admin; reason >=10; release reserved -> earnings exactly once; status rejected.
hold: Wallet Approver/Super Admin; reason >=10; keep reserved; status hold; no Stripe call.
override: Super Admin only; reason >=10; records override actor/time/reason; does not itself approve.
```

Update the `record_audit_and_notify` RPC signature to take `p_ip_address INET DEFAULT NULL` and write it. Do not use `backend/core/audit.ts`: it writes from a browser client and is blocked by RLS. Remove its use from withdrawal UI.

- [ ] **Step 4: Implement IP and moderation at server boundary.**

```ts
export function requestIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  return forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip') || null;
}
```

Routes call `moderateAccountText` before a reason mutation and fail closed with 503 when Gemini is unavailable. They pass only the server-observed IP to the RPC. Never trust an IP body field.

- [ ] **Step 5: Preserve Stripe sequence.**

After `approve_wallet_withdrawal` returns `ready: true`, retain the existing deterministic Stripe Transfer/Payout keys. Change `admin_set_processing` into an audited RPC that accepts only `approved` state. On Stripe immediate errors leave `approved` retry-safe; do not write a false processing status. Customer gets email/in-app notification only when status changed.

- [ ] **Step 6: Run focused tests.**

Run: `npm test -- app/api/admin/withdrawals/__tests__/decision-routes.test.ts lib/moderation.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql app/api/admin/withdrawals lib/moderation.ts lib/wallet/request-ip.ts
git commit -m "feat: govern withdrawal decisions"
```

### Task 9: Expand the Withdrawal review UI and Customer lifecycle messages

**Files:**
- Modify: `app/admin/withdrawals/page.tsx`
- Create: `components/admin/withdrawal-review-drawer.tsx`
- Create: `components/admin/withdrawal-decision-form.tsx`
- Modify: `lib/email/templates.ts`
- Modify: `lib/email/events.ts`
- Create: `app/admin/withdrawals/__tests__/review-ui.test.tsx`

**Consumes:** Task 6 review/risk data and Task 8 decision routes.

**Produces:** a least-privilege approver view and consistent lifecycle communication.

- [ ] **Step 1: Write failing review drawer tests.**

```tsx
it('shows factual review context but not raw KYC documents', () => {
  render(<WithdrawalReviewDrawer request={fixture} />);
  expect(screen.getByText('KYC approved')).toBeVisible();
  expect(screen.getByText('Reward sources')).toBeVisible();
  expect(screen.queryByText(/passport image/i)).toBeNull();
});

it('requires a reason for Hold and Reject but not Approve', async () => {
  render(<WithdrawalDecisionForm />);
  await user.click(screen.getByRole('button', { name: 'Reject' }));
  expect(screen.getByText('Reason must be at least 10 characters')).toBeVisible();
});
```

- [ ] **Step 2: Run focused test to verify failure.**

Run: `npm test -- app/admin/withdrawals/__tests__/review-ui.test.tsx`

Expected: FAIL because review drawer/forms do not exist.

- [ ] **Step 3: Add review endpoint/data contract.**

Create an authenticated `GET /api/admin/withdrawals/:id` returning: Customer display name/email, KYC status/submission date/document type (not raw files), masked Stripe destination, wallet summary, last 20 wallet transactions, reward/affiliate source totals, recent order/withdrawal history, factual risk snapshot and current approval history.

- [ ] **Step 4: Replace the list-only Admin UI.**

Keep list rows compact. On click, open the drawer and render low/review/high risk badge, timeline, source totals, dual approval count and appropriate actions. Add optional Approve note; required Hold/Reject reason text area; high-risk requests show an override action only to Super Admin. Disable actions while request is mutated and refetch after success.

- [ ] **Step 5: Complete Customer messages.**

Render Customer email templates for `withdrawal_submitted`, `withdrawal_approved`, `withdrawal_hold`, `withdrawal_rejected`, `withdrawal_paid`, `withdrawal_failed`; each contains amount, reference and MYT time. Rejection/Hold emails use the customer-visible reason. Internal approve notes and fraud rule details never leave the Admin view.

- [ ] **Step 6: Run focused tests.**

Run: `npm test -- app/admin/withdrawals/__tests__/review-ui.test.tsx lib/email/__tests__`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add app/admin/withdrawals components/admin/withdrawal-* lib/email
git commit -m "feat: add governed withdrawal review UI"
```

### Task 10: Add Wallet Approver assignment and Wallet settings

**Files:**
- Modify: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Create: `app/api/admin/wallet-approvers/route.ts`
- Create: `app/api/admin/wallet-settings/route.ts`
- Modify: `app/admin/users/page.tsx`
- Modify: `components/admin/user-management-drawer.tsx`
- Create: `app/admin/wallet/settings/page.tsx`
- Create: `app/api/admin/__tests__/wallet-governance.test.ts`

**Consumes:** Task 2 settings and role schema, Task 8 audit/moderation patterns.

**Produces:** Super-Admin-only management controls without granting unrelated Admin access.

- [ ] **Step 1: Write failing authorization tests.**

```ts
it('rejects approver role assignment by a Wallet Approver', async () => {
  authAs('approver');
  expect((await POST(makeRoleRequest())).status).toBe(403);
});
it('prevents removing the final active Wallet Approver', async () => {
  rpc.mockResolvedValue({ data: null, error: { message: 'last_wallet_approver' } });
  expect((await DELETE(makeRoleRequest())).status).toBe(409);
});
```

- [ ] **Step 2: Run focused test to verify failure.**

Run: `npm test -- app/api/admin/__tests__/wallet-governance.test.ts`

Expected: FAIL because APIs do not exist.

- [ ] **Step 3: Add Super-Admin RPCs.**

Implement `set_wallet_approver(p_user_id, p_enabled, p_reason, p_ip)` and `update_wallet_settings(p_clearance_days, p_min_amount_sen, p_dual_threshold_sen, p_escalation_hours, p_hold_escalation_hours, p_reason, p_ip)`. `set_wallet_approver` assigns/removes the existing `roles.name = 'approver'` relation; it does not create a second role. Both RPCs must reject self-assignment/removal, protected privileged targets where appropriate, removal of final active approver, invalid settings and short reasons; then audit/notify atomically.

- [ ] **Step 4: Add focused UI actions.**

In User Management, add a Wallet Approver panel only when current user is Super Admin. Do not expose KYC/Catalogue/User Management navigation to assigned approvers. Add `/admin/wallet/settings` with numeric range hints, current values, reason field and explicit save result.

- [ ] **Step 5: Run focused tests.**

Run: `npm test -- app/api/admin/__tests__/wallet-governance.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql app/api/admin/wallet-approvers app/api/admin/wallet-settings app/admin/users components/admin/user-management-drawer.tsx app/admin/wallet
git commit -m "feat: manage wallet approvers and settings"
```

### Task 11: Add idempotent maintenance, escalation and monthly reports

**Files:**
- Modify: `supabase/migrations/073_wallet_withdrawal_governance.sql`
- Create: `app/api/internal/wallet-maintenance/route.ts`
- Create: `lib/wallet/maintenance.ts`
- Create: `app/admin/reports/payouts/page.tsx`
- Create: `app/api/admin/payout-reports/route.ts`
- Create: `vercel.json`
- Create: `lib/wallet/__tests__/maintenance.test.ts`

**Consumes:** settings, risk, report tables and recommendation/affiliate clearing functions.

**Produces:** hourly safe jobs, MYT overdue escalation and immutable monthly snapshots.

- [ ] **Step 1: Write failing maintenance tests.**

```ts
it('marks a pending request overdue after configured hours without releasing money', async () => {
  const result = await runWalletMaintenance({ now: new Date('2026-07-20T10:00:00+08:00') });
  expect(result.overdueMarked).toBe(1);
  expect(result.reservedReleased).toBe(0);
});

it('writes one MYT monthly snapshot even when invoked twice', async () => {
  await runWalletMaintenance({ now: new Date('2026-08-01T01:00:00+08:00') });
  await runWalletMaintenance({ now: new Date('2026-08-01T02:00:00+08:00') });
  expect(insertMonthlyReport).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run focused test to verify failure.**

Run: `npm test -- lib/wallet/__tests__/maintenance.test.ts`

Expected: FAIL because maintenance service does not exist.

- [ ] **Step 3: Add database maintenance RPCs.**

Implement `run_wallet_maintenance(p_now TIMESTAMPTZ DEFAULT now())` service-role-only. It must clear mature rewards using the configured clearance window, mark stale `pending` requests `overdue` after `withdrawal.escalation_hours`, mark stale `hold` requests overdue after `withdrawal.hold_escalation_hours`, create escalation notifications once per request/status, and generate a unique report for the previous MYT calendar month on the first MYT day.

Monthly summary JSON must include requested/approved/rejected/paid/failed/pending amounts, payout fees where Stripe exposes them, and breakdowns by Customer, date and reward source. Never update an existing report snapshot.

- [ ] **Step 4: Add CRON-protected route and schedule.**

```ts
if (request.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

```json
{ "crons": [{ "path": "/api/internal/wallet-maintenance", "schedule": "0 * * * *" }] }
```

The job checks MYT inside the RPC; UTC scheduler timing never determines the report period. Document required `CRON_SECRET` in `.env.example` if that file exists; otherwise add a commented entry to `README.md` without putting secrets in version control.

- [ ] **Step 5: Add report UI/CSV.**

Super Admin page fetches only stored snapshots, filters by period/customer/source, and exports the filtered data as client-generated CSV. No regular Admin/Approver route can access this endpoint.

- [ ] **Step 6: Run focused tests.**

Run: `npm test -- lib/wallet/__tests__/maintenance.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add supabase/migrations/073_wallet_withdrawal_governance.sql app/api/internal/wallet-maintenance app/api/admin/payout-reports app/admin/reports/payouts lib/wallet vercel.json README.md
git commit -m "feat: automate wallet governance reporting"
```

### Task 12: Run integration, remote database and user-facing acceptance tests

**Files:**
- Create: `scripts/verify-wallet-withdrawal-governance.mjs`
- Create: `tests/e2e/wallet-withdrawal-governance.spec.ts`
- Modify: `README.md`

**Consumes:** all earlier tasks.

**Produces:** repeatable proof that the complete financial workflow works against a configured test project.

- [ ] **Step 1: Write the remote verifier with explicit scenarios.**

```js
const scenarios = [
  'new auth user gets one wallet',
  'wallet checkout drains topup then earnings and rejects insufficient funds',
  'wallet-paid order full refund restores original buckets once',
  'withdrawal reserves money once and requires KYC plus Stripe payout enablement',
  'high-risk withdrawal cannot approve before Super Admin override',
  'RM500 request needs two distinct approvers',
  'reject and payout.failed release reserved exactly once',
  'payout.paid writes a complete transaction and receipt data',
  'ordinary admin cannot mutate audit/report/settings/ledger',
  'maintenance marks stale request overdue and generates one MYT report'
];
```

- [ ] **Step 2: Add Playwright user flows.**

Cover Customer Wallet payment, insufficient Wallet recovery, withdrawal submission, Bell-before-Cart, Customer receipt email/outbox assertion, Wallet Approver Hold/Reject/Approve, Super Admin override/settings/report, and no raw KYC image in withdrawal review.

- [ ] **Step 3: Run focused verification.**

```bash
npm test -- --run
npx tsc --noEmit
npx playwright test tests/e2e/wallet-checkout.spec.ts tests/e2e/wallet-withdrawal-governance.spec.ts
node scripts/verify-wallet-withdrawal-governance.mjs
```

Expected: zero test failures; remote verifier prints one PASS line per scenario. If a remote migration/RPC is absent, stop and report that deployment gap rather than marking the feature complete.

- [ ] **Step 4: Update README with exact local/remote testing prerequisites.**

Document the required server-only variables: Supabase URL/key/service role, Stripe test keys/webhook secret, Gmail SMTP variables, Google AI key/model and `CRON_SECRET`. Do not print values.

- [ ] **Step 5: Commit.**

```bash
git add scripts/verify-wallet-withdrawal-governance.mjs tests/e2e/wallet-withdrawal-governance.spec.ts README.md
git commit -m "test: verify wallet withdrawal governance"
```

## Spec Coverage Self-Review

- Wallet for every registered Customer: Task 2 verifies and preserves the auth trigger contract.
- Top-up-first Wallet payment without split payment: Task 3.
- Pending/available/reserved/withdrawn balances and configurable clearance: Tasks 2 and 5.
- Full Wallet/Stripe refunds and governed adjustments: Task 4.
- Withdrawal amount, reserve, KYC, Stripe destination, one-active-request and risk summary: Task 6.
- Approver email/in-app fan-out and Bell placement: Tasks 6 and 7.
- KYC status, ledger, reward/affiliate sources, transactions, fraud and destination review context: Task 9.
- Approve note, mandatory Hold/Reject reasons, fraud override, Stripe success/failure and customer receipt: Tasks 8 and 9.
- Wallet Approver assignment, configurable dual threshold, 48-hour escalation, immutable IP audit and monthly reports: Tasks 10 and 11.
- Regression, browser and remote proof: Task 12.

No placeholder markers remain. All money mutations remain in database RPCs; no task authorizes direct browser writes to financial tables.

## Execution Handoff

Plan complete and saved to `Docs/superpowers/plans/2026-07-17-wallet-withdrawal-governance.md`.

Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `executing-plans`, with review checkpoints.
