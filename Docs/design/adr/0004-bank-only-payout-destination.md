# Bank-only payout destination

**Status**: accepted

The Withdrawal form previously offered a dropdown of destinations (Maybank / CIMB / Public Bank / Touch 'n Go / GrabPay / Boost), all of which were purely cosmetic strings — no destination was wired to an actual payout rail. Stripe Connect Express in Malaysia only supports **bank account** payouts; e-wallets (GrabPay, Touch 'n Go, Boost) are not payout options through Stripe's platform. We therefore drop the destination dropdown entirely. The form now takes only an amount; the destination is the single bank account linked during Stripe onboarding, displayed as "Bank on file: {bank} ****{last-4}" pulled from the Connect account's `external_account` object.

## Considered Options

- **Dual-track** (Bank via Stripe, e-wallet via admin manual "processed" flag) — rejected. Introduces two payout paths with different state machines, double the test matrix, and dilutes the Stripe integration story evaluators are meant to notice.
- **Multiple bank accounts per User via Connect** (User can add several `external_account` objects, dropdown picks one) — rejected. Stripe Connect Express does not expose a good UI for managing multiple external accounts; writing it ourselves is roughly one full engineer-week that produces marginal user value in an FYP demo.
- **Keep e-wallet options as visible-but-mock** (dropdown still shows GrabPay/TnG/Boost, admin manually "sends" money) — rejected. Contradicts the ADR-0003 story that Approve triggers real Stripe API — reviewers who see a GrabPay row and a "Stripe integration" claim will call out the inconsistency.

## Consequences

- Existing `withdrawal_requests.destination` column becomes redundant. Kept for historical rows but new writes store `"stripe_connect"` as a sentinel string, or the column is repurposed to cache the display label (`"Maybank ****1234"`).
- Real Malaysian e-wallet support (GrabPay, TnG, Boost) is out of scope for MVP. Future work would require integrating each provider's payout API directly, not through Stripe.
