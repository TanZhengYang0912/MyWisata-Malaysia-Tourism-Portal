# Remote Demo Scenarios and Review Metrics Design

## Goal

Make the customer catalogue show real product review metrics and add coherent, repeatable Supabase demo scenarios for recommendation, personalization, moderation, geocoding, refunds, and payouts without deleting or rewriting existing project data.

## Current Findings

- The remote `FYP` project already contains review rows. The catalogue card displays `0 (0)` because `backend/domains/catalogue.ts` maps every product to `rating: 0` and `reviews: 0` without querying `reviews`.
- The current affiliate UI reads `affiliate_attributions`, while `recommendation_conversions` and `recommendation_commissions` are a separate recommendation-commission flow. The seed must account for both paths when visible affiliate scenarios are required.
- All target tables already exist. No schema migration is needed.

## Scope

### Review metrics

Update catalogue loading to fetch visible reviews for the returned product IDs, compute each product's average rating and count, and preserve `0 (0)` only for products with no visible reviews. Add a focused unit test for aggregation and the no-review case.

### Required demo scenarios

Seed deterministic, linked rows for:

- `user_preferences` for the four seeded customers;
- `user_interactions` covering view, save, share, book, and rate events against existing products, outlets, and vendors;
- `recommendation_snapshots` whose JSON results reference existing product IDs;
- `geocode_cache` entries for existing outlet addresses;
- one moderation case in `chat_report_bans` using a non-primary demo customer;
- converted `vendor_recommendations`, `recommendation_conversions`, and `recommendation_commissions` linked to existing vendors and completed orders;
- a visible affiliate scenario check against `affiliate_attributions`, adding only missing deterministic rows needed for pending and confirmed states.

### Optional demo scenarios

Seed masked, non-real examples for:

- `refunds`: one pending and one processed refund linked to existing payments and orders;
- `payout_destinations`: bank and e-wallet destinations with masked references;
- `payout_transactions`: pending payout transactions linked to compatible existing withdrawal requests.

The optional scenarios are enabled by default for the full demo command and can be skipped with `SKIP_OPTIONAL_SCENARIOS=1`.

### Intentionally empty technical tables

Do not fabricate rows in `email_verifications`, `phone_verifications`, or `idempotency_keys`. These records should be produced by the corresponding authentication and request flows.

## Architecture

Keep the existing core seed script unchanged and add `scripts/seed-remote-scenarios.mjs` as a separate, service-role-only, remote seed command. The new script will load the existing environment convention, require an explicit `REMOTE_SCENARIO_SEED=1` guard, use stable UUIDs scoped to `remote-demo-scenario`, and upsert records in foreign-key order. It will read current IDs from Supabase instead of assuming generated IDs, except for the stable demo users and vendors already defined by the project seed.

The review fix remains in the catalogue domain. Product rows are loaded first, visible reviews are loaded by product ID, and a small pure aggregation helper maps review rows to `{ rating, reviews }` values. The presentation components remain unchanged.

## Data Integrity and Safety

- Existing non-scenario rows are never deleted, truncated, or overwritten.
- Every scenario row has a deterministic ID or deterministic natural-key conflict target, so rerunning the command is idempotent.
- Recommendation conversions are inserted only after their parent recommendation and referenced vendor/order exist.
- Commission amounts are positive and use allowed lifecycle values. The script does not invent wallet ledger entries or mutate wallet balances merely to make the commission table non-empty.
- Refunds use mock status and payment/order references only; no Stripe API call is made.
- Payout references are masked and non-real. Payout transactions are created only for existing compatible withdrawal requests.
- The service-role key is read only by the local Node seed process and is never added to browser code or logs.

## Verification

The implementation will verify:

- review aggregation tests pass and catalogue review counts match visible Supabase rows;
- each scenario table has the expected deterministic rows after one run;
- a second run does not increase deterministic row counts;
- recommendation, conversion, commission, refund, payout, and moderation foreign keys resolve;
- optional status distributions are present;
- existing core counts for users, products, orders, bookings, and reviews remain unchanged;
- the existing remote demo verification script and the new scenario verification queries complete successfully.

## Out of Scope

- Creating new tables or migrations.
- Changing RLS policies or authentication behavior.
- Replacing the current affiliate attribution model with the recommendation-commission model.
- Adding real payment, banking, email, phone, or Stripe integrations.
