# Commerce and Vendor Enhancement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add transaction-safe checkout, booking capacity protection, payment consistency, voucher limits, service listings, vendor onboarding, recommendation claims, review integrity, analytics, and additive Shop Builder enhancements while preserving all existing behavior and data.

**Architecture:** Keep the existing Next.js and Supabase structure. Move checkout authority to server routes and Postgres RPCs, reuse the existing Stripe integration and webhook, and use additive migrations with RLS. Implement independent P1/P2 areas behind existing routes so each phase remains testable and reversible.

**Tech Stack:** Next.js, React, TypeScript, Supabase PostgreSQL/RLS/Storage, Stripe, Vitest, existing drag-and-drop builder components.

## Global Constraints

- Do not drop tables, columns, indexes, policies, records, or existing payment methods.
- Do not replace the existing Stripe integration; connect it to the new checkout state machine.
- Do not rewrite completed Shop Builder block editing or device preview.
- New migrations must be additive and backward compatible.
- No service-role key may be exposed to browser code.
- Every exposed Supabase table must have RLS and ownership checks.

---

### Task 1: Baseline audit and non-destructive migration foundation

**Files:**
- Create: `supabase/migrations/<timestamp>_commerce_vendor_enhancements.sql`
- Create: `scripts/audit-commerce-integrity.mjs`
- Test: `scripts/verify-remote-scenarios.mjs`

**Work:** Add additive columns/tables for checkout sessions, idempotency keys, holds, payment events, voucher per-customer limits, service product type, vendor documents, recommendation invites, and audit events. Enable RLS and grant only required roles. Add audit queries for over-capacity slots and orders without payment rows.

**Verification:** Run the audit against the configured Supabase project and record counts without deleting or rewriting existing rows.

### Task 2: Checkout and idempotency contracts

**Files:**
- Create: `app/api/checkout/prepare/route.ts`
- Create: `app/api/checkout/finalize/route.ts`
- Create: `app/api/checkout/release-expired/route.ts`
- Modify: `app/customer/checkout/page.tsx`
- Modify: `backend/domains/commerce.ts`
- Test: `backend/domains/__tests__/commerce-checkout.test.ts`

**Work:** Stop trusting browser totals/status. Create a server checkout session keyed by `(user_id, idempotency_key)`, return the same session on retry, and route every payment method through the same state machine.

**Verification:** Test duplicate requests, altered totals, empty carts, expired sessions, and failed payment cleanup.

### Task 3: Atomic inventory and booking capacity RPCs

**Files:**
- Modify: `supabase/migrations/<timestamp>_commerce_vendor_enhancements.sql`
- Modify: `app/api/checkout/prepare/route.ts`
- Test: `backend/domains/__tests__/booking-capacity.test.ts`

**Work:** Lock and update inventory and booking slots in one transaction with `booked + quantity <= capacity`; create holds with expiry; release holds on failure/expiry.

**Verification:** Run concurrent purchase tests where only one request can consume the final stock or slot.

### Task 4: Stripe payment record and webhook integration

**Files:**
- Modify: `app/api/stripe/create-checkout/route.ts`
- Create or modify: `app/api/stripe/webhook/route.ts`
- Modify: `app/api/checkout/finalize/route.ts`
- Test: `app/api/stripe/__tests__/webhook.test.ts`

**Work:** Reuse the existing Stripe PaymentIntent, persist provider IDs and events, make webhook processing idempotent, and finalize orders only from verified provider results. Keep E-wallet, Bank Transfer, and Wallet flows using the same payment table/state model.

**Verification:** Replay the same Stripe event twice and confirm one payment transition, one order transition, and one inventory/booking commit.

### Task 5: Voucher limit and central validation

**Files:**
- Modify: `supabase/migrations/<timestamp>_commerce_vendor_enhancements.sql`
- Create: `backend/domains/voucher-validation.ts`
- Modify: `app/api/vouchers/validate/route.ts`
- Modify: `backend/domains/catalogue.ts`
- Test: `backend/domains/__tests__/voucher-validation.test.ts`

**Work:** Add `per_customer_limit`, validate vendor/outlet/product/date/minimum-spend/BOGO rules in one service, and redeem under transaction lock.

**Verification:** Test a customer reaching the personal limit, concurrent redemption, wrong outlet/product, expired voucher, and unlimited legacy voucher.

### Task 6: Service product type

**Files:**
- Modify: `lib/validation/vendor-schemas.ts`
- Modify: `app/api/vendors/[vendorId]/products/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/route.ts`
- Modify: product form and product detail components
- Test: product validation tests

**Work:** Add `service` alongside existing types and support service duration, location, capacity, and booking metadata.

**Verification:** Create, review, search, add to mixed cart, and purchase a service without changing old product types.

### Task 7: Content re-review and cross-outlet integrity

**Files:**
- Modify: product, outlet, voucher, and outlet-page update routes
- Modify: `supabase/migrations/<timestamp>_commerce_vendor_enhancements.sql`
- Test: review transition and ownership tests

**Work:** Reset approved content to `pending_review` on content changes, preserve operational updates, and add database constraints/triggers for vendor/outlet/product/slot/variant/voucher relationships.

**Verification:** Confirm changed approved content is hidden until review; confirm valid cross-outlet data still works and invalid combinations fail.

### Task 8: Vendor KYC additions

**Files:**
- Modify: `components/vendor/register-vendor-form.tsx`
- Modify: `app/customer/profile/register-vendor/page.tsx`
- Modify: `app/admin/vendors/page.tsx`
- Create: vendor document upload/list/review API routes
- Modify: Supabase Storage policies
- Test: KYC RLS and status transition tests

**Work:** Keep the current registration and approval flow, add legal/contact fields, private supporting documents, `needs_information`, admin checklist, signed URLs, and audit events.

**Verification:** Vendor can submit/update own application; admin can review; customer cannot read documents.

### Task 9: Recommendation invitation and claim

**Files:**
- Modify: `app/api/admin/recommendations/review/route.ts`
- Modify: `app/api/admin/vendors/link-recommendation/route.ts`
- Create: invitation and claim routes/components
- Test: recommendation lifecycle tests

**Work:** Preserve current statuses and records, add invite/claim/converted transitions, expiry, duplicate matching, and notifications.

**Verification:** Approved recommendation can be claimed once and linked to the resulting vendor.

### Task 10: Voucher bulk errors and analytics funnel

**Files:**
- Modify: `app/api/vendors/[vendorId]/vouchers/bulk/route.ts`
- Modify: `app/vendor/vouchers/page.tsx`
- Modify: analytics API and dashboard components
- Test: CSV row validation and analytics tests

**Work:** Return row-level errors and add voucher events/unique customer/net revenue metrics without removing current analytics.

**Verification:** Upload mixed-validity CSV and confirm successful rows, failed rows, and downloadable errors.

### Task 11: Advanced Shop Builder enhancements

**Files:**
- Modify: existing `components/vendor/outlet-page-builder.tsx`
- Modify: existing `components/vendor/outlet-builder-canvas.tsx`
- Modify: `lib/vendor/outlet-page-schema.ts`
- Test: existing builder history/editing/UI tests plus new layout tests

**Work:** Preserve existing section drag-and-drop and device preview. Add containers, columns, direct canvas drop, resize/alignment, duplicate/copy/paste, and optional per-device overrides with schema versioning.

**Verification:** Existing draft/publish/autosave/undo tests remain green; desktop and mobile render the same content without layout corruption.

### Task 12: P2 lifecycle, digital delivery, vendor brand, and SEO

**Files:**
- Create additive refund/reschedule/digital-entitlement migrations and routes
- Modify customer order/booking pages
- Create vendor brand and outlet-switcher routes/components
- Modify outlet page metadata generation
- Test: refund, access expiry, routing, and metadata tests

**Work:** Add these capabilities without changing existing order, booking, digital metadata, or outlet-page records.

**Verification:** Run end-to-end scenarios for cancellation/refund, signed download expiry, vendor-to-outlet navigation, and draft noindex/published SEO metadata.

### Task 13: Supabase hardening and final verification

**Files:**
- Modify: migration policies/indexes/functions identified by advisors
- Modify: `package.json` scripts only if a verification command is needed
- Test: full repository test suite and remote smoke scripts

**Work:** Resolve safe RLS init-plan and duplicate-policy findings, retain indexes needed by actual queries, remove only confirmed-unused indexes, and verify privileged functions/storage policies.

**Verification commands:**

```bash
npm test
npx tsc --noEmit
npm run build
npm run verify:remote-demo
npm run verify:remote-scenarios
```

Expected result: tests pass, TypeScript passes, build passes or reports only the known external font-fetch limitation, and remote scenarios confirm no duplicate order, no over-capacity booking, correct Stripe/payment status, correct voucher limits, and correct vendor/customer access.
