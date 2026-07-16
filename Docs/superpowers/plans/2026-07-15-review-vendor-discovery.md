# Review and Vendor Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with verification checkpoints.

**Goal:** Show real review content with complete pagination, make vendor shops easy to visit, keep vendor edits visible on the public shop page, add vendor filtering to search, and keep Calendar beside the date-and-time label.

**Architecture:** Extend the catalogue DTO with vendor names from the existing outlet-to-vendor relation. Fetch a small review preview server-side, expose a public paginated review endpoint, and use a client review dialog for complete browsing. Use one outlet shop URL helper across activity cards, activity details, and the vendor builder. Keep `hero_url` as the single public Hero image source and synchronize legacy Hero block data when saving. Add `vendorId` to search filters and pass vendor options from the server to the existing search client. Keep Calendar in the booking section header and render exactly three date buttons without horizontal scrolling.

**Tech Stack:** Next.js App Router, React, TypeScript, Supabase, Tailwind CSS, Vitest.

## Global Constraints

- Preserve existing cart, booking-slot, review metric, and search behavior.
- Do not change Supabase schema or payment/inventory logic in this task.
- Read reviews only when `is_visible = true`; do not expose email addresses.
- Review pages use five items by default and expose only visible review content.
- The public shop page is outlet-scoped at `/customer/outlet/[outletId]`.
- Do not modify unrelated pre-existing working-tree changes.

---

### Task 6: Add review pagination and complete-review browsing

**Files:**
- Create: `lib/customer/review-pagination.ts`
- Create: `lib/customer/__tests__/review-pagination.test.ts`
- Modify: `backend/domains/catalogue.ts`
- Create: `app/api/products/[productId]/reviews/route.ts`
- Create: `components/customer/activity-reviews.tsx`
- Modify: `app/customer/activity/[id]/activity-detail-client.tsx`

- [x] **Step 1: Write and run failing pagination boundary tests.**
- [x] **Step 2: Implement the page-state helper and paginated Supabase query.**
- [x] **Step 3: Add the public visible-review API route with page and pageSize validation.**
- [x] **Step 4: Add the review preview and accessible full-review dialog.**
- [x] **Step 5: Run the focused review tests and confirm the complete-review flow compiles.**

### Task 7: Make shop discovery and Hero editing consistent

**Files:**
- Create: `lib/customer/shop-navigation.ts`
- Create: `lib/customer/__tests__/shop-navigation.test.ts`
- Create: `lib/vendor/outlet-page-builder.ts`
- Create: `lib/vendor/__tests__/outlet-page-builder.test.ts`
- Modify: `components/customer/activity-card.tsx`
- Modify: `app/customer/activity/[id]/activity-detail-client.tsx`
- Modify: `components/vendor/outlet-page-builder.tsx`
- Modify: `app/customer/outlet/[outletId]/page.tsx`

- [x] **Step 1: Write and run failing shop-link and Hero-sync tests.**
- [x] **Step 2: Add one outlet shop URL helper and use it in customer/vendor surfaces.**
- [x] **Step 3: Refactor activity cards so `Visit shop` is a real link without nested anchors.**
- [x] **Step 4: Make the Hero image source single-owner and add an `Open public shop` action after save.**
- [x] **Step 5: Force the public outlet page to read fresh saved data.**
- [x] **Step 6: Run the focused tests and review the rendered data flow.**

---

### Task 1: Add testable review and vendor presentation contracts

**Files:**
- Modify: `backend/core/types.ts`
- Create: `backend/domains/review-presenter.ts`
- Create: `backend/domains/__tests__/review-presenter.test.ts`

- [ ] **Step 1: Write failing tests** for first-name masking and review fallback text.
- [ ] **Step 2: Run the focused test and confirm it fails because the presenter does not exist.**
- [ ] **Step 3: Implement the presenter and `ProductReview` type.**
- [ ] **Step 4: Re-run the focused test and confirm it passes.**

### Task 2: Load vendor names and product review content

**Files:**
- Modify: `backend/core/types.ts`
- Modify: `backend/domains/catalogue.ts`
- Modify: `app/customer/activity/[id]/page.tsx`

- [ ] **Step 1: Include `vendors(name,status)` in the outlet query and expose `vendorName` on the outlet DTO.**
- [ ] **Step 2: Add `getProductReviews(productId, db)` selecting visible review content and reviewer display names.**
- [ ] **Step 3: Fetch reviews in the server activity page and pass them to the client detail component.**
- [ ] **Step 4: Run TypeScript and focused domain tests.**

### Task 3: Render reviews and vendor identity

**Files:**
- Modify: `app/customer/activity/[id]/activity-detail-client.tsx`
- Modify: `components/customer/activity-card.tsx`

- [ ] **Step 1: Add `By {vendorName}` to activity cards.**
- [ ] **Step 2: Add vendor name/outlet context to the activity detail heading.**
- [ ] **Step 3: Render a `What guests say` section with up to three reviews, verified purchase labels, and an empty state.**
- [ ] **Step 4: Preserve the booking panel and place Calendar beside `Choose a date and time`; replace the date rail with a fixed three-column preview.**

### Task 4: Add vendor filtering to Search & Filter

**Files:**
- Modify: `backend/domains/catalogue.ts`
- Modify: `app/customer/search/page.tsx`
- Modify: `app/customer/search/search-client.tsx`

- [ ] **Step 1: Add optional `vendorId` to `SearchFilters` and filter computed activities by vendor ID.**
- [ ] **Step 2: Load approved vendors on the server and pass them to the search client.**
- [ ] **Step 3: Add an `All vendors` selector and preserve vendor selection across other filters.**

### Task 5: Verify the complete change

- [x] **Step 1: Run `npm test`.**
- [x] **Step 2: Run `npx tsc --noEmit`.**
- [x] **Step 3: Run `npm run build`.**
- [x] **Step 4: Run targeted eslint and `git diff --check`.**
