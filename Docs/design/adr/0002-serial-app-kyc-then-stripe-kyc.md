# Serial App KYC then Stripe KYC

**Status**: accepted

The project has two independent KYC concepts: **App KYC** (IC/passport upload reviewed by an admin, gates the `verification_tier` system that governs top-up limits, feature access, and platform trust) and **Stripe KYC** (Connect Express onboarding on Stripe's domain, hard-required by Stripe before any Payout). Both are needed to withdraw. We run them **in series** — App KYC must reach `verification_tier = kyc_verified` before Stripe KYC becomes available. When we invoke Stripe Connect onboarding, the User's already-collected App KYC data (name, IC number, date of birth) is passed as pre-filled `individual` fields, so the User does not re-enter the same information.

## Considered Options

- **Parallel** (App KYC and Stripe KYC run independently, withdraw only checks Payouts enabled) — rejected. Users who complete Stripe KYC but skip App KYC would bypass the platform's tier system entirely, making our KYC review vestigial and desynchronising trust levels across UI features.
- **Replace App KYC with Stripe KYC** (drop the `kyc_submissions` table and admin review flow, use `stripe_payouts_enabled` as the sole trust signal) — rejected. The tier system has independent value outside of payouts (voucher eligibility, wallet limits, feature access) and the existing `kyc_submissions` + admin approval UI would be thrown away.
- **KYC gates top-up limit only, no gate on withdrawal** — rejected. Stripe KYC is not optional for real Payouts; this option was mathematically incompatible with actually shipping the withdrawal flow.

## Consequences

- Withdraw button UX has a three-state gate: `tier < kyc_verified` → prompt to complete App KYC; `tier = kyc_verified && !payouts_enabled` → prompt to complete/resume Stripe onboarding; both satisfied → show Withdraw form.
- Pre-filling Stripe onboarding depends on IC/passport data being stored in a Stripe-compatible shape in `kyc_submissions`. Data model changes to `kyc_submissions` must consider Stripe field compatibility.
