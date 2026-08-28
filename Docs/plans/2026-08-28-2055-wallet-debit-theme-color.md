# Wallet Debit Theme Colour

Status: Approved for implementation

## Context

Customer Wallet debit amounts and credit amounts are both readable in light
mode, but the existing `text-primary` debit colour (`#010066`) is visually too
close to the foreground credit colour (`#0f172a`). Dark mode already provides
a clearly distinguishable light blue debit colour (`#7c8bff`).

## Decisions

- Add a dedicated semantic Wallet debit colour instead of changing the global
  primary colour.
- Use `#4f46e5` for light mode and retain `#7c8bff` for dark mode.
- Keep credit amounts on `text-foreground`.
- Apply the token only to debit amounts in `CustomerTransactionHistory`.
- Keep signs, labels, ledger visibility, ordering, icons, dates, and transaction
  data unchanged.

## Implementation Plan

### Phase 1: Lock the desired colour contract

Files:

- Modify `components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts`.

Add assertions that the component uses `text-wallet-debit` for debits and
`text-foreground` for credits, and that `app/globals.css` defines:

- root `--wallet-debit: #4f46e5`
- dark `--wallet-debit: #7c8bff`
- Tailwind mapping `--color-wallet-debit: var(--wallet-debit)`

Run the focused test and confirm it fails before production changes.

### Phase 2: Add and consume the semantic token

Files:

- Modify `app/globals.css` root, `.dark`, and `@theme inline` declarations.
- Modify `components/customer/wallet/customer-transaction-history.tsx`, inside
  `CustomerTransactionHistory`, changing only the debit `amountClass` from
  `text-primary` to `text-wallet-debit`.

Run the focused test and confirm it passes.

### Phase 3: Verify

Run:

- `npx vitest run components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts`
- `npx tsc --noEmit`
- `npm run lint`
- `npx vitest run`
- `git diff --check`

## Scope Boundaries

Files modified:

- `app/globals.css`
- `components/customer/wallet/customer-transaction-history.tsx`
- `components/customer/wallet/__tests__/customer-transaction-history.contract.test.ts`

Files not modified:

- Wallet page data loading and ledger helpers.
- Withdrawal lists and receipts.
- Checkout, orders, payments, Stripe/TNG, APIs, database, migrations, and locale
  files.
- Global `--primary` values.

## Dependencies and Database

- New dependencies: none.
- Database or Supabase changes: none.

## Risks

- Changing global primary would affect unrelated UI; the dedicated token avoids
  that risk.
- A light debit colour could reduce readability; `#4f46e5` preserves strong
  contrast on the white card while remaining visibly different from foreground.
