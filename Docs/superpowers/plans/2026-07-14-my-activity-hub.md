# My Activity Hub Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Combine the customer Orders and Calendar entry points into one My Activity hub while keeping order receipts and booking itinerary responsibilities distinct.

**Architecture:** Keep `app/customer/orders/page.tsx` and `app/customer/calendar/page.tsx` as the Supabase-backed data views. Add a thin hub route at `/customer/activity` that selects the active view through a URL tab parameter, and update customer navigation and cross-links to use the hub. Calendar remains upcoming by default and exposes past bookings only through an explicit history action.

**Tech Stack:** Next.js App Router, React client components, TypeScript, Tailwind CSS, existing Supabase-backed domain functions, Vitest.

## Global Constraints

- Preserve existing Supabase data and existing Orders and Calendar data loaders.
- Do not introduce local mock data or new database tables.
- Keep `/customer/orders` and `/customer/calendar` working as compatibility routes.
- Keep order pagination, receipt links, booking filters, and calendar navigation intact.
- Use URL state for tab/history selection so refresh and back/forward navigation remain predictable.

---

### Task 1: Add the My Activity hub route

**Files:**
- Create: `app/customer/activity/page.tsx`
- Modify: `app/customer/orders/page.tsx:100-132`
- Modify: `app/customer/calendar/page.tsx:100-120`
- Test: `lib/customer/__tests__/activity-navigation.test.ts`

**Interfaces:**
- The hub accepts `searchParams.tab` with `itinerary` or `orders`; default is `itinerary`.
- The hub accepts `searchParams.history=true` to open the itinerary's past-bookings state.
- Existing page components remain the owners of their Supabase data loading.

- [ ] **Step 1: Write a failing test** for allowed tab/history query state and default itinerary behavior.
- [ ] **Step 2: Run the focused test and verify it fails** because the route state helper does not exist.
- [ ] **Step 3: Implement the minimal hub route and tab state helper** without changing Supabase queries.
- [ ] **Step 4: Run the focused test and verify it passes.**
- [ ] **Step 5: Render the existing Orders and Calendar views inside the hub with clear tab labels.**

### Task 2: Update customer navigation and cross-links

**Files:**
- Modify: `app/customer/layout.tsx:1-30`
- Modify: `app/customer/orders/page.tsx` order header and booking CTA
- Modify: `app/customer/calendar/page.tsx` header and history CTA
- Modify: `app/customer/orders/[id]/page.tsx:90-110`

**Interfaces:**
- Customer navigation exposes one `My Activity` item pointing to `/customer/activity?tab=itinerary`.
- Itinerary links to `/customer/activity?tab=orders` for order details/history.
- Orders links to `/customer/activity?tab=itinerary` for bookings.

- [ ] **Step 1: Add navigation regression assertions** for one My Activity entry and both tab destinations.
- [ ] **Step 2: Run the focused test and verify the current navigation fails the new contract.**
- [ ] **Step 3: Update labels, links, and button copy** while preserving vendor navigation.
- [ ] **Step 4: Run the focused test and verify it passes.**

### Task 3: Add explicit booking history behavior

**Files:**
- Modify: `app/customer/calendar/page.tsx:25-120`
- Modify: `app/customer/activity/page.tsx`
- Test: `lib/customer/__tests__/activity-navigation.test.ts`

**Interfaces:**
- The default itinerary scope is `upcoming`.
- `View booking history` navigates to `/customer/activity?tab=itinerary&history=true`.
- The history view uses the existing `past` booking scope and offers `Back to upcoming`.

- [ ] **Step 1: Add a failing test** for the history URL and the upcoming/history labels.
- [ ] **Step 2: Run it and verify it fails before the UI change.**
- [ ] **Step 3: Implement URL-driven history state** and keep all existing filters, calendar/list views, and Supabase realtime subscriptions intact.
- [ ] **Step 4: Run focused tests, full Vitest, TypeScript, and production build.**

### Task 4: Verify the Supabase-backed customer flow

**Files:**
- No schema changes.
- Verify: `app/customer/orders/page.tsx`, `app/customer/calendar/page.tsx`, `app/customer/activity/page.tsx`

- [ ] **Step 1: Start or reuse the local Next.js server.**
- [ ] **Step 2: Confirm the hub, orders, and calendar routes return successfully.**
- [ ] **Step 3: Confirm existing Supabase-backed totals and records render without local fallback data.**
- [ ] **Step 4: Run `npm test -- --run`, `npx tsc --noEmit`, `npm run build`, and `git diff --check`.**
