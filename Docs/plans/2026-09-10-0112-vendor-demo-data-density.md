# Vendor and Outlet Demo Data Density Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Complete — executed and verified on 2026-09-10.

**Goal:** Give every approved Vendor and active approved Outlet a coherent twelve-order customer-linked timeline that populates Today, 7 Days, 30 Days, previous-period, and 12 Months Vendor dashboard views.

**Architecture:** Extend the existing pure `buildVendorCustomerDemoPlan` and guarded remote seed instead of adding UI fallback data. Stable scenario IDs and upserts keep reruns idempotent; every commerce row continues to follow Customer → Order/Booking → Product → Outlet → Vendor ownership.

**Tech Stack:** Node.js ESM, Supabase, Vitest, existing database tables and guarded seed commands.

## Global Constraints

- Reuse the established demo Customers who already satisfy independent email/phone verification and the live approved catalogue; do not fabricate verification for ineligible accounts.
- Create no Vendor, Outlet, Product, owner, or manager identity.
- Generate exactly twelve deterministic timeline orders per active approved Outlet, excluding the separately preserved global Alice refund fixture.
- Use products actually assigned or actively offered by the same Vendor and Outlet.
- Preserve the existing `VENDOR_CUSTOMER_DEMO_SEED=1` remote-write guard.
- Perform no deletion, schema migration, RLS change, or package installation.

## Reuse Decisions

- **Reuse:** `scripts/lib/vendor-customer-demo.mjs` stable UUID, product eligibility, row builders, and ownership rules.
- **Reuse:** `scripts/seed-all-vendor-customer-demo.mjs` guarded, foreign-key-ordered upsert pipeline.
- **Extend:** `scripts/verify-all-vendor-customer-demo.mjs` from binary coverage to density and time-bucket verification.
- **Reuse:** the canonical demo customer IDs, rotating only the commerce-eligible subset; reject creation of unrelated customer identities or fabricated verification state.
- **Reject:** UI-only dashboard fixtures because they would disagree with Orders, Bookings, Reviews, Wallet, and Customer history.
- **Reject:** hard-coded SQL rows because they become stale when the catalogue changes.

## Data Timeline per Outlet

- Today: one paid order with pending fulfilment.
- Last 7 days: two additional paid/completed orders.
- Days 8–30: three orders with completed, paid, and cancelled outcomes.
- Previous 30-day comparison period: two completed orders.
- Months 3–12: four completed orders distributed across the year.
- Rotate eligible Products and every commerce-eligible demo Customer deterministically.
- Create Payments for every scenario, Booking/Slot rows only when the existing product/outlet constraint permits them, Reviews only for completed purchases, and keep one coherent Chat/Voucher/Wishlist baseline.

## Task 1: Lock the twelve-order planner contract

**Files:**

- Modify: `scripts/__tests__/vendor-customer-demo.test.ts`

- [x] Add a failing test requiring twelve stable order IDs per Outlet, all supplied eligible Customer rotation, product/outlet/vendor agreement, the five dashboard time ranges, reasonable status distribution, and valid booking lineage.
- [x] Run `npx vitest run scripts/__tests__/vendor-customer-demo.test.ts` and confirm the new assertions fail against the one/two-order baseline.

## Task 2: Extend the existing planner

**Files:**

- Modify: `scripts/lib/vendor-customer-demo.mjs`

- [x] Add a fixed twelve-scenario timeline and extend `addPurchase` to consume explicit timing/status/review settings while retaining existing stable IDs where practical.
- [x] Rotate eligible same-Vendor Products per Outlet and existing demo Customers without weakening `productAvailableAtOutlet`.
- [x] Run the focused planner tests and require all assertions to pass.

## Task 3: Make density remotely verifiable

**Files:**

- Modify: `scripts/verify-all-vendor-customer-demo.mjs`
- Modify: `scripts/__tests__/vendor-customer-demo-script.test.ts`

- [x] Add failing verifier-contract assertions for per-Outlet deterministic order count and Today/7d/30d/previous/12m coverage.
- [x] Add structured density totals and failure lists without adding mutation methods to the verifier.
- [x] Run the two focused script test files and require them to pass.

## Task 4: Verify and execute the guarded remote seed

**Files:**

- Modify: this plan only to record execution evidence.

- [x] Run focused tests, `npm run lint`, `npx tsc --noEmit`, and `npm test` once after the final code change.
- [x] Obtain one bounded read-only `luna_worker` review of idempotency, ownership, and sensitive-data exposure.
- [x] Run `npm run seed:vendor-customer-demo`, then rerun it to prove stable totals.
- [x] Run `npm run verify:vendor-customer-demo` and require 170/170 Vendors and 179/179 Outlets with zero ownership failures and complete time-bucket density.
- [x] Use the existing Vendor dashboard verification path to confirm a representative Outlet Manager sees populated Today, 7 Days, 30 Days, and 12 Months views.

## Execution Evidence

- Guarded seed completed with 170 approved Vendors, 179 active approved Outlets, and 2,148 deterministic timeline Orders linked to 2 independently verified demo Customers.
- Read-only remote verification returned `ok: true`: every Vendor and Outlet has the required commerce coverage, all 179 Outlets have complete time buckets, and every ownership/lifecycle failure list is empty.
- Playwright confirmed the Vendor Owner dashboard contains 4/12/26/53 orders across Today/7 Days/30 Days/12 Months and the Outlet Manager dashboard contains 1/3/8/18, with no browser errors.
- Final verification: ESLint exited 0 with 67 pre-existing warnings and no errors; TypeScript exited 0; Vitest passed 622 files and 2,981 tests, with 7 files and 20 tests skipped.

## Scope Boundaries

**Files not touched:** application UI, Vendor dashboard calculations, Customer UI, API handlers, migrations, RLS policies, catalogue records, authentication provisioning, production payment integrations.

**New dependencies:** None.

**Database changes:** Data-only guarded upserts into existing demo rows; no schema changes and no deletions.

## Risks

- The eligible demo Customer histories will become intentionally dense; deterministic rotation and demo notes keep their origin clear.
- Approximately 2,148 relationship-complete orders increase remote demo volume; dashboard queries remain scoped per Vendor/Outlet and already cap at 10,000 rows.
- Relative timestamps move on rerun. This is intentional so all dashboard periods remain demonstrable, while stable IDs prevent duplicate accumulation.
- Partial remote writes remain recoverable through the existing table-specific errors, stable IDs, ordered upserts, and verified rerun path.
