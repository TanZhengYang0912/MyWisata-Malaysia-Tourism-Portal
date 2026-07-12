# ADR-010: KYC approval gate on Stripe Connect onboarding

**Status:** Accepted

## Decision

`POST /api/stripe/connect-onboard` returns 403 if the user's `kyc_status` is not `'approved'`. A user cannot start Stripe Connect onboarding until KYC is complete.

## Rationale

Stripe Connect's own KYC covers bank account and identity verification for payout purposes, but it does not cover the platform's internal verification requirements (e.g., vendor licence, business registration, platform ToS acceptance). Gating Connect onboarding behind our own KYC approval ensures that the platform has reviewed the vendor before Stripe processes their bank details. Without this gate, a vendor could receive platform earnings into a Stripe account before their platform eligibility has been confirmed. The gate is enforced server-side in the API route, not in the UI — a client bypassing the JIT intercept modal by calling the endpoint directly still hits the 403.
