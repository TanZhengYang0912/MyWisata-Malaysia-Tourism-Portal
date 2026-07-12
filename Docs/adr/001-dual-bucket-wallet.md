# ADR-001: Dual-bucket wallet (topup_sen + earnings_sen)

**Status:** Accepted

## Decision

The `wallets` table stores money in two separate integer columns — `topup_sen` (funds loaded via card top-up) and `earnings_sen` (commissions earned from bookings) — rather than a single `balance` field.

## Rationale

Top-up funds and earnings have different regulatory and payout properties. Top-up balance is spend-only: it goes toward booking purchases and cannot be withdrawn to a bank account. Earnings are withdrawable via Stripe Connect payout. Mixing them into one column would require a separate flag or shadow table to track origin, complicating every debit query. Separate columns make the constraint self-documenting and allow RLS/RPC logic to enforce withdrawal eligibility without joins.

Storing amounts as integer sen (smallest currency unit) avoids floating-point rounding errors in arithmetic that would otherwise accumulate across ledger entries.
