# Sponsored Full-Width Autoplay Carousel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Status:** Complete — implemented and verified on 2026-09-09

**Goal:** Replace the multi-card Sponsored rail with one full-width banner that advances every three seconds, loops infinitely, pauses during interaction, and retains circular previous/next buttons.

**Architecture:** Keep the existing `SponsoredPartnerRail` public interface and safe Sponsored data/event flow. Move presentation state into the component: one stable active placement ID, interaction/visibility/reduced-motion pause signals, and one resettable autoplay interval. Render only the active advertisement so focus, screen-reader output, and impression tracking always match the visible banner.

**Tech Stack:** React 19, TypeScript, Next.js 16, TailwindCSS, Vitest, existing render-test DOM utilities.

## Global Constraints

- Autoplay interval is exactly `3000ms`.
- One advertisement fills the existing page content width; no horizontal scrollbar or multi-card track remains.
- Next from the last advertisement opens the first; previous from the first opens the last.
- Pointer hover, focus within the carousel, hidden document state, and `prefers-reduced-motion: reduce` pause or disable autoplay.
- Manual navigation remains available whenever two or more advertisements exist and resets the interval.
- Preserve the exact Sponsored click/impression endpoint and `{ eventType, productId }` payload.
- Preserve empty-state hiding, activity links, filtering, image presentation, copy, and translations.
- Add no dependency and do not refactor unrelated code.

## Existing Implementation and Scope

Reuse:

- `SponsoredPartnerRail({ advertisements }: { advertisements: DiscoveryResult[] })`
- `placementIdFor`, `recordEvent`, `getPlaceActivityImage`, category labels, price formatting, and existing translations
- `IntersectionObserver` with a `0.5` threshold and the per-placement impression de-duplication set

Modify:

- `components/customer/sponsored-partner-rail.tsx`
- `components/customer/__tests__/sponsored-partner-rail.test.tsx`
- `Docs/plans/2026-09-08-1538-partners-sponsored-carousel-featured-ranking.md` for final evidence only
- this plan for checkmarks and final evidence

Files not touched:

- `app/customer/partners/page.tsx`
- `app/customer/search/search-client.tsx`
- `lib/customer/partner-directory.ts`
- Sponsored placement migrations, seed script, RPC, and event API
- locale files, vendor cards, filtering, featured sorting, pagination, activity detail, checkout, and payments

New dependencies: none.

Database changes: none.

Risks:

- duplicate or off-screen impressions after automatic changes;
- stale intervals after hover/focus/list updates;
- motion that ignores customer accessibility preferences;
- hidden slides remaining keyboard-focusable;
- timers making tests nondeterministic.

---

### Task 1: Lock the autoplay and full-width contracts with failing tests

**Files:**

- Modify: `components/customer/__tests__/sponsored-partner-rail.test.tsx`

**Interfaces:**

- Consumes: `SponsoredPartnerRail`, fake timers, the existing `TestEvent` DOM helper, mocked `IntersectionObserver`, and mocked `fetch`.
- Produces: executable contracts for the component implementation in Task 2.

- [x] **Step 1: Replace the multi-card rail layout assertion**

Assert that two advertisements render exactly one `ARTICLE`, that its wrapper has `w-full`/`overflow-hidden`, and that the Sponsored viewport no longer contains `overflow-x-auto`, `snap-x`, or `snap-start`.

```ts
await render(root, <SponsoredPartnerRail advertisements={[
  advertisement("activity-1"),
  advertisement("activity-2", SECOND_PLACEMENT_ID),
]} />);

expect(findElements(container, (element) => element.tagName === "ARTICLE")).toHaveLength(1);
const viewport = findOne(container, (element) => element.getAttribute("data-testid") === "sponsored-partner-rail");
expect(viewport.className).toContain("w-full");
expect(viewport.className).toContain("overflow-hidden");
expect(viewport.className).not.toContain("overflow-x-auto");
expect(viewport.className).not.toContain("snap-x");
```

- [x] **Step 2: Add the three-second autoplay and loop test**

Enable fake timers in each test, render two advertisements with distinct names, advance `2999ms` and assert the first remains, then advance one more millisecond and assert the second appears. Advance another `3000ms` and assert the first returns.

```ts
expect(container.textContent).toContain("Advertisement activity-1");
await act(async () => vi.advanceTimersByTime(2999));
expect(container.textContent).toContain("Advertisement activity-1");
await act(async () => vi.advanceTimersByTime(1));
expect(container.textContent).toContain("Advertisement activity-2");
await act(async () => vi.advanceTimersByTime(3000));
expect(container.textContent).toContain("Advertisement activity-1");
```

- [x] **Step 3: Add circular manual navigation and interval reset coverage**

Click Previous from index zero and assert the last advertisement appears. Click Next and assert the first returns. Advance `2999ms` after the manual click to prove the interval restarted instead of reusing the old elapsed time.

- [x] **Step 4: Add pause and reduced-motion coverage**

Stub `matchMedia("(prefers-reduced-motion: reduce)")`. Assert the index does not move while the carousel receives `mouseenter`, while focus remains inside, while `document.visibilityState` is hidden, or while reduced motion matches. Assert manual Next still changes the banner.

- [x] **Step 5: Update impression coverage for active slides**

Render two advertisements, trigger the observer for the active article twice, and assert only one impression. Advance the timer, trigger the new active article, and assert exactly one additional impression for the second placement. Retain the exact click payload assertion.

- [x] **Step 6: Run the focused test RED**

Run:

```bash
npx vitest run components/customer/__tests__/sponsored-partner-rail.test.tsx
```

Expected: failure because the existing component renders multiple snap cards, has no `3000ms` autoplay, disables edge buttons, and does not loop.

---

### Task 2: Implement the single-banner circular carousel

**Files:**

- Modify: `components/customer/sponsored-partner-rail.tsx`
- Test: `components/customer/__tests__/sponsored-partner-rail.test.tsx`

**Interfaces:**

- Consumes: the unchanged `advertisements: DiscoveryResult[]` prop and existing event/image/i18n helpers.
- Produces: the unchanged exported `SponsoredPartnerRail` component with internal circular autoplay behavior.

- [x] **Step 1: Replace scroll state with normalized slide state**

Add `activeIndex`, `isPointerPaused`, `isFocusPaused`, `isDocumentVisible`, `prefersReducedMotion`, and `autoplayEpoch`. Filter advertisements to those with a placement ID and normalize the active index when their count changes.

```ts
const eligibleAdvertisements = useMemo(
  () => advertisements.filter((advertisement) => placementIdFor(advertisement) !== null),
  [advertisements],
);
const [activeIndex, setActiveIndex] = useState(0);
const [isPointerPaused, setIsPointerPaused] = useState(false);
const [isFocusPaused, setIsFocusPaused] = useState(false);
const [isDocumentVisible, setIsDocumentVisible] = useState(true);
const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);
const [autoplayEpoch, setAutoplayEpoch] = useState(0);

useEffect(() => {
  setActiveIndex((current) => eligibleAdvertisements.length === 0 ? 0 : current % eligibleAdvertisements.length);
}, [eligibleAdvertisements.length]);
```

- [x] **Step 2: Add document visibility and reduced-motion subscriptions**

Initialize from `document.visibilityState` and `window.matchMedia("(prefers-reduced-motion: reduce)")`, subscribe to `visibilitychange` and media-query `change`, and remove both listeners during cleanup.

- [x] **Step 3: Add circular navigation and the resettable interval**

Use modulo arithmetic for both directions. Manual navigation increments `autoplayEpoch`; the interval depends on it so the next automatic change always receives a fresh three seconds.

```ts
const moveBy = useCallback((direction: -1 | 1, manual = false) => {
  setActiveIndex((current) => {
    const count = eligibleAdvertisements.length;
    return count === 0 ? 0 : (current + direction + count) % count;
  });
  if (manual) setAutoplayEpoch((current) => current + 1);
}, [eligibleAdvertisements.length]);

useEffect(() => {
  if (
    eligibleAdvertisements.length < 2 || isPointerPaused || isFocusPaused
    || !isDocumentVisible || prefersReducedMotion
  ) return;
  const intervalId = window.setInterval(() => moveBy(1), 3000);
  return () => window.clearInterval(intervalId);
}, [autoplayEpoch, eligibleAdvertisements.length, isFocusPaused, isDocumentVisible, isPointerPaused, moveBy, prefersReducedMotion]);
```

- [x] **Step 4: Keep impression tracking bound to the active article**

Replace the map of card refs with one `articleRef`. Recreate the observer when the active placement changes, observe only that article, and retain `impressedPlacementIds` so returning to a slide does not duplicate its impression.

- [x] **Step 5: Replace the track with a full-width banner**

Render only `eligibleAdvertisements[activeIndex]` inside a `relative w-full overflow-hidden` viewport. Use one full-width article and a responsive `md:grid-cols-[52%_48%]` link. Give the image a desktop minimum height around `320px` and let the content fill the other side. Place circular Previous and Next buttons absolutely at the left and right banner edges when the count is greater than one. Remove scroll-edge disabling and all scroll/snap classes.

- [x] **Step 6: Add interaction pause handlers and entry motion**

On the carousel section, set/unset pointer pause on mouse enter/leave. Set focus pause on focus capture and clear it only when blur leaves the section. Animate the newly active article with the Web Animations API when available and reduced motion is not requested.

```ts
onMouseEnter={() => setIsPointerPaused(true)}
onMouseLeave={() => setIsPointerPaused(false)}
onFocusCapture={() => setIsFocusPaused(true)}
onBlurCapture={(event) => {
  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusPaused(false);
}}
```

- [x] **Step 7: Run the component test GREEN**

Run:

```bash
npx vitest run components/customer/__tests__/sponsored-partner-rail.test.tsx
```

Expected: all carousel rendering, loop, pause, reduced-motion, navigation, and analytics tests pass.

- [x] **Step 8: Commit the component slice**

```bash
git add components/customer/sponsored-partner-rail.tsx components/customer/__tests__/sponsored-partner-rail.test.tsx
git commit -m "feat: autoplay sponsored banner carousel"
```

---

### Task 3: Verify integration, accessibility, and live behavior

**Files:**

- Modify: `Docs/plans/2026-09-08-1538-partners-sponsored-carousel-featured-ranking.md`
- Modify: `Docs/plans/2026-09-09-0622-sponsored-full-width-autoplay-carousel.md`
- Modify: `design-qa.md` only if the live visual check finds a blocking layout difference

**Interfaces:**

- Consumes: the completed `SponsoredPartnerRail` and existing Partners page integration.
- Produces: verification evidence; no new runtime interface.

- [x] **Step 1: Run focused integration tests**

```bash
npx vitest run \
  components/customer/__tests__/sponsored-partner-rail.test.tsx \
  lib/customer/__tests__/partner-directory.test.ts \
  lib/customer/__tests__/discovery-ranking.test.ts \
  app/customer/search/__tests__/search-contract.test.ts \
  'app/api/sponsored-placements/[id]/events/__tests__/route.test.ts'
```

Expected: every focused test passes.

- [x] **Step 2: Run repository verification**

Run independently:

```bash
npx tsc --noEmit
npm run lint
git diff --check
```

Expected: TypeScript and diff checks pass; lint has zero errors. Existing unrelated warnings may remain.

- [x] **Step 3: Perform the required bounded final review**

Use `luna_worker` for a read-only review limited to the component and test diff. Confirm timer cleanup, reduced-motion handling, focus/pointer pause behavior, no duplicate impression, exact analytics payload, and no hidden focusable slides. Fix only confirmed authorization, privacy, broken core-flow, accessibility, or requirement violations.

- [x] **Step 4: Verify the live Partners page**

Reload `http://localhost:3000/customer/partners`. Confirm one full-width Sponsored banner is visible, observe an automatic change after three seconds, verify last-to-first looping, test both manual buttons, confirm hover pauses, and confirm there is no horizontal scrollbar. Check browser console errors once.

- [x] **Step 5: Record final evidence**

Update both plan documents with the exact test counts and live observations. Classify visual polish that does not break the approved design as follow-up instead of expanding this repair.

- [x] **Step 6: Commit verification documentation**

```bash
git add Docs/plans/2026-09-08-1538-partners-sponsored-carousel-featured-ranking.md Docs/plans/2026-09-09-0622-sponsored-full-width-autoplay-carousel.md design-qa.md
git commit -m "docs: verify sponsored autoplay carousel"
```

## Verification Evidence

- TDD red phase confirmed the old multi-card implementation failed the new single-banner contract. A later regression test also reproduced stale active-advertisement identity across consecutive filtered-list replacements before the fix.
- `npx vitest run components/customer/__tests__/sponsored-partner-rail.test.tsx`: 8/8 tests passed.
- Focused integration run: 5/5 test files and 35/35 tests passed.
- `npx tsc --noEmit`: passed.
- `npm run lint`: passed with 0 errors and 67 pre-existing warnings outside this change.
- `git diff --check`: passed.
- Bounded `luna_worker` review checked timer cleanup, list replacement, interaction pauses, reduced motion, analytics, and single-slide accessibility. Its confirmed active-placement identity finding was fixed and covered by regression tests; non-blocking pause-boundary polish was deferred.
- Live `http://localhost:3000/customer/partners` check: one full-width banner rendered; the visible advertisement changed after 3.3 seconds; previous/next controls remained visible; no horizontal card track was present.
- Runtime changes are limited to the component and its tests. No dependencies, database objects, APIs, locale files, or page integrations changed.
