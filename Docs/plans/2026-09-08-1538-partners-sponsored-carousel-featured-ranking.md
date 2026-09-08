# Partners Sponsored Carousel and Featured Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Implemented and verified locally; linked-database migration deployment pending

**Goal:** Replace the Partners page’s featured-vendor block with a filter-aware sponsored advertisement rail, identify every approved vendor as a verified local partner, and make featured-first the default directory order with usable view and sort controls.

**Architecture:** Reuse the existing sponsored placement table, deterministic `rankDiscoveryResults` helper, activity images, event endpoint, and existing vendor recommendation ranking. The server page projects only active placement fields to the client; a focused rail component owns horizontal navigation and visible-impression tracking, while a pure directory helper owns featured filtering and sorting.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Supabase/PostgreSQL RLS, TailwindCSS, react-i18next, Vitest.

## Global Constraints

- Preserve the existing customer shell, brand tokens, vendor/activity routes, trusted image helpers, and responsive card language.
- Reuse `sponsored_discovery_placements`; add only the approved public-projection security migration, with no API route or vendor-level campaign model.
- A Sponsored badge means paid placement; a Verified local partner badge means approved vendor status; featured is only a directory ranking/filter signal.
- Sponsored cards open `/customer/activity/[id]`; vendor cards continue opening `/customer/vendor/[id]`.
- Search, state, and category criteria affect both advertisements and vendors; partner-view and sort controls affect vendors only.
- The rail never auto-rotates and is fully usable with touch, trackpad, mouse buttons, and keyboard focus.
- Add no dependency and do not refactor unrelated legacy discovery code.
- Translation coverage must remain complete for English, Simplified Chinese, and Bahasa Melayu.

## Existing Implementation and Scope

Reuse:

- `app/customer/partners/page.tsx`: approved vendor/activity/recommendation loading.
- `app/customer/search/search-client.tsx`: Partners state, filters, vendor cards, and pagination.
- `lib/customer/discovery-ranking.ts`: campaign eligibility, scope, priority, limit, and de-duplication.
- `app/api/sponsored-placements/[id]/events/route.ts`: public validated impression/click events.
- `lib/customer/place-activity.ts` and `lib/customer/vendor-visual.ts`: trusted images.
- `components/customer/discovery-filters.tsx`: search/category controls.

Create:

- `lib/customer/partner-directory.ts`: pure advertisement input filtering and vendor directory ordering.
- `lib/customer/__tests__/partner-directory.test.ts`: pure helper coverage.
- `components/customer/sponsored-partner-rail.tsx`: sponsored card rail, scroll controls, and analytics triggers.
- `components/customer/__tests__/sponsored-partner-rail.test.tsx`: rail interaction/render contract.
- `supabase/migrations/20260908162000_sponsored_public_projection.sql`: safe public placement RPC and base-table read hardening.
- `supabase/migrations/__tests__/20260908162000_sponsored_public_projection.test.ts`: security contract for that forward migration.

Modify:

- `app/customer/partners/page.tsx`
- `app/customer/search/search-client.tsx`
- `app/customer/search/__tests__/search-contract.test.ts`
- `app/customer/search/__tests__/featured-vendor-filtering.test.ts`
- `app/customer/search/__tests__/vendor-card-sizing.test.ts`
- `app/customer/search/__tests__/partners-viewport-spacing.test.ts`
- `app/customer/explore/explore-client.tsx`
- `supabase/migrations/__tests__/canonical-history.test.ts`
- `app/i18n/locales/en/customer.json`
- `app/i18n/locales/ms/customer.json`
- `app/i18n/locales/zh-CN/customer.json`
- `design-qa.md` only for the final same-viewport visual comparison report.
- This plan for checkmarks and evidence.

Files not touched:

- unrelated `supabase/migrations/**`
- `app/admin/sponsored-placements/**`
- vendor, outlet, activity detail, cart, checkout, and payment flows
- Home and Explore discovery presentation
- shared global design tokens or dependency manifests

New dependencies: none.

Database changes: one forward-only security migration; no table shape or campaign lifecycle change.

Primary risks:

- exposing unnecessary campaign/audit fields to the browser;
- firing impressions for off-screen or repeatedly rendered cards;
- confusing paid, featured, and verified labels;
- paginating before applying featured-only filtering/sorting;
- changing existing personalized ranking semantics.

---

### Task 1: Pure partner-directory ranking and advertisement filtering

**Files:**

- Create: `lib/customer/partner-directory.ts`
- Create: `lib/customer/__tests__/partner-directory.test.ts`

**Interfaces:**

- Consumes: `VendorSummary`, `ComputedActivity`, `DiscoveryResult`, `SponsoredPlacement`, `rankDiscoveryResults`, and `canonicalCategorySlug`.
- Produces:

```ts
export type PartnerView = "all" | "featured";
export type PartnerSort = "featured" | "name" | "outlets";

export function rankPartnerDirectory<T extends Pick<VendorSummary, "id" | "name" | "outlets">>(input: {
  vendors: T[];
  featuredVendorIds: ReadonlySet<string>;
  view: PartnerView;
  sort: PartnerSort;
}): T[];

export function selectPartnerAdvertisements(input: {
  activities: ComputedActivity[];
  placements: SponsoredPlacement[];
  query: string;
  state: string | null;
  category: string | null;
  now: string;
}): DiscoveryResult[];
```

- [x] **Step 1: Write failing pure helper tests**

Create fixtures for three vendors and sponsored/organic activities. Assert featured-first, featured-only, A–Z, and outlet-count ordering. Add advertisement assertions that query, outlet state, and canonical category remove mismatches before `rankDiscoveryResults`, while approved effective matching placements retain priority order and sponsorship metadata.

- [x] **Step 2: Run the helper test RED**

Run `npx vitest run lib/customer/__tests__/partner-directory.test.ts`.

Expected: FAIL because `partner-directory.ts` does not exist.

- [x] **Step 3: Implement the pure helper**

Implement featured-first ordering as featured membership descending followed by `name.localeCompare`, name sorting by `name.localeCompare`, and outlet sorting by count descending then name. Filter to featured IDs before sorting when `view === "featured"`; never mutate the input array.

For advertisements, normalize the query, filter activities against product name/description, vendor name, city/state, selected state, and canonical activity category. Then call `rankDiscoveryResults` with a complete `DiscoveryQuery` built from the current query/state/category and return only sponsored results.

- [x] **Step 4: Run the helper test GREEN**

Run:

```bash
npx vitest run lib/customer/__tests__/partner-directory.test.ts lib/customer/__tests__/discovery-ranking.test.ts
```

Expected: both files pass, including the existing maximum-four and deterministic-priority contracts.

---

### Task 1A: Harden the public sponsored-placement projection

**Files:**

- Create: `supabase/migrations/20260908162000_sponsored_public_projection.sql`
- Create: `supabase/migrations/__tests__/20260908162000_sponsored_public_projection.test.ts`
- Modify: `supabase/migrations/__tests__/canonical-history.test.ts`
- Modify: `app/customer/explore/explore-client.tsx`

**Interfaces:**

- Produces: `list_active_sponsored_discovery_placements()` returning exactly `id, product_id, state, category_slug, starts_at, ends_at, priority, status`.
- Preserves: Staff base-table reads through the existing `sponsored_discovery_placements_staff_read` RLS policy and all existing event API/RPC validation.

- [x] **Step 1: Write the failing migration security contract**

Assert the migration revokes public base-table SELECT, drops the public active-row policy, grants authenticated SELECT only for Staff RLS evaluation, creates a no-argument STABLE `SECURITY DEFINER` RPC with a fixed search path and exact eight-column return, filters approved/effective rows internally, and grants execute to anon/authenticated. Assert no internal review/audit column appears in the function return or SELECT list.

- [x] **Step 2: Run the migration contract RED**

Run `npx vitest run supabase/migrations/__tests__/20260908162000_sponsored_public_projection.test.ts supabase/migrations/__tests__/canonical-history.test.ts`.

Expected: FAIL because the forward migration does not exist.

- [x] **Step 3: Implement the security migration and canonical history entry**

Create the RPC, revoke anon/authenticated direct reads, re-grant authenticated base SELECT so only the existing Staff RLS policy can return rows, and add the migration filename to `approvedForwardMigrations`.

- [x] **Step 4: Switch Explore to the safe RPC**

Replace its direct `.from("sponsored_discovery_placements").select(...)` chain with `.rpc("list_active_sponsored_discovery_placements")`; preserve the same mapped `SponsoredPlacement` shape and empty-on-error behaviour.

- [x] **Step 5: Run the security contract GREEN**

Run the new migration contract, canonical history, existing sponsored migration/workflow tests, discovery ranking tests, and Explore contract tests.

---

### Task 2: Server-sponsored projection and horizontal advertisement rail

**Files:**

- Modify: `app/customer/partners/page.tsx`
- Create: `components/customer/sponsored-partner-rail.tsx`
- Create: `components/customer/__tests__/sponsored-partner-rail.test.tsx`
- Modify: `app/customer/search/__tests__/search-contract.test.ts`

**Interfaces:**

- Consumes: `SponsoredPlacement`, `DiscoveryResult`, `getPlaceActivityImage`, existing sponsored event API, and translated customer keys.
- Produces:

```ts
export function SponsoredPartnerRail({ advertisements }: {
  advertisements: DiscoveryResult[];
}): React.JSX.Element | null;
```

`SearchClient` gains `sponsoredPlacements: SponsoredPlacement[]`.

- [x] **Step 1: Write failing server and rail tests**

Update the Partners contract to require `rpc("list_active_sponsored_discovery_placements")`. Assert the server maps the exact safe snake_case rows to `SponsoredPlacement` and passes no audit/event data.

Create the component test with mocked `IntersectionObserver`, `Element.prototype.scrollBy`, translation, and `fetch`. Assert empty hiding, Sponsored card content, activity route, horizontal snap classes, previous/next movement, one visible impression, and exact click event JSON.

- [x] **Step 2: Run the server/rail tests RED**

Run:

```bash
npx vitest run app/customer/search/__tests__/search-contract.test.ts components/customer/__tests__/sponsored-partner-rail.test.tsx
```

Expected: FAIL because the prop, server query, and rail do not exist.

- [x] **Step 3: Add the safe server projection**

In `PartnersPage`, compute one `requestedAt` timestamp and add `db.rpc("list_active_sponsored_discovery_placements")` to the existing `Promise.all`. Map only the eight returned fields into `SponsoredPlacement`. Treat an RPC error as an empty list so advertising failure never breaks the organic directory.

- [x] **Step 4: Build the rail component**

Use a semantic section with a translated heading and a `flex snap-x snap-mandatory gap-5 overflow-x-auto` viewport. Cards use a name-card-like minimum width, existing activity images, library icons, and an explicit Sponsored badge.

Use `IntersectionObserver` at a `0.5` threshold and a `Set<string>` ref to record each placement impression once. Reuse `/api/sponsored-placements/[id]/events`; analytics failures are ignored. Previous/next controls call `scrollBy` with approximately 80% of the viewport width and expose translated labels.

- [x] **Step 5: Connect the rail to `SearchClient`**

Add `sponsoredPlacements` to the props and compute advertisements with `selectPartnerAdvertisements`. Render the rail where the old featured-vendor grid appeared. Pass current query, state, category, and one stable mount-time ISO timestamp. Remove only the old featured grid; keep `recommendedVendors` because it drives featured directory ranking.

- [x] **Step 6: Run the server/rail tests GREEN**

Run:

```bash
npx vitest run app/customer/search/__tests__/search-contract.test.ts components/customer/__tests__/sponsored-partner-rail.test.tsx lib/customer/__tests__/partner-directory.test.ts
```

Expected: all pass; no campaign audit field or raw internal record is projected.

---

### Task 3: Verified badge, featured filter, default ranking, and translations

**Files:**

- Modify: `app/customer/search/search-client.tsx`
- Modify: `app/customer/search/__tests__/featured-vendor-filtering.test.ts`
- Modify: `app/customer/search/__tests__/vendor-card-sizing.test.ts`
- Modify: `app/customer/search/__tests__/partners-viewport-spacing.test.ts`
- Modify: `app/i18n/locales/en/customer.json`
- Modify: `app/i18n/locales/ms/customer.json`
- Modify: `app/i18n/locales/zh-CN/customer.json`

**Interfaces:**

- Consumes: `rankPartnerDirectory`, `PartnerView`, `PartnerSort`, and `recommendedVendors`.
- Produces: an ordered, filtered, then paginated vendor directory; no new shared interface.

- [x] **Step 1: Update tests to describe the new directory**

Replace the obsolete “featured section only when no query” contract with assertions for a featured ID set, `partnerView` default `all`, `partnerSort` default `featured`, ranking before page slicing, page reset on controls, translated options, the verified-local-partner badge, absence of the old featured grid, and equal-height responsive vendor cards.

- [x] **Step 2: Run the directory contract tests RED**

Run:

```bash
npx vitest run app/customer/search/__tests__/featured-vendor-filtering.test.ts app/customer/search/__tests__/vendor-card-sizing.test.ts app/customer/search/__tests__/partners-viewport-spacing.test.ts
```

Expected: FAIL on the missing state, controls, ranking call, and translation key.

- [x] **Step 3: Implement featured-first directory behaviour**

Add partner view/sort state and a memoized featured vendor ID set from `recommendedVendors`. Apply query/state/category filtering first, call `rankPartnerDirectory`, then calculate pages and slice. Put two labelled selects above the results grid. Reset `currentPage` in every view/sort handler.

- [x] **Step 4: Change the vendor trust badge**

Keep the shield icon and visual placement, but render `t("ui.search.verifiedLocalPartner")` on every approved `VendorDirectoryCard`. Do not add Sponsored or Featured badges to organic vendor cards.

- [x] **Step 5: Add complete three-locale copy**

Add equivalent `ui.search` strings for sponsored recommendations/description, verified local partner, partner view, all/featured-only, partner sorting, featured-first/name/outlet-count, and previous/next advertisement. Provide natural Simplified Chinese and Bahasa Melayu translations.

- [x] **Step 6: Run directory and i18n tests GREEN**

Run:

```bash
npx vitest run app/customer/search/__tests__/featured-vendor-filtering.test.ts app/customer/search/__tests__/vendor-card-sizing.test.ts app/customer/search/__tests__/partners-viewport-spacing.test.ts app/customer/__tests__/sitewide-i18n.contract.test.ts
npm run verify:i18n
```

Expected: all focused tests pass and all three locale files retain complete coverage.

---

### Task 4: Final verification and visual QA

**Files:**

- Modify: `design-qa.md`
- Modify: this plan for status, checkmarks, and evidence.
- Modify production files only if a confirmed blocking defect is found.

- [x] **Step 1: Run focused functional verification**

Run once after the final code change:

```bash
npx vitest run \
  lib/customer/__tests__/partner-directory.test.ts \
  lib/customer/__tests__/discovery-ranking.test.ts \
  components/customer/__tests__/sponsored-partner-rail.test.tsx \
  components/customer/__tests__/activity-card.test.ts \
  'app/api/sponsored-placements/[id]/events/__tests__/route.test.ts' \
  app/customer/search/__tests__ \
  app/customer/__tests__/sitewide-i18n.contract.test.ts
```

Expected: all focused files pass.

- [x] **Step 2: Run repository checks**

```bash
npx tsc --noEmit
npm run lint
npm run verify:i18n
git diff --check
```

Expected: TypeScript and i18n pass; lint has zero errors. Record unrelated pre-existing warnings without expanding scope.

- [x] **Step 3: Perform the required bounded independent review**

Use `luna_worker` for a read-only check that the page projects no campaign audit/internal fields, cannot record events for a mismatched product, keeps Sponsored and Verified labels distinct, and does not weaken existing event API validation. Fix only confirmed authorization/privacy/core-flow failures.

- [ ] **Step 4: Verify the live page in the existing browser**

Open `/customer/partners` in the browser selected by the current Product Design context. At the reference desktop viewport and one narrow/mobile viewport, verify the sponsored rail, controls, routes, badges, filtering, sorting, pagination reset, and absence of console errors.

- [x] **Step 5: Complete blocking design QA**

Capture the reference screenshot and implemented page at the same desktop viewport/state. Write `design-qa.md` with severity-ranked differences. Fix P0/P1/P2 findings once, recapture, and set exactly `final result: passed` only when layout, card density, horizontal affordance, labels, spacing, and responsive behaviour pass. Record P3 polish as follow-up.

- [x] **Step 6: Record evidence and hand off**

Update this plan’s status/checkmarks with exact commands and outcomes. Report the working local Partners URL, major visible changes, test results, pre-existing warnings, and any absence of approved live campaign data that prevented a populated rail smoke test.

## Verification Evidence

- Focused suite after the final code change: `12` files, `172` tests passed.
- Focused rail suite after the edge-control repair: `5/5` passed.
- Final independent re-review: passed; the only original must-fix (scroll-edge disabling) is closed and no new authorization, privacy, data-loss, or core-flow issue was found.
- `npm run lint`: passed with `0` errors and `67` unrelated pre-existing warnings; changed production/test files have no lint findings.
- `npm run verify:i18n`: passed with `100%` English, Simplified Chinese, and Bahasa Melayu coverage; the repository still reports `38` unrelated punctuation warnings.
- `git diff --check`: passed.
- `npx tsc --noEmit`: passed before concurrent workspace files appeared. The final rerun is blocked only by the unrelated untracked `scripts/__tests__/vendor-account-demo.test.ts`, whose inferred fixture arrays are currently typed as `never[]`; this task does not modify that concurrent work.
- Chrome browser verification at `1904 x 1060`: default Featured first, Name A–Z, Featured only, pagination reset, and Verified local partner badges were exercised. The final light-theme default-state capture passed design QA.
- The narrow/mobile browser pass and populated advertisement smoke test remain unavailable in this run: the current browser surface exposes no viewport override, and the connected database has zero sponsored placement records. Responsive layout and populated rail behavior are covered by focused contracts/component tests.
- `npx --yes supabase@latest migration list` did not return before the bounded timeout, so `20260908162000_sponsored_public_projection.sql` was not pushed. It must be deployed together with the application change before sponsored records are enabled.
