# Sponsored Targeting and Priority Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn sponsored placements into a governed four-position system with mature state/category targeting, deterministic customer ranking, creator and approver impact previews, atomic collision handling, and bounded paused-history display.

**Architecture:** Keep the existing `sponsored_discovery_placements` table, APIs, audit trigger, and safe public RPC. Add one migration that tightens positions to 1–4 and centralizes preview/approval ordering in transactional database functions. Share targeting semantics in a small TypeScript module, expose a dedicated preview endpoint, and extend the existing Admin page with confirmation dialogs and lifecycle filters instead of creating a second campaign system.

**Tech Stack:** Next.js 16 App Router, TypeScript, React, Zod, Supabase/PostgreSQL PL/pgSQL, Vitest, Testing Library, TailwindCSS, next-intl JSON messages.

## Global Constraints

- Position `1` is highest priority and valid positions are exactly `1`, `2`, `3`, or `4`.
- Customer pages return at most four unique sponsored products.
- Specificity order is exact state + exact category, exact state + all categories, all Malaysia + exact category, then all Malaysia + all categories.
- A draft never changes live placement order; position shifts, overflow pause, and paused-history archival occur only during approval.
- Creator and approver both receive a server-calculated impact preview; approval rejects a stale preview token.
- The campaign creator cannot approve their own campaign.
- Only the two most recently paused campaigns appear in the default Admin list; older paused campaigns become archived and remain auditable.
- Public sponsorship data continues to use the safe projection and must not reveal review notes, staff identities, audit details, or internal storage paths.
- No new package dependency, auction, budget, pacing, frequency-cap, vendor-level campaign, or unrelated Admin refactor is included.
- Existing uncommitted user work is preserved and excluded from feature commits.

---

### Task 1: Shared Targeting and Customer Ranking

**Files:**
- Create: `lib/sponsored-placements/targeting.ts`
- Create: `lib/sponsored-placements/__tests__/targeting.test.ts`
- Modify: `lib/customer/discovery-ranking.ts`
- Modify: `lib/customer/__tests__/discovery-ranking.test.ts`
- Modify: `backend/core/types.ts`

**Interfaces:**
- Produces: `SponsoredTarget`, `SponsoredRequestContext`, `getSponsoredSpecificity(target, request): number | null`, `compareEligibleSponsoredPlacements(a, b, request): number`.
- Preserves: `SponsoredPlacement.priority` as the database field for compatibility, while treating it as a one-based display position sorted ascending.
- Extends: `SponsoredPlacement.status` with `"archived"`; archived items are never customer-eligible.

- [ ] **Step 1: Write failing targeting tests**

```ts
import { describe, expect, it } from "vitest";
import { getSponsoredSpecificity } from "../targeting";

describe("getSponsoredSpecificity", () => {
  const request = { state: "Penang", categorySlug: "food" };

  it.each([
    [{ state: "Penang", categorySlug: "food" }, 0],
    [{ state: "Penang", categorySlug: null }, 1],
    [{ state: null, categorySlug: "food" }, 2],
    [{ state: null, categorySlug: null }, 3],
  ])("orders matching scopes from exact to broad", (target, expected) => {
    expect(getSponsoredSpecificity(target, request)).toBe(expected);
  });

  it("rejects a non-matching state or category", () => {
    expect(getSponsoredSpecificity({ state: "Melaka", categorySlug: "food" }, request)).toBeNull();
    expect(getSponsoredSpecificity({ state: "Penang", categorySlug: "retail" }, request)).toBeNull();
  });
});
```

- [ ] **Step 2: Run the targeting test and confirm RED**

Run: `npx vitest run lib/sponsored-placements/__tests__/targeting.test.ts`

Expected: FAIL because `lib/sponsored-placements/targeting.ts` does not exist.

- [ ] **Step 3: Implement the targeting contract**

```ts
export type SponsoredTarget = {
  state: string | null;
  categorySlug: string | null;
};

export type SponsoredRequestContext = {
  state: string | null;
  categorySlug: string | null;
};

export function getSponsoredSpecificity(
  target: SponsoredTarget,
  request: SponsoredRequestContext,
): number | null {
  const stateMatches = target.state === null || target.state === request.state;
  const categoryMatches = target.categorySlug === null || target.categorySlug === request.categorySlug;
  if (!stateMatches || !categoryMatches) return null;
  if (target.state !== null && target.categorySlug !== null) return 0;
  if (target.state !== null) return 1;
  if (target.categorySlug !== null) return 2;
  return 3;
}
```

Add a comparator that orders by specificity ascending, then `priority` ascending, then `created_at` and `id` for deterministic ties.

- [ ] **Step 4: Update customer ranking tests before implementation**

Add tests proving position `1` beats position `4` within a tier, exact Penang/food beats all-Malaysia fallback, broad campaigns fill unused slots, archived campaigns are excluded, duplicate products remain deduplicated, and no more than four cards are returned.

Run: `npx vitest run lib/customer/__tests__/discovery-ranking.test.ts`

Expected: FAIL on ascending positions, specificity, and archived status.

- [ ] **Step 5: Reuse the shared comparator in customer ranking**

Filter status/date/product eligibility first, calculate request scope from active state/category filters, sort eligible sponsorships with `compareEligibleSponsoredPlacements`, deduplicate by product, and slice to four.

- [ ] **Step 6: Run Task 1 tests**

Run: `npx vitest run lib/sponsored-placements/__tests__/targeting.test.ts lib/customer/__tests__/discovery-ranking.test.ts`

Expected: PASS.

- [ ] **Step 7: Commit Task 1**

```bash
git add lib/sponsored-placements/targeting.ts lib/sponsored-placements/__tests__/targeting.test.ts lib/customer/discovery-ranking.ts lib/customer/__tests__/discovery-ranking.test.ts backend/core/types.ts
git commit -m "feat: rank sponsored placements by scope and position"
```

---

### Task 2: Transactional Preview and Approval Governance

**Files:**
- Create: `supabase/migrations/20260909082900_sponsored_position_governance.sql`
- Create: `supabase/migrations/__tests__/20260909082900_sponsored_position_governance.test.ts`

**Interfaces:**
- Produces SQL function `preview_sponsored_discovery_placement(p_placement_id uuid, p_product_id uuid, p_state text, p_category_slug text, p_starts_at timestamptz, p_ends_at timestamptz, p_priority integer) returns jsonb`.
- Updates SQL function `create_sponsored_discovery_placement(..., p_preview_version text) returns sponsored_discovery_placements`.
- Updates SQL function `transition_sponsored_discovery_placement(p_placement_id uuid, p_action text, p_reason text, p_preview_version text) returns jsonb`; callers pass `NULL` for non-approval actions, while approval requires a token.
- Preview JSON shape: `{ previewVersion, requestedPosition, shifts, paused, archived, summary }`, where each affected item contains only campaign ID, product name, previous position, next position, and status change.

- [ ] **Step 1: Write a failing migration contract test**

The test reads the migration and asserts exact contracts:

```ts
expect(sql).toMatch(/priority between 1 and 4/i);
expect(sql).toMatch(/'archived'/i);
expect(sql).toMatch(/preview_sponsored_discovery_placement/i);
expect(sql).toMatch(/p_preview_version text/i);
expect(sql).toMatch(/for update/i);
expect(sql).toMatch(/sponsored_preview_stale/i);
expect(sql).toMatch(/row_number\(\).*partition by status/is);
```

It also verifies the public projection still selects only the approved/date-effective safe fields and orders one-based positions ascending.

- [ ] **Step 2: Run the migration contract test and confirm RED**

Run: `npx vitest run supabase/migrations/__tests__/20260909082900_sponsored_position_governance.test.ts`

Expected: FAIL because the migration does not exist.

- [ ] **Step 3: Normalize legacy data and tighten constraints**

In one migration:

1. Drop the old `priority between 0 and 1000` and status constraints.
2. Rank existing approved rows per normalized exact scope (`coalesce(state, '*')`, `coalesce(category_slug, '*')`) by old priority descending, start time, and ID; assign positions 1–4 without pausing legacy rows whose effective date windows may not overlap.
3. Clamp non-approved rows deterministically to 1–4.
4. Mark paused rows older than the newest two as `archived` using `row_number() over (partition by status order by updated_at desc, id desc)`.
5. Add `priority between 1 and 4` and status including `archived` constraints and an index on status/scope/dates/priority.

- [ ] **Step 4: Implement server-calculated impact preview**

The preview function validates product, position, dates, state, and category; selects approved rows in the same normalized scope whose date windows overlap; calculates shifts for positions greater than or equal to the requested position; calculates the position-4 overflow pause; calculates paused rows that would be archived; and hashes the relevant ordered database state plus proposal into `previewVersion`.

The function must derive all affected rows from database state. Client-provided IDs or shifts are never accepted.

- [ ] **Step 5: Enforce preview tokens on create and approve**

`create_sponsored_discovery_placement` recomputes the proposal preview and raises `sponsored_preview_stale` unless `p_preview_version` matches. It still inserts only a draft.

On `approve`, `transition_sponsored_discovery_placement`:

1. Locks the draft and all affected approved/paused rows with `FOR UPDATE`.
2. Recomputes preview and rejects a stale token.
3. Shifts affected positions from high to low.
4. Pauses the displaced position-4 row.
5. Approves the draft at its requested position.
6. Archives paused rows beyond the two newest.
7. Preserves the existing self-approval prohibition and audit trigger.

Submit, reject, and pause continue using the same transition RPC without a preview token; pausing also applies the two-visible-paused retention rule.

- [ ] **Step 6: Update the safe public projection**

Keep the current eight-field return shape. Add active product approval checks if not already present, exclude archived rows, and order by `priority asc, starts_at asc, id asc` so no internal governance fields become public.

- [ ] **Step 7: Run the migration contract test**

Run: `npx vitest run supabase/migrations/__tests__/20260909082900_sponsored_position_governance.test.ts supabase/migrations/__tests__/20260908162000_sponsored_public_projection.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 2**

```bash
git add supabase/migrations/20260909082900_sponsored_position_governance.sql supabase/migrations/__tests__/20260909082900_sponsored_position_governance.test.ts
git commit -m "feat: govern sponsored placement positions atomically"
```

---

### Task 3: Preview and Mutation APIs

**Files:**
- Create: `app/api/admin/sponsored-placements/preview/route.ts`
- Create: `app/api/admin/sponsored-placements/preview/__tests__/route.test.ts`
- Modify: `app/api/admin/sponsored-placements/route.ts`
- Modify: `app/api/admin/sponsored-placements/[id]/route.ts`
- Modify: `app/api/admin/sponsored-placements/__tests__/routes.test.ts`

**Interfaces:**
- Produces `POST /api/admin/sponsored-placements/preview` accepting either `{ mode: "create", productId, startsAt, endsAt, position, allStates, state, allCategories, categorySlug }` or `{ mode: "approve", placementId }`.
- Changes campaign creation to accept `position: 1 | 2 | 3 | 4` and `previewVersion: string`.
- Changes approve action to require `previewVersion`; submit/reject/pause payloads remain compatible.
- Returns `409` with code `SPONSORED_PREVIEW_STALE` when database state changed after confirmation.
- GET returns `placements` without archived rows and `archivedPlacements` separately for the explicit Archived filter.

- [ ] **Step 1: Write failing preview route tests**

Test permission denial, invalid position `0`/`5`, create-mode RPC arguments, approve-mode placement lookup, safe preview response, and translated database errors. Verify the route never trusts affected campaign IDs from request JSON.

Run: `npx vitest run app/api/admin/sponsored-placements/preview/__tests__/route.test.ts`

Expected: FAIL because the endpoint does not exist.

- [ ] **Step 2: Implement preview endpoint schemas and RPC call**

Use a Zod discriminated union. Convert `allStates` and `allCategories` to nullable database scope fields exactly as the existing create endpoint does. Call `preview_sponsored_discovery_placement` and return its JSON unchanged after validating it is an object.

- [ ] **Step 3: Write failing create/approve API tests**

Change the existing create fixture from `priority: 25` to `position: 1`, add missing/invalid preview-token cases, require the approve request to pass a preview token to the RPC, add stale-preview `409`, and verify default GET hides archived while returning it in `archivedPlacements`.

Run: `npx vitest run app/api/admin/sponsored-placements/__tests__/routes.test.ts`

Expected: FAIL until the route schemas and RPC arguments are updated.

- [ ] **Step 4: Update create, list, and transition routes**

Use `z.coerce.number().int().min(1).max(4)` for position. Preserve permission checks and current structured errors. Map `sponsored_preview_stale` to `{ error, code: "SPONSORED_PREVIEW_STALE" }` with status 409. Split archived results after the same safe relational query; do not broaden selected staff or audit fields.

- [ ] **Step 5: Run Task 3 tests**

Run: `npx vitest run app/api/admin/sponsored-placements/preview/__tests__/route.test.ts app/api/admin/sponsored-placements/__tests__/routes.test.ts`

Expected: PASS.

- [ ] **Step 6: Commit Task 3**

```bash
git add app/api/admin/sponsored-placements/preview/route.ts app/api/admin/sponsored-placements/preview/__tests__/route.test.ts app/api/admin/sponsored-placements/route.ts 'app/api/admin/sponsored-placements/[id]/route.ts' app/api/admin/sponsored-placements/__tests__/routes.test.ts
git commit -m "feat: preview sponsored campaign impact before changes"
```

---

### Task 4: Admin Impact Confirmation and Lifecycle Views

**Files:**
- Create: `components/admin/sponsored-placements/impact-dialog.tsx`
- Create: `components/admin/sponsored-placements/__tests__/impact-dialog.test.tsx`
- Modify: `app/admin/sponsored-placements/page.tsx`
- Modify: `app/admin/sponsored-placements/__tests__/page.test.tsx`
- Modify: `app/i18n/locales/en/admin.json`
- Modify: `app/i18n/locales/zh-CN/admin.json`
- Modify: `app/i18n/locales/ms/admin.json`

**Interfaces:**
- Consumes the preview JSON from Task 3.
- Produces `SponsoredImpactDialog({ preview, intent, busy, onCancel, onConfirm })`.
- Creator flow: form submit → preview request → impact dialog → confirmed POST with `previewVersion`.
- Approver flow: Approve button → current preview request → impact dialog → confirmed PATCH with `previewVersion`.

- [ ] **Step 1: Write the failing impact-dialog tests**

Test that the dialog names the requested position, lists every shift, warns when a campaign will pause, explains archived-history changes, distinguishes create versus approve confirmation copy, and disables duplicate confirmation while busy.

Run: `npx vitest run components/admin/sponsored-placements/__tests__/impact-dialog.test.tsx`

Expected: FAIL because the component does not exist.

- [ ] **Step 2: Implement the focused impact dialog**

Use existing modal, button, typography, spacing, and color tokens already present in Admin components. Render an empty-impact state such as “No current campaign will move” so both admins understand that the preview was calculated rather than omitted.

- [ ] **Step 3: Write failing Admin page tests**

Add tests that assert:

- Position is a select with exactly values 1–4.
- State is selected from canonical Malaysia states rather than free text.
- Create does not POST before impact confirmation.
- Approve does not PATCH before impact confirmation.
- A stale preview closes or refreshes the confirmation and tells the user to review again.
- Default lifecycle views include Active/Scheduled, Pending, Drafts, Recently paused, and an explicit Archived view.
- Default Recently paused renders no more than two entries.

Run: `npx vitest run app/admin/sponsored-placements/__tests__/page.test.tsx`

Expected: FAIL on the new controls and interaction flow.

- [ ] **Step 4: Connect creator and approver preview flows**

Replace the numeric priority input with the four-option Position selector. Import `STATES_MY`, exclude the “All Malaysia” sentinel from the specific-state choices, and retain the existing All states checkbox. Fetch a preview before both create confirmation and approve confirmation; submit the returned token only after explicit confirmation. For 409 stale-preview responses, refetch and require a new confirmation rather than retrying silently.

- [ ] **Step 5: Add lifecycle grouping/filtering**

Group approved future/current items as Active/Scheduled, then Pending, Drafts, Recently paused, and Archived. Hide Archived by default, show only the two newest paused items, and keep current submit/reject/pause actions within the correct group. Do not add deletion controls.

- [ ] **Step 6: Add complete English, Chinese, and Malay copy**

Add identical keys in all three locale files for Position 1–4, lifecycle filters, preview headings, shift/pause/archive consequences, no-impact state, confirm/cancel actions, stale-preview guidance, and success/error toasts. Keep the existing namespace and naming style.

- [ ] **Step 7: Run Task 4 tests and locale parity tests**

Run: `npx vitest run components/admin/sponsored-placements/__tests__/impact-dialog.test.tsx app/admin/sponsored-placements/__tests__/page.test.tsx app/i18n/__tests__/locale-parity.test.ts`

Expected: PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add components/admin/sponsored-placements/impact-dialog.tsx components/admin/sponsored-placements/__tests__/impact-dialog.test.tsx app/admin/sponsored-placements/page.tsx app/admin/sponsored-placements/__tests__/page.test.tsx app/i18n/locales/en/admin.json app/i18n/locales/zh-CN/admin.json app/i18n/locales/ms/admin.json
git commit -m "feat: confirm sponsored placement impact in admin"
```

---

### Task 5: Integrated Verification and Documentation

**Files:**
- Modify: `Docs/plans/2026-09-09-0829-sponsored-targeting-priority-governance.md`
- Do not modify: unrelated authentication, staff invitation, partner-card, carousel animation, or demo-account files.

**Interfaces:**
- Verifies the complete existing Admin → safe public RPC → customer carousel path.
- Records executed commands and results in this plan under a final `Verification Record` section.

- [ ] **Step 1: Run focused feature tests once after the final code change**

Run:

```bash
npx vitest run \
  lib/sponsored-placements/__tests__/targeting.test.ts \
  lib/customer/__tests__/discovery-ranking.test.ts \
  supabase/migrations/__tests__/20260909082900_sponsored_position_governance.test.ts \
  supabase/migrations/__tests__/20260908162000_sponsored_public_projection.test.ts \
  app/api/admin/sponsored-placements/preview/__tests__/route.test.ts \
  app/api/admin/sponsored-placements/__tests__/routes.test.ts \
  components/admin/sponsored-placements/__tests__/impact-dialog.test.tsx \
  app/admin/sponsored-placements/__tests__/page.test.tsx \
  app/i18n/__tests__/locale-parity.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 2: Run static verification**

Run: `npx tsc --noEmit`

Expected: exit 0.

Run: `npm run lint`

Expected: exit 0 with no errors.

- [ ] **Step 3: Run one focused permission/privacy review**

Confirm that preview/create/approve routes enforce `admin.map_campaign.manage`, self-approval remains blocked, database rows are locked before mutation, the preview token is server-derived, affected IDs cannot be supplied by the browser, public RPC fields remain restricted, archived campaigns are not customer-visible, and no internal storage path or review metadata is exposed.

- [ ] **Step 4: Perform browser smoke verification**

On `/admin/sponsored-placements`, verify positions 1–4, canonical state/category selection, creator preview, separate approver preview, collision shift warning, stale-preview recovery, lifecycle filters, and two-item paused view. On `/customer/partners`, verify at most four banners, exact scope before fallback, Position 1 first, three-second rotation unchanged, and hover-only arrows unchanged.

- [ ] **Step 5: Record outcomes and commit documentation**

Append exact commands, counts, browser observations, and any follow-up-only findings under `## Verification Record`. Then run:

```bash
git add Docs/plans/2026-09-09-0829-sponsored-targeting-priority-governance.md
git commit -m "docs: record sponsored governance verification"
```

## Verification Record

Executed on 2026-09-09:

- TDD red/green cycles completed for targeting/ranking, SQL governance contracts, preview/create/approve APIs, impact dialog, Admin lifecycle views, and related legacy contracts.
- Final focused verification: 13 test files, 89 tests passed.
- TypeScript: `npx tsc --noEmit --pretty false` exited 0.
- Lint: `npm run lint` exited 0 with 0 errors and 67 pre-existing warnings outside the changed feature files.
- Full suite: 616 files passed, 7 skipped; 2,981 tests passed, 20 skipped. Three related stale contracts were repaired. The remaining canonical migration-history failure is caused by three other workspace migration files (`20260908165700`, `20260908180000`, and untracked `20260909054100`) that are outside this approved scope; this plan's `20260909082900` migration is registered.
- Database contract verification passed, but a disposable PostgreSQL migration run was unavailable because Docker/Podman is not installed on the host.
- Browser smoke verification was blocked because the Mac was locked and automatic unlock failed. Automated render and interaction coverage verifies the Position selector, canonical state selector, creator preview, approver preview, confirmation token, lifecycle filters, and two-item paused view.
- Independent security review confirmed database permission checks, removal of legacy RPC bypasses, server-derived preview tokens, advisory/row locks, product locking, fail-closed legacy ownership, canonical scope validation, and the eight-field public projection. Its two final must-fix findings were repaired by preserving legacy scheduled campaigns and persisting automatic pause/archive causes in `review_note` for audit.
