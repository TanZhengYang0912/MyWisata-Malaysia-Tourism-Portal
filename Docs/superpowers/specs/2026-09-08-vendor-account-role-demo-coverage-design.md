# Vendor Account Role Demo Coverage Design

**Status:** Approved for implementation on 2026-09-08 through the user's instruction to continue without further decision gates.

## Goal

Make every seeded Vendor Owner and Outlet Manager account both login-capable and useful in a lecturer demonstration. Each account must receive coherent data derived from the Vendor, Outlet, Product, Order, Booking, Review, and Customer relationships already in Supabase, while preserving least-privilege role boundaries.

## Current State

- All 170 approved Vendors and 179 active approved Outlets already have customer-linked orders, reviews, chats, vouchers, and valid booking coverage where the Outlet has a directly assigned bookable Product.
- All 170 Vendor Owner and 179 Outlet Manager profiles have matching Supabase Auth users after the guarded account repair command.
- Only one Vendor Owner has Wallet transactions and no Vendor Owner has a Withdrawal.
- Only 9 Vendor Owners and 9 Outlet Managers currently have role-scoped Vendor notifications.
- The Vendor portal already hides Owner-only Wallet, Analytics, Profile, and Voucher routes from Outlet Managers and scopes manager operations through assigned Outlet IDs.

## Decisions

### Role-appropriate completeness

Vendor Owners receive Vendor-wide operational data, order-linked Wallet earnings, and Owner-scoped order and Wallet notifications. Outlet Managers receive assigned-Outlet products, orders, bookings where applicable, customer conversations, reviews, and operational notifications.

Outlet Managers do not receive or query Vendor Wallet, payout, Withdrawal, revenue-account, or other-Outlet data.

### Earnings must be linked to real demo commerce

A new service-role-only database procedure credits one deterministic demo earning per approved Vendor from an existing paid or completed order containing an item owned by that Vendor. The Wallet transaction stores the actual `order_id`, the Vendor Owner as `user_id`, the correct Wallet, an idempotency key, and a clear demo note.

The procedure validates that the Vendor is approved, the Owner is an `@demo.local` profile, the order is paid or completed, and the order contains a positive line total for that Vendor. It derives the amount in the database, updates the Wallet, inserts the ledger row, audit entry, and Owner Wallet notification atomically, and returns idempotently on rerun.

### Notifications remain scoped and non-deliverable

The seed inserts deterministic in-app notifications only. It does not enqueue email to demo-local addresses. Owner order notifications use `vendor_id`, `audience_role = vendor_owner`, and no Outlet scope. Manager notifications use the assigned `outlet_id`, `audience_role = outlet_manager`, and an operational category. All notification metadata contains only safe identifiers and display information.

### Withdrawal scope

Do not fabricate KYC evidence or Withdrawal histories for all 170 Vendor Owners. A Withdrawal is not required for every Owner to have a meaningful Wallet, and bypassing KYC would weaken the existing governed flow. The existing Alice scenario remains the representative complete Withdrawal/Refund/Adjustment lifecycle. Status-by-status immutable Withdrawal receipts remain a separate product feature.

## Data Flow

1. The guarded seed reads current Vendors, Outlets, Outlet Manager assignments, orders, order items, Wallet transactions, notifications, and Auth users.
2. A pure planner chooses valid paid/completed Customer orders for each Vendor and valid Customer order activity for each assigned Outlet.
3. Preflight fails before writes when an approved Vendor has no valid Owner/Auth/Wallet/order path or an active Outlet has no valid Manager/Auth/order path.
4. The seed calls the governed earning procedure once per missing deterministic Vendor earning.
5. It upserts deterministic Owner and Manager operational notifications by `event_key`.
6. The read-only verifier proves login coverage, role assignments, Wallet-order lineage, notification coverage, and absence of cross-scope mismatches.

## Error Handling and Safety

- Remote writes retain the existing `VENDOR_CUSTOMER_DEMO_SEED=1` guard.
- No Vendor, Outlet, Product, Order, Customer, KYC, or existing Wallet ledger row is deleted or rewritten.
- The earning procedure is restricted to `service_role` and `@demo.local` Vendor Owners.
- Deterministic idempotency keys prevent duplicate Wallet credits.
- A failed notification or account preflight stops the seed with exact missing entity IDs.
- The verifier is read-only and exits non-zero on missing coverage or ownership mismatches.

## Acceptance Criteria

- 170/170 Vendor Owners and 179/179 Outlet Managers have Auth users.
- Every approved Vendor Owner has at least one order-linked `earnings` Wallet transaction from their own Vendor's paid/completed Customer order.
- Every approved Vendor Owner has an Owner-scoped order notification and Wallet settlement notification.
- Every assigned Outlet Manager has an operational notification for their own Outlet.
- No manager notification references another Outlet, and no manager receives `vendor_wallet` or `vendor_account` demo data.
- Existing 170/170 Vendor and 179/179 Outlet customer-relationship verification remains green.
- Rerunning the seed does not increase deterministic Wallet earnings or notification counts.

## Out of Scope

- Creating KYC submissions or Withdrawal requests for every Vendor Owner.
- Exposing Wallet, payout, Analytics, Profile, or Vendor-wide Voucher data to Outlet Managers.
- Changing Vendor portal UI, navigation, or production email delivery.
- Replacing the existing Customer-linked catalogue seed or historical rows.
- Implementing immutable per-status Withdrawal receipt snapshots.

