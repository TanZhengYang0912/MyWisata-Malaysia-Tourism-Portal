# Three-tier top-up limits gated by App KYC tier

**Status**: accepted

Without a limit gate, the `verification_tier` system has no functional consequence — every tier can do the same thing, making the App KYC investment (ADR-0002) look like theatre. We therefore couple per-session Top-up limits to the User's App KYC tier: `registered` (and `phone_verified`) → **RM 100/session**, `profile_complete` (and `kyc_submitted`) → **RM 500/session**, `kyc_verified` → **RM 1,000,000/session** (effectively unlimited). Withdrawal is separately gated: it always requires `kyc_verified` AND Payouts enabled — no tier-graduated withdrawal limit exists. Limits are enforced both client-side (UI shows the current cap with a "Verify KYC to unlock" CTA) and inside the `credit_topup` Postgres RPC (server is the source of truth; client is UX hint only).

## Considered Options

- **No limits** (any tier tops up any amount, only withdraw is gated) — rejected. The tier system becomes decorative — completing App KYC unlocks nothing observable to the User until they try to withdraw, killing the growth loop and inviting the FYP examiner to ask "what is your KYC actually for?".
- **Binary gate** (unverified → RM 500 cap; kyc_verified → unlimited) — rejected. The `profile_complete` tier becomes meaningless (same cap as `registered`); users who filled the profile form get no reward for doing so, weakening the tier progression.
- **Three-tier limits + daily aggregate cap** (three-tier per-session limits plus a rolling 24-hour cap per tier) — deferred as stretch goal. Requires each Top-up to query the last 24 hours of `wallet_transactions` for the User, then show a "Today: RM X used / RM Y remaining" UI. Correct but expensive to build; the FYP scope prioritises breadth over this depth.

## Consequences

- Limits live in one place (`lib/constants.ts` `TOP_UP_LIMITS: Record<VerificationTier, number>`); changes propagate to UI and RPC together. Do not hardcode individual numbers anywhere else.
- Open question: when a User's tier changes mid-Top-up (Checkout Session open, admin approves KYC before completion), which tier value is authoritative — the one at Session creation or at webhook time? Not resolved in this ADR. Default implementation should enforce the limit at Session creation and honour any completed Session that Stripe reports paid.
