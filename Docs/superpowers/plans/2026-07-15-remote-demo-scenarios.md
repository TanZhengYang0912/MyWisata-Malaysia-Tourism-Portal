# Remote Demo Scenarios and Review Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display real product review metrics and seed linked, idempotent remote Supabase demo scenarios without changing existing non-scenario data.

**Architecture:** Add a small pure review aggregation helper to the catalogue domain and query visible reviews for active products. Add a separate service-role-only `seed-remote-scenarios.mjs` that uses deterministic IDs, ordered upserts, current remote IDs, and post-seed integrity checks for recommendation, personalization, moderation, geocode, refund, and payout scenarios.

**Tech Stack:** Next.js App Router, TypeScript, Supabase JS, Node.js seed scripts, Vitest.

## Global Constraints

- Preserve existing Supabase data and do not delete, truncate, or overwrite unrelated rows.
- Use deterministic IDs and additive upserts for all scenario rows.
- No schema migration or new table.
- Never expose `SUPABASE_SERVICE_ROLE_KEY` to browser code or logs.
- Keep `email_verifications`, `phone_verifications`, and `idempotency_keys` empty.
- Run remote verification after data writes.

---

### Task 1: Add review aggregation coverage

**Files:**
- Create: `backend/domains/__tests__/catalogue-review-metrics.test.ts`
- Modify: `backend/domains/catalogue.ts`

**Interfaces:**
- Export `aggregateReviewMetrics(rows: Array<{ product_id: string; rating: number }>): Map<string, { rating: number; reviews: number }>` from `backend/domains/catalogue.ts`.
- `getActivities()` loads visible review rows for the returned product IDs and passes the resulting map to `mapActivity()`.

- [ ] **Step 1: Write the failing tests** for two visible reviews averaging 4.5, multiple products remaining independent, and an unreviewed product returning `{ rating: 0, reviews: 0 }`.
- [ ] **Step 2: Run the focused test and verify it fails** because `aggregateReviewMetrics` does not exist.
- [ ] **Step 3: Implement the pure aggregation helper** with one pass over the rows and rounded one-decimal averages.
- [ ] **Step 4: Update `getActivities()`** to query `reviews` with `is_visible = true` and `product_id IN (...)`; return empty metrics when the product list is empty.
- [ ] **Step 5: Update `mapActivity()`** to consume the metrics map while preserving the existing product and outlet mapping.
- [ ] **Step 6: Run the focused test and verify it passes.**

### Task 2: Add the deterministic remote scenario seed

**Files:**
- Create: `scripts/seed-remote-scenarios.mjs`
- Modify: `package.json`

**Interfaces:**
- Command: `REMOTE_SCENARIO_SEED=1 npm run seed:remote-scenarios`.
- Optional switch: `SKIP_OPTIONAL_SCENARIOS=1` skips refunds and payout records.
- The script prints a JSON summary with before counts, inserted/upserted counts, and scenario IDs without printing secrets.

- [ ] **Step 1: Add environment loading and the explicit seed guard.** Refuse to run unless `REMOTE_SCENARIO_SEED=1`, `NEXT_PUBLIC_SUPABASE_URL`, and `SUPABASE_SERVICE_ROLE_KEY` are available.
- [ ] **Step 2: Add `stableUuid(namespace)` and chunked `upsert(table, rows, onConflict)` helpers.** Use the `remote-demo-scenario:` namespace and batch writes at 200 rows.
- [ ] **Step 3: Add the preflight loader.** Read the seeded customer IDs, admin ID, approved vendors, categories, products, outlets, completed orders, payments, and approved/pending withdrawal requests needed by later rows; throw a descriptive error if any required dependency is missing.
- [ ] **Step 4: Upsert `user_preferences`, `user_interactions`, `recommendation_snapshots`, and `geocode_cache`.** Use stable customer/product/outlet references and allowed event/entity values.
- [ ] **Step 5: Upsert the moderation scenario.** Insert one deterministic `chat_report_bans` row for a non-primary demo customer with a future `banned_until` and an admin `banned_by`.
- [ ] **Step 6: Upsert parent recommendation rows.** Create deterministic converted and pending `vendor_recommendations` without modifying existing recommendations; set reviewer fields only on reviewed rows.
- [ ] **Step 7: Upsert `recommendation_conversions` and `recommendation_commissions`.** Link converted recommendations to real vendors and completed orders, use positive amounts and allowed `bonus`/`ongoing` plus `pending`/`confirmed`/`reversed` values, and leave wallet ledger references null unless an existing ledger entry is explicitly linked.
- [ ] **Step 8: Ensure active affiliate visibility.** Inspect existing `affiliate_attributions` by status and add only missing deterministic pending/confirmed rows using existing `affiliate_clicks` and completed orders; do not duplicate existing attribution pairs.
- [ ] **Step 9: Add optional refunds and payouts.** Insert one pending and one processed refund with real payment/order IDs; insert masked payout destinations and pending payout transactions linked to approved withdrawal requests. Skip these writes when `SKIP_OPTIONAL_SCENARIOS=1`.
- [ ] **Step 10: Add the package script** without changing existing seed commands: `"seed:remote-scenarios": "node scripts/seed-remote-scenarios.mjs"`.

### Task 3: Add seed verification

**Files:**
- Create: `scripts/verify-remote-scenarios.mjs`
- Modify: `package.json`

**Interfaces:**
- Command: `npm run verify:remote-scenarios`.
- The verifier reports counts, status distributions, missing foreign-key joins, and unchanged core counts.

- [ ] **Step 1: Capture expected scenario counts and core counts before the seed.** Use read-only Supabase queries in the verifier.
- [ ] **Step 2: Verify every deterministic scenario namespace is present.** Check preferences, interactions, snapshots, geocode rows, moderation, recommendations, conversions, commissions, affiliate attributions, and optional rows.
- [ ] **Step 3: Verify foreign-key joins and status constraints** with read-only SQL queries.
- [ ] **Step 4: Verify idempotency** by recording counts and confirming a second seed produces the same counts.
- [ ] **Step 5: Add the npm script** `"verify:remote-scenarios": "node scripts/verify-remote-scenarios.mjs"`.

### Task 4: Run application and remote verification

**Files:**
- No additional source files.

- [ ] **Step 1: Run the focused review test.**
- [ ] **Step 2: Run the full Vitest suite and TypeScript/lint checks.**
- [ ] **Step 3: Run `REMOTE_SCENARIO_SEED=1 npm run seed:remote-scenarios`.**
- [ ] **Step 4: Run `npm run verify:remote-scenarios` and the existing `npm run verify:remote-demo`.**
- [ ] **Step 5: Run the seed a second time and confirm deterministic counts do not increase.**
- [ ] **Step 6: Run `git diff --check` and report any pre-existing dirty files separately from files changed by this task.**
