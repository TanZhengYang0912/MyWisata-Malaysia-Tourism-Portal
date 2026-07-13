# Vendor Requirements Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the confirmed 4.1–4.4 vendor requirements using additive Supabase-backed changes and realistic demo data.

**Architecture:** Preserve the current Next.js/Supabase architecture. Enforce outlet-scoped authorization for both vendor owners and outlet managers, keep the existing atomic inventory and voucher RPCs, and extend the guarded deterministic remote seed with upserts only. UI fixes will consume Supabase data directly and reuse existing vendor components.

**Tech Stack:** Next.js 16, React 19, TypeScript, Supabase JS/Postgres, Supabase Realtime, Vitest, ESLint.

## Global Constraints

- Never delete, truncate, reset, or overwrite existing Supabase demo data.
- Use stable IDs and `upsert`/conflict-safe inserts for new demo rows.
- Both `vendor_owner` and `outlet_manager` may manage product, pricing, and operating hours within their assigned outlet scope.
- Stripe remains demo-only; do not add a real checkout-session/webhook dependency.
- Preserve existing order paging, order images, print receipt, and booking Demo QR behavior.

### Task 1: Baseline and authorization scope

**Files:**
- Modify: `lib/vendor-authorization.ts`
- Modify: `app/api/vendors/[vendorId]/products/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/variants/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/variants/[variantId]/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/price-rules/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/price-rules/[ruleId]/route.ts`
- Modify: `app/api/vendors/[vendorId]/outlets/[outletId]/route.ts`
- Modify: `app/vendor/products/page.tsx`
- Modify: `app/vendor/outlets/page.tsx`

**Interfaces:** All mutation routes must use the selected outlet scope and return `403` for an unassigned outlet. Both roles remain allowed for their assigned outlet.

- [ ] Inspect the current authorization helper and each mutation route for vendor-only or manager-only branches.
- [ ] Add one shared outlet-scope authorization path for product, variant, price-rule, and operating-hour mutations.
- [ ] Update UI labels and guards so outlet managers see the controls they are authorized to use, without exposing other outlets.
- [ ] Add focused tests for owner allow, assigned-manager allow, and unassigned-manager deny.
- [ ] Run targeted tests and TypeScript.

### Task 2: Shop page data normalization and block completeness

**Files:**
- Modify: `components/vendor/outlet-page-builder.tsx`
- Modify: `app/api/vendors/[vendorId]/outlets/[outletId]/page/route.ts`
- Modify: `app/customer/outlet/[outletId]/page.tsx`

**Interfaces:** Persist gallery items as `{ url: string; alt: string }[]`; render block images from the same normalized image field; retain `blocks`, featured products, SEO, mobile preview, and drag ordering.

- [ ] Add API normalization for legacy string galleries and object galleries.
- [ ] Update the customer renderer to render gallery alt text and block image URLs consistently.
- [ ] Render configured hours/contact/CTA blocks with their configured content instead of silently falling back to generic text.
- [ ] Verify approved public outlet pages still reject pending/rejected vendors.
- [ ] Add a renderer test for object gallery and image block data.

### Task 3: Pricing rule UI and stock alert UX

**Files:**
- Modify: `components/vendor/price-rule-manager.tsx`
- Modify: `app/vendor/dashboard/page.tsx`
- Modify: `components/vendor/dashboard-realtime.tsx`
- Modify: `app/vendor/products/page.tsx`

**Interfaces:** Price-rule creation must send `bundleProductIds`; dashboard stock alerts must show low-stock and out-of-stock variants from Supabase inventory and refresh on inventory changes.

- [ ] Add bundle-product selection to the existing price-rule form and preserve the current rule API contract.
- [ ] Add an outlet-scoped stock alert summary with threshold and quantity.
- [ ] Subscribe to inventory Realtime changes and refresh affected alerts without local mock data.
- [ ] Confirm atomic decrement and product auto-disable remain unchanged.
- [ ] Add tests for bundle payload and low-stock classification.

### Task 4: Voucher robustness and analytics seed support

**Files:**
- Modify: `components/vendor/voucher-form.tsx`
- Modify: `app/vendor/vouchers/page.tsx`
- Modify: `app/api/vendors/[vendorId]/vouchers/bulk/route.ts`
- Modify: `app/api/vouchers/validate/route.ts`
- Modify: `app/api/vendors/[vendorId]/vouchers/analytics/route.ts`

**Interfaces:** Generated codes must be unique within the database; CSV parsing must support quoted fields; BOGO/minimum-spend validation and analytics must continue using Supabase rows.

- [ ] Move code generation collision handling to a server-safe retry path.
- [ ] Replace line splitting with a small CSV parser that handles quoted commas and escaped quotes.
- [ ] Keep atomic redemption and add analytics labels that distinguish redemptions, capped usage, discount impact, and order revenue.
- [ ] Add tests for quoted CSV, generated-code retry, BOGO, and minimum spend.

### Task 5: Additive remote demo seed

**Files:**
- Modify: `scripts/seed-remote-demo.mjs`
- Modify: `scripts/verify-remote-demo.mjs`
- Modify: `package.json`

**Interfaces:** `REMOTE_DEMO_SEED=1 node scripts/seed-remote-demo.mjs` remains the guarded write entry point; the script must only insert/upsert stable demo rows and report counts.

- [ ] Add multiple approved vendor owners plus pending and rejected vendor records without altering existing vendors.
- [ ] Add assigned outlet managers and demo-account metadata/quick-entry mappings.
- [ ] Add digital products, all required product categories, price rules including bundle/tiered/peak/off-peak, populated shop-page blocks/gallery/featured IDs, and low-stock/out-of-stock variants.
- [ ] Add BOGO vouchers, minimum-spend vouchers, validity/cap examples, redemptions, and payment-method diversity across demo orders.
- [ ] Include order item image snapshots and booking Demo QR data where applicable without replacing existing rows.
- [ ] Add an npm script and verification output for idempotent execution.

### Task 6: Demo account quick entry

**Files:**
- Modify: `app/api/auth/demo-users/route.ts`
- Modify: `app/api/auth/demo-signin/route.ts`
- Modify: `app/*` demo account screen found during implementation

**Interfaces:** Demo users must remain Supabase-backed; the screen exposes one-click entry to each seeded vendor owner and a representative outlet manager.

- [ ] Inspect the existing demo-user response and sign-in contract.
- [ ] Add stable display names, role labels, vendor/outlet labels, and quick-entry actions.
- [ ] Keep credentials/session behavior unchanged and never expose service-role values.
- [ ] Add UI verification for multiple vendor choices.

### Task 7: Verification and Supabase smoke test

**Files:**
- Modify: `scripts/verify-remote-demo.mjs` if required by observed schema.

- [ ] Snapshot current row counts and key IDs before the seed.
- [ ] Run code checks: `npx tsc --noEmit`, targeted `npx eslint`, `npm test`, and `npm run build`.
- [ ] Run guarded seed against the configured Supabase project.
- [ ] Re-run verification and confirm counts only increased or remained stable, required branches exist, and existing QR/order data remains readable.
- [ ] Run `git diff --check` and summarize all changed files and Supabase verification results.
