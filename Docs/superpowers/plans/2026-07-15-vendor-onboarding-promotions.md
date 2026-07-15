# Vendor onboarding, recommendations and promotion spotlight

## Scope

- Add a clear customer-facing entry point for vendor self-registration.
- Show the existing vendor application status instead of redirecting away from it.
- Make the existing customer vendor recommendation workflow explain pending, approved and converted states.
- Add an optional vendor address to the existing recommendation form.
- Add a real-data Promotion Spotlight between Browse by Category and Top Picks.

## Data decisions

- Reuse the existing `vendors` pending/approved/rejected/suspended workflow.
- Reuse the existing `vendor_recommendations` pending/approved/rejected/converted workflow and admin linking RPC.
- Build promotions from approved activity data; do not add a promotions table or fake countdown data.

## Verification

- Focused unit tests for promotion selection and status copy.
- Full Vitest suite, TypeScript check, production build, targeted lint and diff check.
