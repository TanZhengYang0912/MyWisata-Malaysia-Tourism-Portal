# ADR-007: credit_earnings for payout failure reversal

**Status:** Accepted

## Decision

When a Stripe payout fails (`payout.failed` webhook), `connect_payout_failed` calls `credit_earnings` — which inserts a `wallet_transactions` entry of type `'earnings'` with direction `'credit'` — rather than `cancel_withdrawal`, which produces a `'withdrawal_cancel'` credit entry.

## Rationale

`cancel_withdrawal` was the first reversal mechanism, designed for admin-initiated rejection before Stripe fires. A Stripe failure is semantically different: the withdrawal was fully approved and Stripe attempted the transfer; the failure is an infrastructure event, not a policy decision. Using `credit_earnings` produces a ledger entry that reads "Stripe payout failed — earnings refunded", which is clearer to the vendor than "withdrawal cancelled". It also avoids updating `withdrawal_requests.status` back to `'pending'`, which would imply the request was never attempted. The `'failed'` terminal status on the request plus an `'earnings'` credit on the wallet gives a complete, accurate picture.
