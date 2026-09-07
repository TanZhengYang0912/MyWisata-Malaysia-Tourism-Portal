# All Vendor and Outlet Customer-Linked Demo Data

**Status:** Complete — implemented and verified against remote Supabase on 2026-09-05

## Context

The remote demo catalogue currently contains 170 vendors, 179 outlets, and 293 products. The catalogue itself is substantial, but customer-linked activity is uneven: 25 vendors and 30 outlets have no order history, while 22 vendors and 27 outlets have no order, review, or chat relationship with a customer. This leaves valid vendor and outlet pages looking empty during demonstrations.

Existing state seed migrations already connect most catalogue records to the four established demo customers. The old `supabase/seed.sql` and `scripts/seed-remote-demo.mjs` cannot be used as the canonical fix because they encode an obsolete shared-owner model. The remote seed also contains paths where `order_items.vendor_id` and `reviews.vendor_id` can disagree with the selected product and outlet.

## Goal

Provide an idempotent, guarded remote seed that dynamically fills customer-linked demo activity for every approved vendor and every active, approved outlet already present in the catalogue. The generated activity must be coherent enough to demonstrate both customer and vendor flows without inventing duplicate vendors, outlets, or products.

## Decisions

### Catalogue records remain authoritative

The seed reads the current vendors, outlets, products, outlet offers, variants, and demo customers from Supabase. It does not create replacement catalogue entities. For an outlet, an eligible product is either directly assigned through `products.outlet_id` or actively sold there through `outlet_offers`.

### Customer relationships use the established demo accounts

Generated rows use the existing customer accounts `customer1@demo.local` through `customer4@demo.local`. The seed must fail clearly if those public user records are unavailable instead of silently inventing unrelated identities.

### Coverage is catalogue-driven and deterministic

For every approved vendor and every active, approved outlet, the seed builds one deterministic demonstration baseline from the current catalogue. Stable UUIDs derived from vendor, outlet, scenario, and customer identity make repeated runs safe without duplicating those scenarios.

The baseline for each eligible outlet is:

- customer-owned orders and order items using an actual product available at that outlet;
- a realistic mix of completed, paid, and cancelled history where the schema permits it;
- a payment row for paid or completed orders;
- booking slots and bookings only for bookable products directly assigned to that outlet, as required by the database slot constraint;
- a visible review tied to a completed order item;
- one customer/vendor chat thread with contextual messages;
- customer interaction signals, and a wishlist item where the product is suitable;
- one clearly marked active demo voucher per vendor.

An outlet with no directly assigned product may use an active `outlet_offers` product from the same vendor. If an active outlet has neither a direct product nor an active offer, the seed reports it as a blocking catalogue integrity gap and does not fabricate an order item without a product.

### Cross-table ownership must agree

For every generated commerce row:

```text
product.vendor_id = outlet.vendor_id = order_item.vendor_id = review.vendor_id
```

The order item and review outlet must be the outlet where the product is directly assigned or actively offered. Booking slots and bookings must reference the same product/outlet/customer path.

### Remote execution remains explicitly guarded

The write command requires an explicit environment guard and the Supabase service-role key, following the existing remote seed convention. A separate read-only verification command reports total coverage and exits non-zero if any approved vendor or active approved outlet lacks customer-linked activity or if ownership consistency fails.

## Approaches Considered

### Dynamic relationship backfill — selected

Read the live catalogue and fill only missing relational demo scenarios. This covers current and future vendors, handles multi-outlet offers, and avoids duplicating catalogue data.

### Hard-code only today's missing vendors — rejected

This is smaller initially but becomes stale whenever catalogue migrations add vendors or outlets.

### Extend the legacy full remote seed — rejected

The existing full seed can repopulate many screens, but it recreates stale shared-owner accounts and currently permits vendor/product/order ownership mismatches.

## Scope Boundaries

In scope:

- a guarded remote customer-activity backfill command;
- deterministic seed-data construction separated from database I/O;
- contract and unit tests for selection, idempotency, ownership, and coverage;
- a read-only remote verification command;
- package scripts for seed and verification;
- execution against the currently configured remote Supabase after local verification.

Out of scope:

- UI or route changes;
- database schema or RLS changes;
- replacing existing vendors, outlets, products, or owner accounts;
- repairing unrelated historical rows unless they block the new coverage invariant;
- creating login-capable auth accounts for every vendor or outlet manager;
- modifying legacy state seed migrations.

## Error Handling

The seed stops before writes when required environment variables, demo customers, catalogue relations, or required columns are missing. Batched upserts report the table and scenario on failure. Post-seed verification runs after writes and treats missing coverage, cross-vendor mismatches, orphan bookings, or duplicate deterministic records as failures.

## Testing

Tests will prove that:

- direct products and active outlet offers are both eligible;
- products or offers from another vendor are rejected;
- deterministic IDs are stable across reruns;
- existing customer activity is preserved and only missing baseline rows are planned;
- non-bookable products never receive bookings;
- reviews reference a completed generated order item;
- every generated relationship carries the same vendor, outlet, product, and customer lineage;
- the verifier detects uncovered vendors/outlets and inconsistent ownership.

Final verification will include focused tests, `npm run lint`, `npx tsc --noEmit`, the read-only remote verifier, the guarded seed, and a second remote verification confirming complete coverage.

## Risks

- Remote demo data is a real database mutation even though the rows are synthetic. Stable IDs and gap-aware planning limit repeated changes.
- Existing catalogue anomalies may prevent a small number of outlets from receiving commerce data. Those cases must be surfaced instead of hidden with invalid rows.
- Financial-looking rows can distort demo totals. Generated descriptions and deterministic identifiers must clearly mark them as demo activity, and only the minimum needed for presentation should be added.
- Schema evolution may make an older seed payload invalid. The verifier and test fixtures must fail loudly rather than silently skipping rows.

## Dependencies and Database Changes

No new package dependency is required. No schema migration is planned. The implementation inserts or upserts demo rows only in existing tables and does not delete production-shaped catalogue data.

## Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dynamically create coherent, deterministic customer activity for every approved vendor and active approved outlet in the current remote catalogue.

**Architecture:** A pure planner selects valid product/outlet relationships and constructs deterministic rows without performing I/O. A guarded seed command loads the current Supabase catalogue, calls the planner, and upserts rows in foreign-key order. A separate read-only verifier measures coverage and rejects cross-vendor inconsistencies.

**Tech Stack:** Node.js ESM, Supabase JavaScript client, Vitest, existing PostgreSQL schema.

### Global Constraints

- Reuse the four established demo customers; do not create unrelated customer identities.
- Do not create, rename, replace, or delete vendors, outlets, products, or owner accounts.
- Do not use `supabase/seed.sql` or `scripts/seed-remote-demo.mjs` as the write path.
- Require `VENDOR_CUSTOMER_DEMO_SEED=1` before remote writes.
- Use stable UUIDs and upserts so a rerun does not add duplicate demo scenarios.
- Reject any product/outlet pairing whose vendor IDs differ.
- Add no dependencies and make no schema or RLS changes.

### Task 1: Pure customer-activity planner

**Files:**

- Create: `scripts/lib/vendor-customer-demo.mjs`
- Test: `scripts/__tests__/vendor-customer-demo.test.ts`

**Interfaces:**

- Produces `stableUuid(value: string): string`.
- Produces `buildVendorCustomerDemoPlan(input): DemoPlan`, where input contains vendors, outlets, products, outlet offers, customers, existing chat threads, and a fixed `now` date.
- `DemoPlan` groups rows for vouchers, orders, order items, payments, booking slots, bookings, reviews, interactions, chat threads, chat messages, and wishlist entries, plus blocking catalogue issues.

- [x] Write failing tests proving direct products and active same-vendor outlet offers are eligible, cross-vendor offers are rejected, IDs are stable, and non-bookable products do not generate bookings.
- [x] Run `npx vitest run scripts/__tests__/vendor-customer-demo.test.ts` and confirm the module-not-found failure.
- [x] Implement the minimal pure planner with one completed purchase per outlet, one additional future paid booking for directly assigned bookable products, one review, one interaction, one outlet chat when none exists, and one vendor voucher.
- [x] Run the focused test and confirm it passes.

### Task 2: Guarded remote seed command

**Files:**

- Create: `scripts/seed-all-vendor-customer-demo.mjs`
- Modify: `package.json`
- Test: `scripts/__tests__/vendor-customer-demo-script.test.ts`

**Interfaces:**

- Consumes `buildVendorCustomerDemoPlan`.
- Adds `npm run seed:vendor-customer-demo`.
- Loads `.env.local` or `.env`, requires the explicit guard and service-role key, paginates source tables, and upserts planned rows in foreign-key order.

- [x] Write a failing source-contract test for the guard, current-catalogue reads, planner call, and required upsert order.
- [x] Run the focused test and confirm it fails because the command and package script do not exist.
- [x] Implement environment loading, paginated reads, preflight issue reporting, batched upserts, protected existing wishlists, and a concise inserted-row summary.
- [x] Add the guarded package script and run both focused test files.

### Task 3: Read-only integrity and coverage verifier

**Files:**

- Create: `scripts/verify-all-vendor-customer-demo.mjs`
- Modify: `package.json`
- Test: `scripts/__tests__/vendor-customer-demo-script.test.ts`

**Interfaces:**

- Adds `npm run verify:vendor-customer-demo`.
- Reports approved vendor and active approved outlet coverage using orders, reviews, chats, bookings, and vouchers.
- Exits non-zero for uncovered entities, invalid product/outlet offers, mismatched order item ownership, mismatched review ownership, or orphaned generated booking paths.

- [x] Extend the source-contract test so it fails until the verifier and package command exist.
- [x] Implement paginated read-only checks and structured JSON output without performing any mutation.
- [x] Run both focused test files and confirm they pass.

### Task 4: Remote execution and final verification

**Files:**

- Modify: `Docs/plans/2026-09-05-0230-all-vendor-customer-demo-data.md` only to record completion and results.

- [x] Run `npm run verify:vendor-customer-demo` before seeding and confirm it identifies the current coverage gaps without changing data.
- [x] Run `npm run seed:vendor-customer-demo` against the configured remote Supabase and recover deterministic partial writes by rerunning after constraint fixes.
- [x] Run `npm run verify:vendor-customer-demo` again and require complete coverage with zero ownership mismatches.
- [x] Run `npm run lint`, `npx tsc --noEmit`, focused Vitest tests, and the complete Vitest suite.
- [x] Ask `luna_worker` for one bounded read-only privacy and ownership-integrity review and apply the focused verifier/product-selection repair.
- [x] Update this document with the exact remote totals and verification commands, then run `git diff --check` and inspect the final diff.

## Files Not Being Touched

- Application pages and components under `app/` and `components/`.
- API handlers under `app/api/`.
- Database migrations and `supabase/seed.sql`.
- Existing state catalogue seeds.
- Authentication account provisioning scripts.
- Production wallet, payout, refund, and recommendation logic.

## Completion Evidence

The guarded seed created or upserted 170 demo vouchers, 275 orders and order items, 275 payments, one processed Alice refund, 188 booking slots and bookings, 179 reviews and voucher redemptions, 179 interactions, 175 non-conflicting wishlists, and 172 new chat threads with 344 messages. A second run kept database totals unchanged and skipped existing chats and wishlists.

The final remote verifier reported 170/170 vendors and 179/179 outlets with qualifying demo-customer orders, visible reviews, non-empty correctly owned chats, and active vouchers. All 94 outlets with a directly assigned bookable product have a valid booking. Order-item, review, booking-path, and chat-thread mismatch lists are empty.

Final database totals after the Alice Wallet extension were 704 orders, 709 order items, 415 reviews, 179 chat threads, 340 bookings, 220 vouchers, one processed external refund, and 177 Wallet transactions. Alice's Wallet verifier reported approved KYC, a verified payout destination, rejected withdrawal status, equal RM42.92 adjustment entries, final balance RM7.08, and no reconciliation mismatch. Final local verification passed 2,644 tests across 566 files; `npx tsc --noEmit`, script syntax checks, and `git diff --check` exited zero. Lint exited zero with 70 pre-existing warnings outside this change.

Cross-table atomicity remains a follow-up because the Supabase client cannot wrap these table writes in one transaction without adding a database RPC or migration, which was explicitly out of scope. Stable IDs, table-specific errors, and the verified rerun path make partial writes recoverable without deletion.
