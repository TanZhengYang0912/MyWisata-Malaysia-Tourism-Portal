# ADR-016: Affiliate commissions enter pending_earnings_sen before becoming withdrawable

**Status:** Accepted

## Decision

Affiliate commission earned via `onOrderPaid()` is credited to `wallets.pending_earnings_sen` (a new hold bucket added in migration 014), not directly to `earnings_sen`. It becomes withdrawable only after the hold window (`earnings.hold_days = 7` in `platform_settings`) passes and `confirm_pending_earnings()` runs. Refunds can only reverse pending commissions; confirmed commissions are retained.

## Rationale

The prior design credited commissions directly to `earnings_sen` at the moment of purchase, making them immediately withdrawable. This created a double-spend risk: a user could refer an order, withdraw the commission, then request a refund of the original order — the platform bears the loss. A hold window gives the refund window time to close before the commission becomes liquid. Confirmed earnings are not reversed because reneging on settled commissions undermines trust and creates accounting complexity; reversals only apply within the hold window when the risk is still open. The 7-day default matches the platform's standard refund window. Vercel Cron clears past-due pending earnings at midnight MYT; admins can trigger clearance manually from `/admin/rewards`.
