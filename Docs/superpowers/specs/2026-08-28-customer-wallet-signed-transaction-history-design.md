# Customer Wallet signed transaction history design

## Goal

Make the customer Wallet transaction history communicate money movement at a
glance. Incoming ledger entries display a plus sign. Checkout, purchase, and
withdrawal entries display a minus sign and blue amount text, following the
explicitly confirmed visual rule.

## Source of truth

The history reads `wallet_transactions`, using the existing
`getWalletTransactions()` domain function. The ledger's `direction` determines
the sign:

- `credit` renders as `+RM 50.00`.
- `debit` renders as `-RM 50.00`.

This covers top-ups, refunds, returned money, checkout spending, purchases,
and withdrawal reservations without inferring money movement from translated
labels.

## Presentation

- Credit amounts keep the transaction list's existing foreground colour.
- Debit amounts use the product's primary blue.
- Amounts use the Wallet's existing monospace number style and always show two
  decimal places.
- Rows remain ordered newest first, matching the domain query.
- Transaction labels and dates continue using the selected locale.

## Withdrawal lifecycle

`withdrawal_reserve` is the customer-visible debit because the usable earnings
balance is reduced when the request is submitted. A later
`withdrawal_complete` entry is a settlement audit record and must not appear as
another debit. `withdrawal_cancel` is a credit and therefore appears with a
plus sign when reserved earnings are returned.

The existing withdrawal request list remains responsible for pending payout
status and receipt navigation. Its reserved amount also displays as a
primary-blue `-RM` amount because the spendable earnings have already been
reduced. The ledger history remains responsible for the complete signed money
movement, so a transaction is not duplicated merely to show status.

## Scope

This change affects only the customer Wallet transaction-history data and
presentation. It does not change Wallet balances, ledger writes, checkout,
Stripe/TNG processing, payout settlement, database schema, or the vendor
Wallet.

## Error and empty states

If ledger loading fails, the balance and withdrawal controls remain usable and
the history shows its existing empty/fallback state. No fabricated transaction
rows or amounts are displayed.

## Verification

Tests must prove that:

- credit transactions format with `+` and retain the normal colour tone;
- debit transactions format with `-` and use the primary-blue tone;
- `withdrawal_complete` entries are excluded;
- top-up, spend, withdrawal reserve, withdrawal cancellation, and refund
  entries retain their correct sign;
- the customer Wallet loads ledger transactions without changing balance or
  withdrawal behaviour.
