# Vendor Operations Detail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Fix product saving, add Supabase-backed product media and availability workflows, seed useful data for every demo vendor, and make the vendor dashboard fully role-scoped and actionable.

**Architecture:** Keep the existing Next.js App Router and Supabase service-layer boundaries. Add small pure helpers for form normalization, dashboard aggregation, and seed allocation; keep authorization in existing vendor authorization functions. Store media in Supabase Storage and metadata in existing product/media tables, with only the minimum migration needed for review state and digital assets.

**Tech Stack:** Next.js 16, React, TypeScript, React Hook Form, Zod, Supabase JS/Storage/Postgres, Vitest, existing Tailwind UI.

## Global Constraints

- Never delete, truncate, reset, or overwrite unrelated Supabase records.
- Use deterministic IDs and additive upserts in demo seed scripts.
- Never expose Supabase service-role credentials to browser code.
- Keep Stripe in demo mode; do not implement production checkout/webhooks.
- Product content changes remain inactive and pending review until Admin approval.
- Verify every Supabase change with a remote query or verification script.

### Task 1: Product form validation and review workflow

**Files:**
- Modify: `components/vendor/product-form.tsx`
- Modify: `lib/validation/vendor-schemas.ts`
- Modify: `app/api/vendors/[vendorId]/products/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/route.ts`
- Test: `lib/validation/__tests__/vendor-product-form.test.ts`

**Steps:**

- [ ] Add a pure `normalizeProductTags(value: unknown): string[]` helper and tests for comma-separated strings, arrays, trimming, duplicate removal, empty values, and the 20-tag limit.
- [ ] Run the focused test and confirm it fails before the helper exists.
- [ ] Use the helper in a form-only schema or resolver preprocessing layer so validation sees an array before submit; keep the API schema strict with `tags: string[]`.
- [ ] Add separate `Save Draft` and `Submit for Review` actions. Draft saves inactive content without requiring a cover image; submit validates cover media and availability.
- [ ] Preserve field values after an error and map Zod field errors beside the relevant input.
- [ ] Run focused tests, TypeScript, and the product form interaction test.

### Task 2: Supabase Storage media and digital assets

**Files:**
- Create: `supabase/migrations/026_vendor_product_media.sql`
- Create: `app/api/vendors/[vendorId]/media/upload/route.ts`
- Create: `components/vendor/product-media-uploader.tsx`
- Modify: `components/vendor/product-form.tsx`
- Modify: `app/api/vendors/[vendorId]/products/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/route.ts`
- Test: `lib/validation/__tests__/vendor-media.test.ts`

**Steps:**

- [ ] Create the migration using the Supabase migration workflow, adding only required product media/digital asset columns or constraints and Storage policies scoped to authorized vendor users.
- [ ] Add a server upload route that checks vendor authorization, validates file type/size, writes to a vendor/product path, and returns the stored URL and metadata.
- [ ] Add the form uploader with preview, remove/replace, alt text, and accessible error states.
- [ ] Store cover URL on `products`, gallery metadata in `media_assets`, and digital asset metadata in the product record or the smallest dedicated table defined by the migration.
- [ ] Verify Storage and database rows against the remote Supabase project.

### Task 3: Product-type availability and stock-out behavior

**Files:**
- Modify: `components/vendor/product-form.tsx`
- Modify: `lib/validation/vendor-schemas.ts`
- Modify: `app/api/vendors/[vendorId]/products/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/route.ts`
- Modify: `app/api/vendors/[vendorId]/products/[productId]/variants/route.ts`
- Modify: existing atomic inventory RPC migration only if verification shows a missing transition
- Test: `lib/validation/__tests__/vendor-availability.test.ts`

**Steps:**

- [ ] Add type-aware availability validation: physical/F&B stock and threshold, activity/experience booking capacity and slot readiness, digital unlimited/download readiness.
- [ ] Create or update inventory rows with an explicit low-stock threshold for stock-backed types.
- [ ] Route stock changes through the existing atomic RPC and make zero available stock disable customer purchase without deleting the listing.
- [ ] Add tests for available, low-stock, reserved, and out-of-stock transitions.
- [ ] Verify the customer catalogue excludes out-of-stock purchasable items and the vendor dashboard shows the alert.

### Task 4: Remote demo data for additional vendors

**Files:**
- Modify: `scripts/seed-remote-demo.mjs`
- Modify: `scripts/verify-remote-demo.mjs`
- Test: `scripts/verify-remote-demo.mjs`

**Steps:**

- [ ] Extend the deterministic seed allocator so Batik and Borneo products receive 80 orders each distributed across both outlets.
- [ ] Include 7-day, 30-day, and 12-month timestamps, paid/completed/pending/cancelled statuses, all demo payment methods, booking slots, bookings, reviews, and recent transactions.
- [ ] Keep the existing Rasa records and use upsert only for new deterministic IDs.
- [ ] Add verification output per vendor for outlets, products, paid order items, bookings, reviews, and recent-period activity.
- [ ] Run the remote seed and verification script and record counts without exposing credentials.

### Task 5: Role-scoped vendor dashboard and filters

**Files:**
- Modify: `lib/vendor-dashboard.ts`
- Modify: `app/vendor/dashboard/page.tsx`
- Modify: `components/vendor/dashboard-filter.tsx`
- Modify: `components/vendor/sales-chart.tsx`
- Modify: `components/vendor/recent-transactions.tsx`
- Modify: `app/vendor/vouchers/page.tsx`
- Modify: `app/api/vendors/[vendorId]/vouchers/analytics/route.ts`
- Test: `lib/vendor-dashboard.test.ts`

**Steps:**

- [ ] Keep every dashboard query constrained to verified outlet IDs; add owner outlet filter and manager locked outlet scope.
- [ ] Show revenue, orders, sales trend, top products, bookings, stock alerts, and recent transactions to managers using their assigned outlet scope.
- [ ] Add custom date range support with explicit active-period empty states and next-action links.
- [ ] Add outlet/date voucher analytics with redemption rate and revenue impact using vendor-scoped data.
- [ ] Add pure aggregation tests for owner, manager, empty period, and multi-outlet totals.

### Task 6: Verification and handoff

**Files:**
- Modify: `scripts/verify-remote-demo.mjs`
- Modify: focused tests and docs only as needed

**Steps:**

- [ ] Run focused TDD tests and the full test suite.
- [ ] Run `npx tsc --noEmit` and `npm run build`.
- [ ] Run targeted lint on changed files and separately report any pre-existing full-lint failures.
- [ ] Run remote Supabase verification for product media, product states, inventory alerts, per-vendor orders, bookings, reviews, and dashboard periods.
- [ ] Run `git diff --check` and inspect `git status --short`; do not stage or commit unless requested.
