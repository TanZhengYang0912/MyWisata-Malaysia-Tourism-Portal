# Customer Wallet Signed Transaction History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show customer Wallet ledger entries with explicit signed amounts: credits as normal-colour `+RM`, and checkout/purchase/withdrawal debits as primary-blue `-RM`.

**Architecture:** Reuse the existing `wallet_transactions` read model and keep sign/visibility rules in pure `lib/wallet/transaction-display.ts` helpers. A focused customer transaction-history component renders the ledger, while the existing withdrawal list continues to show only in-progress payout status and receipt navigation. The customer Wallet page loads balances, withdrawal requests, and ledger rows together.

**Tech Stack:** Next.js 16 App Router, React, TypeScript, Supabase domain functions, react-i18next, Vitest, TailwindCSS.

## Global Constraints

- Credit renders as `+RM 50.00` with the existing foreground colour.
- Debit renders as `-RM 50.00` with the existing primary blue.
- `withdrawal_complete` is excluded because `withdrawal_reserve` already represents the customer-visible debit.
- No database schema, ledger-write, Stripe/TNG, checkout, payout-settlement, vendor-Wallet, or dependency changes.
- Preserve locale-aware labels and dates.

---

### Task 1: Define customer ledger display semantics

**Files:**
- Modify: `lib/wallet/transaction-display.ts`
- Test: `lib/wallet/__tests__/transaction-display.test.ts`

**Interfaces:**
- Consumes: `{ type: string; direction: string; amount: number }` ledger-like values.
- Produces: `signedTransactionAmount(transaction): string` and `customerVisibleTransactions(items): T[]`.

- [ ] **Step 1: Write failing helper tests**

Add tests that assert:

```ts
expect(signedTransactionAmount({ type: 'topup', direction: 'credit', amount: 50 })).toBe('+RM 50.00');
expect(signedTransactionAmount({ type: 'spend', direction: 'debit', amount: 12.3 })).toBe('-RM 12.30');

const visible = customerVisibleTransactions([
  { id: 'reserve', type: 'withdrawal_reserve', direction: 'debit', amount: 50 },
  { id: 'complete', type: 'withdrawal_complete', direction: 'debit', amount: 50 },
  { id: 'returned', type: 'withdrawal_cancel', direction: 'credit', amount: 50 },
]);
expect(visible.map((item) => item.id)).toEqual(['reserve', 'returned']);
```

- [ ] **Step 2: Run the test and verify RED**

Run: `npx vitest run lib/wallet/__tests__/transaction-display.test.ts`

Expected: FAIL because `signedTransactionAmount` and `customerVisibleTransactions` are not exported.

- [ ] **Step 3: Implement the minimal pure helpers**

Add:

```ts
type AmountTransactionLike = TransactionLike & { amount: number };

export function signedTransactionAmount(transaction: AmountTransactionLike) {
  const sign = transaction.direction === 'credit' ? '+' : '-';
  return `${sign}RM ${transaction.amount.toFixed(2)}`;
}

export function customerVisibleTransactions<T extends TransactionLike>(items: T[]) {
  return items.filter((item) => item.type !== 'withdrawal_complete');
}
```

- [ ] **Step 4: Run the helper tests and verify GREEN**

Run: `npx vitest run lib/wallet/__tests__/transaction-display.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/wallet/transaction-display.ts lib/wallet/__tests__/transaction-display.test.ts
git commit -m "feat: define signed customer wallet transactions"
```

### Task 2: Render localized signed transaction rows

**Files:**
- Create: `components/customer/wallet/customer-transaction-history.tsx`
- Modify: `components/customer/wallet/withdrawal-list.tsx`
- Modify: `app/i18n/locales/en/customer.json`
- Modify: `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/zh-CN/customer.json`
- Test: `components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts`
- Modify test: `app/customer/wallet/__tests__/withdrawal-row-navigation.test.ts`

**Interfaces:**
- Consumes: `transactions: WalletTransaction[]`.
- Produces: `<CustomerTransactionHistory transactions={transactions} />`.

- [ ] **Step 1: Write failing component contract tests**

Assert the new component source imports and uses both pure helpers, applies
`text-primary` only to debit amounts, and uses `text-foreground` for credit:

```ts
expect(source).toContain('customerVisibleTransactions(transactions)');
expect(source).toContain('signedTransactionAmount(transaction)');
expect(source).toContain('transaction.direction === "debit" ? "text-primary" : "text-foreground"');
expect(source).toContain('t(`ui.wallet.transactionType.${transaction.type}`');
```

Update the withdrawal-row contract to expect one receipt link, because only
in-progress withdrawal rows remain in `WithdrawalList`. Also assert that its
amount is rendered as primary-blue `-RM`.

- [ ] **Step 2: Run component tests and verify RED**

Run: `npx vitest run components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts app/customer/wallet/__tests__/withdrawal-row-navigation.test.ts`

Expected: FAIL because the new component does not exist and the old list still renders historical withdrawals.

- [ ] **Step 3: Add customer transaction translations**

Add `ui.wallet.transactionType` to all three customer locale files, using the
existing vendor-Wallet vocabulary for:

```json
{
  "topup": "Wallet top-up",
  "spend": "Purchase",
  "earnings": "Earnings",
  "withdrawal_reserve": "Withdrawal requested",
  "withdrawal_cancel": "Withdrawal returned",
  "earnings_pending": "Pending earnings",
  "earnings_confirm": "Earnings released",
  "earnings_reverse": "Pending earnings reversed",
  "refund": "Refund",
  "adjustment_credit": "Balance adjustment",
  "adjustment_debit": "Balance adjustment"
}
```

Use the existing Malay and Simplified Chinese equivalents from
`app/i18n/locales/ms/vendor.json` and
`app/i18n/locales/zh-CN/vendor.json`.

- [ ] **Step 4: Implement the focused customer history component**

Render newest-first rows in the received order. For each visible transaction:

```tsx
const visibleTransactions = customerVisibleTransactions(transactions);
const label = t(`ui.wallet.transactionType.${transaction.type}`, {
  defaultValue: transactionLabel(transaction.type),
});
const amountClass = transaction.direction === "debit" ? "text-primary" : "text-foreground";
```

Display `label`, locale-formatted `createdAt`, the signed amount, and a small
direction icon. Use the existing `ui.wallet.transactionHistory` and
`ui.wallet.noTransactions` copy for the section and empty state.

- [ ] **Step 5: Restrict WithdrawalList to in-progress payout rows**

Change the interface to:

```ts
export function WithdrawalList({ pending }: { pending: WithdrawalRequest[] })
```

Keep the existing linked pending rows, render their reserved amount as
`-RM ${w.amount.toFixed(2)}` with `text-primary`, and remove the
completed-history section since completed money movement is now rendered from
the ledger.

- [ ] **Step 6: Run component and locale tests**

Run: `npx vitest run components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts app/customer/wallet/__tests__/withdrawal-row-navigation.test.ts app/customer/__tests__/account-page-alignment.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add components/customer/wallet/customer-transaction-history.tsx components/customer/wallet/withdrawal-list.tsx components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts app/customer/wallet/__tests__/withdrawal-row-navigation.test.ts app/i18n/locales/en/customer.json app/i18n/locales/ms/customer.json app/i18n/locales/zh-CN/customer.json
git commit -m "feat: render signed customer wallet history"
```

### Task 3: Load the complete customer Wallet ledger

**Files:**
- Modify: `app/customer/wallet/page.tsx`
- Test: `app/customer/wallet/__tests__/transaction-history.contract.test.ts`

**Interfaces:**
- Consumes: `getWalletTransactions(userId): Promise<WalletTransaction[]>` and `<CustomerTransactionHistory transactions={transactions} />`.
- Produces: a Wallet page whose refresh path updates balances, withdrawal requests, and ledger rows together.

- [ ] **Step 1: Write the failing Wallet integration contract**

Assert the page imports `getWalletTransactions` and `WalletTransaction`, owns a
`transactions` state, refreshes it alongside withdrawals, clears it for guests,
and renders the new component:

```ts
expect(source).toContain('getWalletTransactions');
expect(source).toContain('useState<WalletTransaction[]>([])');
expect(source).toContain('getWalletTransactions(currentUser.id)');
expect(source).toContain('setTransactions(nextTransactions)');
expect(source).toContain('<CustomerTransactionHistory transactions={transactions} />');
```

- [ ] **Step 2: Run the integration test and verify RED**

Run: `npx vitest run app/customer/wallet/__tests__/transaction-history.contract.test.ts`

Expected: FAIL because the customer Wallet does not load ledger transactions.

- [ ] **Step 3: Integrate ledger loading into `refreshWalletState`**

Import the domain function and type, then add:

```ts
const [transactions, setTransactions] = useState<WalletTransaction[]>([]);

const [, nextWithdrawals, nextTransactions] = await Promise.all([
  refreshWalletSummary(destinationId),
  getMyWithdrawals(currentUser.id),
  getWalletTransactions(currentUser.id),
]);
setWithdrawals(nextWithdrawals);
setTransactions(nextTransactions);
```

Reset `transactions` to `[]` when there is no current user. Replace
`<WithdrawalList pending={pending} history={history} />` with:

```tsx
<WithdrawalList pending={pending} />
<CustomerTransactionHistory transactions={transactions} />
```

Remove `history` from the `getWithdrawalDisplayGroups()` destructuring because
the ledger component now owns completed transaction history.

- [ ] **Step 4: Run affected tests and verify GREEN**

Run:

```bash
npx vitest run app/customer/wallet/__tests__/transaction-history.contract.test.ts lib/wallet/__tests__/transaction-display.test.ts components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts app/customer/wallet/__tests__/withdrawal-row-navigation.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run final verification**

Run:

```bash
npx tsc --noEmit
npx vitest run
npm run lint
git diff --check
```

Expected: typecheck and all tests pass; lint has 0 errors (existing unrelated warnings may remain); diff check is clean.

- [ ] **Step 6: Commit**

```bash
git add app/customer/wallet/page.tsx app/customer/wallet/__tests__/transaction-history.contract.test.ts
git commit -m "feat: load customer wallet transaction ledger"
```

## Files not touched

- `app/vendor/wallet/page.tsx`
- `backend/domains/commerce.ts`
- `supabase/migrations/**`
- Stripe, TNG, checkout, payout, and withdrawal API routes

## New dependencies

None.

## Database changes

None.

## Risks

- Raw ledger entries include an audit-only `withdrawal_complete`; the pure
  visibility helper must exclude it to prevent an apparent double debit.
- Checkout may create one `spend` entry per source bucket. This plan preserves
  ledger-row fidelity rather than aggregating entries; a future grouped-order
  view is intentionally out of scope.
- Unknown future transaction types fall back to the existing humanized label
  while preserving their authoritative `direction` sign.
