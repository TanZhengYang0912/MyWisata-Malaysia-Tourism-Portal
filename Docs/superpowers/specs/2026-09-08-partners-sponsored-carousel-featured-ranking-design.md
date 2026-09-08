# Partners Sponsored Carousel and Featured Ranking Design

**Status:** Approved design; security amendment approved during implementation

## Context

The customer Partners page currently uses its first result section for four recommended vendor cards under “Featured local partners”. This makes a recommendation section look like a special vendor class and leaves the existing sponsored-placement campaign system disconnected from the Partners page.

The requested change separates three concepts:

- **Sponsored advertisement:** a paid, approved, time-bounded product placement.
- **Featured partner:** a ranking signal that moves selected/recommended vendors ahead of other vendors.
- **Verified local partner:** a trust badge shown on every approved vendor card.

## Goals

- Replace the current featured-vendor block with a horizontally scrollable sponsored advertisement rail.
- Reuse the existing `sponsored_discovery_placements` source and sponsored impression/click event API.
- Show a “Verified local partner” certification badge on every approved vendor card.
- Add a partner-view filter and a sort control.
- Default the directory to featured-first ordering.
- Preserve existing search, state, and category filtering.

## Existing Implementation to Reuse

- `app/customer/partners/page.tsx` already loads approved vendors, activities, and personalized/fallback featured vendor ranking.
- `app/customer/search/search-client.tsx` owns the Partners search, state/category filters, cards, pagination, and featured section.
- `lib/customer/discovery-ranking.ts` already validates sponsored placement status, date, state/category scope, priority, de-duplication, and the maximum sponsored result count.
- `app/api/sponsored-placements/[id]/events/route.ts` already accepts secured impression and click events.
- `components/customer/activity-card.tsx` establishes the existing Sponsored label convention.
- Existing vendor visuals, category labels, design tokens, icons, and customer translations remain the visual foundation.

No new database table, dependency, route, or sponsored-administration workflow is required.

### Approved security amendment

The existing base placement table grants public row reads, which also exposes internal review columns because RLS cannot restrict columns. Before connecting another customer surface, add a forward-only migration that removes public base-table reads and exposes a no-argument `SECURITY DEFINER` RPC returning only the eight customer-safe placement fields. Authenticated Staff with `admin.map_campaign.manage` retain base-table reads through the existing Staff RLS policy; customer Explore and Partners switch to the safe RPC.

## User Experience

### Sponsored advertisement rail

The highlighted “Featured local partners” section becomes “Sponsored recommendations”. It appears only when at least one effective sponsored placement matches the current customer filters.

Each advertisement is a compact landscape card containing:

- product/experience cover image;
- explicit Sponsored/Advertisement badge;
- experience title;
- vendor name and location;
- short category/price metadata;
- a clear action that opens the existing customer activity page.

The rail uses native horizontal scrolling with snap alignment. Touch and trackpad scrolling work directly; desktop users also receive previous/next buttons. Buttons disable at the relevant edge. The rail does not auto-rotate, avoiding motion and accessibility problems.

An impression is recorded once per visible placement during the current component lifetime. A click is recorded immediately before navigation. Existing event request and server validation are reused.

When there are no matching advertisements, the entire rail is omitted. It does not fall back to disguised organic vendor cards.

### Verified partner badge

Every vendor shown in the directory is already an approved vendor. Its card displays a `Verified local partner` badge over the cover image. This badge is a trust indicator only and does not imply paid placement.

### Filtering and sorting

The existing query, state, and category filters remain. Two controls are added above the directory results:

- **Partner view:** `All partners` or `Featured only`.
- **Sort:** `Featured first` (default), `Name A–Z`, or `Most outlets`.

“Featured” means the existing personalized vendor ranking when available; otherwise it means the existing public quality/outlet fallback ranking. Featured vendors stay identifiable internally through their IDs and appear first under the default sort. Non-featured vendors follow in stable name order.

Filtering occurs before pagination. Changing any filter or sort resets pagination to page 1. The result heading and empty state remain understandable for active filters.

Sponsored advertisements respect the active query, state, and category criteria. Partner-view and vendor sort controls affect the vendor directory only, because advertisements already have campaign priority ordering.

## Data Flow

1. The server page continues loading activities, approved vendors, and recommended vendors.
2. It additionally loads currently effective, approved sponsored-placement rows using the customer-safe placement RPC.
3. The page passes placements to the client without private campaign or audit data.
4. The client maps placements to activities and applies the existing deterministic sponsored ranker with the current query/state/category filters.
5. The client creates a featured vendor ID set from `recommendedVendors`, filters the vendor directory, applies the selected sort, and paginates the result.
6. Advertisement interactions call the existing sponsored event endpoint; vendor cards retain their existing vendor routes.

## Component Boundaries

- Keep `SearchClient` as the page state owner.
- Extract a focused sponsored rail/card component if this keeps `search-client.tsx` readable; it receives already ranked sponsored activities and an event callback.
- Add a small pure partner-ranking helper for featured-first/name/outlet ordering so ordering behavior is independently testable.
- Reuse `getPlaceActivityImage`, `getVendorVisual`, the existing category translation helpers, and existing customer design tokens.

## Responsive and Accessible Behaviour

- Cards expose enough width to resemble horizontally arranged name cards rather than a compressed four-column grid.
- Scroll snapping works without hiding focus outlines.
- Previous/next controls have translated accessible names and reflect disabled state.
- Sponsored content is explicitly labelled; the label is never communicated only by colour.
- The verified badge includes the existing shield icon and translated text.
- Keyboard users can tab through advertisement links and controls in logical order.
- Reduced-motion users receive no automatic movement.

## Loading and Failure Behaviour

- If sponsored placements fail to load, the organic partner directory remains usable and the ad rail stays hidden.
- Failed analytics requests never block navigation.
- Invalid or expired campaigns are excluded by both public database policy and client ranking checks.
- Missing product imagery uses the existing trusted activity-image fallback.

## Translation

Add matching English, Simplified Chinese, and Bahasa Melayu strings for:

- sponsored recommendations;
- verified local partner;
- partner view and featured-only filter;
- featured-first, name, and outlet-count sorting;
- previous/next advertisement controls;
- advertisement metadata where existing strings are insufficient.

## Testing

- Pure ranking tests cover featured-first order, stable fallback order, A–Z, most outlets, and featured-only filtering.
- Partners page contract tests cover sponsored-placement loading and safe prop projection.
- Client contract/render tests cover horizontal snap rail, navigation buttons, Sponsored label, verified badge, directory controls, and filter-before-pagination behaviour.
- Existing sponsored ranking and event route tests remain green.
- Run focused Partners, discovery-ranking, i18n, TypeScript, lint, and diff checks.
- Verify the working page in the user’s existing browser at the reference viewport and a narrow/mobile viewport, including rail scrolling and filter interactions.

## Scope Boundaries

In scope:

- Partners page data connection and presentation.
- Sponsored rail interactions and existing analytics calls.
- Vendor trust badge, view filter, and sorting.
- Relevant customer translations and tests.

Out of scope:

- New campaign tables or changes to campaign semantics. The approved public-projection security migration is in scope.
- Vendor-level sponsored campaigns.
- Changes to Admin Sponsored Placements.
- Auto-playing carousels.
- Changes to vendor, outlet, activity detail pages, or checkout.
- Retrofitting the same rail onto Home or Explore.

## Risks

- A campaign targets a product, not a vendor. The advertisement must therefore open the activity/product detail route and must name its vendor clearly.
- Personalized featured ordering can differ by signed-in customer; deterministic fallback and tests are required for anonymous users.
- Impression tracking must not fire repeatedly during re-renders.
- Existing page files contain older unused discovery code guarded by lint suppressions; this work will not expand into an unrelated cleanup.
