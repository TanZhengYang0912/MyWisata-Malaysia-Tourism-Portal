# Vendor Account Role Demo Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every seeded Vendor Owner and Outlet Manager login-capable, role-scoped, customer-linked demonstration data without weakening financial or Outlet authorization boundaries.

**Architecture:** Extend the existing guarded Vendor/customer demo workflow with a pure account-coverage planner. A service-role-only PostgreSQL procedure atomically converts a qualifying Customer order into one idempotent, order-linked Vendor Owner earning; the seed adds deterministic role-scoped in-app notifications, and the existing read-only verifier gains per-account Auth, Wallet, and notification checks.

**Tech Stack:** Node.js ESM, TypeScript/Vitest, Supabase JavaScript client, PostgreSQL migration/RPC, existing Wallet ledger and Vendor notification schema.

## Global Constraints

- Reuse existing Vendors, Outlets, Products, Customer orders, Wallets, Owner profiles, and Manager assignments.
- Do not create, delete, replace, or rename catalogue entities or users.
- Require `VENDOR_CUSTOMER_DEMO_SEED=1` for remote writes.
- Restrict financial demo credits to `@demo.local` Vendor Owners and `service_role`.
- Persist the actual qualifying `order_id` on every generated Wallet earning.
- Do not create KYC or Withdrawal data for every Vendor Owner.
- Do not expose Owner Wallet or Vendor-wide data to Outlet Managers.
- Add no package dependency.

---

### Task 1: Pure Vendor account coverage planner

**Files:**

- Create: `scripts/lib/vendor-account-demo.mjs`
- Create: `scripts/__tests__/vendor-account-demo.test.ts`

**Interfaces:**

- Produces `buildVendorAccountDemoPlan(input)`.
- Returns `earningActions`, `notificationRows`, `issues`, and coverage statistics.
- Selects only paid/completed Customer orders whose order item Vendor and Outlet ownership agree.

- [x] **Step 1: Write failing tests** for deterministic order selection, missing Owner/Manager/Auth paths, Owner notification scope, Manager assigned-Outlet scope, and rejection of cross-Vendor order items.
- [x] **Step 2: Run** `npx vitest run scripts/__tests__/vendor-account-demo.test.ts` and require failure because the planner does not exist.
- [x] **Step 3: Implement the minimal pure planner** using the existing stable UUID helper and explicit role-scoped notification rows.
- [x] **Step 4: Rerun the focused test** and require all assertions to pass.

### Task 2: Governed idempotent Vendor order earning

**Files:**

- Create: `supabase/migrations/20260908165700_demo_vendor_order_earnings.sql`
- Create: `supabase/migrations/__tests__/20260908165700_demo_vendor_order_earnings.test.ts`
- Create: `supabase/migrations/20260908180000_harden_demo_vendor_order_earnings.sql`
- Create: `supabase/migrations/__tests__/20260908180000_harden_demo_vendor_order_earnings.test.ts`

**Interfaces:**

- Produces `public.seed_demo_vendor_order_earning(p_vendor_id UUID, p_order_id UUID, p_note TEXT) RETURNS JSONB`.
- The function derives the Owner, Wallet, and Vendor order total; inserts an `earnings` ledger entry with `order_id` and deterministic `idempotency_key`; updates the Wallet and inserts audit/Wallet notification rows atomically.

- [x] **Step 1: Write a failing SQL contract test** for service-role enforcement, demo-domain restriction, approved Vendor/order validation, order-linked ledger insertion, idempotency, audit logging, and Owner-only Wallet notification scope.
- [x] **Step 2: Run the migration test** and require failure because the migration does not exist.
- [x] **Step 3: Implement the database function** with locked Wallet mutation and insert-first idempotency.
- [x] **Step 4: Rerun the migration test** and require it to pass.

### Task 3: Extend the guarded seed

**Files:**

- Modify: `scripts/seed-all-vendor-customer-demo.mjs`
- Modify: `scripts/__tests__/vendor-customer-demo-script.test.ts`

**Interfaces:**

- Reads `outlet_managers`, `user_roles`, `roles`, `orders`, `order_items`, `wallets`, `wallet_transactions`, and `notifications` in addition to the existing catalogue data.
- Uses Auth Admin listing only for preflight verification.
- Calls `seed_demo_vendor_order_earning` for missing actions and upserts operational notifications by `event_key`.

- [x] **Step 1: Add failing source-contract assertions** for the new planner, required reads, Auth preflight, RPC call, notification upsert, and absence of email enqueueing.
- [x] **Step 2: Run focused script tests** and confirm the new assertions fail.
- [x] **Step 3: Implement account-plan loading and writes** after existing customer relationships are upserted.
- [x] **Step 4: Rerun focused tests** and require them to pass.

### Task 4: Extend read-only remote verification

**Files:**

- Modify: `scripts/verify-all-vendor-customer-demo.mjs`
- Modify: `scripts/__tests__/vendor-customer-demo-script.test.ts`

**Interfaces:**

- Adds failures for missing Owner/Manager Auth, role/assignment mismatches, missing order-linked Owner earnings, invalid earning ownership, missing Owner notifications, missing Manager notifications, cross-Outlet Manager notification scope, and Owner-only categories delivered to managers.

- [x] **Step 1: Add failing verifier contract assertions** for account coverage and role isolation outputs.
- [x] **Step 2: Run the source-contract test** and confirm failure.
- [x] **Step 3: Implement the read-only checks and structured totals** without mutation methods.
- [x] **Step 4: Rerun focused tests** and require them to pass.

### Task 5: Close confirmed Outlet Manager read-scope gaps

**Files:**

- Create: `app/vendor/__tests__/vendor-role-data-boundaries.test.ts`
- Modify: `app/vendor/bookings/page.tsx`
- Modify: `components/vendor/slot-form.tsx`
- Modify: `app/api/vendors/[vendorId]/vouchers/analytics/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/route.ts`
- Modify: `app/api/vendors/[vendorId]/outlets/route.ts`
- Modify: `app/api/vendor/share-analytics/route.ts`
- Modify: `app/api/vendors/[vendorId]/route.ts`

**Interfaces:**

- Bookings and slot metadata comes only from the existing role-scoped Outlet/Product APIs.
- Vendor profile, Vendor-wide Voucher analytics, and Vendor-wide share analytics require `vendor_owner` (or retain the existing explicit Super Admin path where applicable).

- [x] **Step 1: Add failing boundary contract tests** for scoped metadata loading and owner-only direct APIs.
- [x] **Step 2: Replace direct browser Supabase metadata reads** with scoped API results shared with `SlotForm`.
- [x] **Step 3: Enforce Owner-only authorization** on Vendor profile and Voucher analytics and reject resolved Outlet Managers from Vendor-wide share analytics.
- [x] **Step 4: Rerun focused boundary and existing Wallet approver tests.**

### Task 6: Deploy, seed, and verify

**Files:**

- Modify: `Docs/plans/2026-09-08-1657-vendor-account-role-demo-coverage.md` only to record completion evidence.

- [x] **Step 1: Run focused tests,** `npm run lint`, and `npx tsc --noEmit` before remote mutation.
- [x] **Step 2: Push the earning and hardening migrations** to the linked Supabase project and verify their history, function guards, and grants.
- [x] **Step 3: Run** `npm run seed:vendor-customer-demo` once, then again to prove idempotency.
- [x] **Step 4: Run** `npm run verify:vendor-customer-demo` and require full catalogue plus account-role coverage with zero mismatches.
- [x] **Step 5: Run the final focused/full verification once**, inspect `git diff --check`, and record exact counts in this plan.
- [x] **Step 6: Request one bounded read-only `luna_worker` review** of permission isolation, financial linkage, and sensitive-data exposure before the final handoff.

## Files Not Being Touched

- Customer UI and unrelated Vendor UI.
- Authentication routes and role-navigation components.
- Existing KYC, Withdrawal, payout, refund, and provider settlement procedures.
- Legacy migrations, `supabase/seed.sql`, and catalogue/state seed migrations.
- Stripe configuration and production email delivery.

## New Dependencies

None.

## Database Changes

One new service-role-only, demo-domain-restricted RPC and its follow-up hardening migration are added. Existing data is not deleted or rewritten; new Wallet ledger, audit, and notification rows are append-only, while the corresponding Wallet balance is updated in the same database transaction.

## Risks

- Financial-looking demo credits affect Vendor Owner Wallet totals; notes, event keys, and audit actions explicitly identify them as demo order settlements.
- The Supabase seed performs multiple RPC calls; deterministic database idempotency makes interruption and rerun safe.
- A historical cross-Vendor order item must block planning rather than crediting the wrong Owner.
- Auth Admin listing is server-side only and must never log tokens, password hashes, or service credentials.
- Scoped Product APIs paginate at 24 rows; the bookings metadata loader must page safely rather than truncating a large assigned catalogue.

## Execution Evidence

- Tasks 1–6 completed on 2026-09-08.
- Migration `20260908165700` was applied atomically through the Supabase Management API after the CLI connection stalled. Migration history, function existence, and grants were read back successfully (`service_role = execute`, `authenticated = no execute`).
- Hardening migration `20260908180000` was applied and read back successfully. The live function now requires an active, approved Product owned by the Vendor and available at the order Outlet, validates the `vendor_owner` role, and rejects mismatched pre-existing idempotency rows.
- First guarded seed: 170 earning actions, 349 role-scoped operational notifications, 0 planning issues.
- Second guarded seed: 0 earning actions, 0 notification rows, 0 issues, proving deterministic idempotency.
- Remote verifier: 170/170 Owners with order earnings, Owner order notifications, and Owner Wallet notifications; 179/179 Managers with assigned-Outlet operational notifications; every Auth, role, ownership, cross-Outlet, and Owner-only-category failure list empty.
- Alice remains the representative governed Wallet lifecycle: KYC approved, verified payout destination, rejected Withdrawal with reserve/release, processed Refund, and RM42.92 adjustment credit/debit with RM0 net adjustment.
- Final focused verification: 12 test files and 102 tests passed; `npx tsc --noEmit` passed; `npm run lint` completed with 0 errors (67 pre-existing repository warnings); `git diff --check` passed.
- Final production build passed on Next.js 16.2.10 Turbopack: compiled in 6.1s, TypeScript in 14.4s, and generated all 172 routes/pages.
- Independent `luna_worker` review findings were closed: booking-only Product/Outlet projections prevent manager-side sensitive metadata exposure; RPC Product/Outlet lineage is enforced; the verifier now requires exactly one valid earning per Vendor and reconciles every Vendor Owner Wallet against its complete earnings ledger.
- Post-hardening live seed rerun: 0 earning actions, 0 notification rows, 0 issues. The strict remote verifier returned `ok: true`, with 170/170 exact Owner earnings, 170/170 reconciled Owner Wallets, 179/179 Manager notifications, and every failure list empty.
