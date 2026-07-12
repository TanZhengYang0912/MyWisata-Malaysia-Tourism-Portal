# Dual-bucket wallet model (Top-up vs Earnings)

**Status**: accepted

The Wallet must hold two economically distinct kinds of money: card-funded Top-ups (from Stripe Checkout) and Earnings from sales revenue / commissions. Only Earnings should be withdrawable to a bank — allowing card-funded Top-ups to be withdrawn would be a money-laundering pattern that Stripe flags in production even though it works in test mode. We therefore split `wallets.balance_sen` into two buckets: **Top-up balance** (`topup_sen`, spendable only) and **Earnings balance** (`earnings_sen`, spendable + withdrawable). At checkout, Top-up drains first to preserve Earnings for withdrawal.

## Considered Options

- **Single balance** (all money in one `balance_sen`, spendable and withdrawable) — rejected. Compliant marketplaces separate top-up from earnings to keep AML risk defensible; even if Stripe test mode allows the shortcut, the demo narrative and future readers would rightly question it.
- **Bucket separation at ledger only** (single balance column, buckets inferred from `wallet_transactions` reason codes) — rejected. Every balance read would require a full ledger scan or aggregate, and the CHECK constraints protecting each bucket become impossible to express at the column level.
- **Three buckets** (Top-up / Earnings / Reserved for pending Withdrawals) — deferred. The reservation bucket is a stretch goal captured in the Q12 grill; the current design derives Withdrawable amount by subtracting pending withdrawals at read time.
