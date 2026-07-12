# ADR-005: Stripe Connect Express for vendor payouts

**Status:** Accepted

## Decision

Vendor bank-account payouts use Stripe Connect Express accounts. When a withdrawal is approved, the platform creates a Stripe Transfer from the platform account to the vendor's Connected account, then a Payout from that account to the vendor's bank.

## Rationale

Connect Express gives Stripe responsibility for KYC, AML, and bank account verification of each vendor. The platform never stores bank account numbers. The alternative — direct bank transfers via FPX or local rails — would require a payment institution licence and full AML compliance infrastructure. Stripe Standard was rejected because it gives vendors too much access to Stripe settings; Express gives the platform control over the payout schedule while Stripe handles identity verification. The Transfer + Payout two-step (vs a single `destination` charge) is required because platform earnings accumulate in the platform Stripe balance before being distributed; this is the canonical pattern for marketplace platforms.
