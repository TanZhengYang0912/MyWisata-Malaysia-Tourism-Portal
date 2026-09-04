# All Vendor and Outlet Customer-Linked Demo Data

**Status:** Design approved; implementation plan pending written-spec review

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

### Coverage is gap-aware and deterministic

For every approved vendor and every active, approved outlet, the seed checks existing customer activity and only creates the deterministic rows needed to reach the demonstration baseline. Stable UUIDs derived from vendor, outlet, scenario, and customer identity make repeated runs safe.

The baseline for each eligible outlet is:

- customer-owned orders and order items using an actual product available at that outlet;
- a realistic mix of completed, paid, and cancelled history where the schema permits it;
- a payment row for paid or completed orders;
- booking slots and bookings only for products that require booking;
- a visible review tied to a completed order item;
- one customer/vendor chat thread with contextual messages;
- customer interaction signals, and a wishlist item where the product is suitable;
- at least one active vendor-level voucher when the vendor currently has none.

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
