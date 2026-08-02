# Dev Explore District and Discovery Map

**Created:** 2026-08-02

**Status:** Approved design; implementation not started

**Route:** `/dev/explore`

**Replaces:** `/demo/explore`

## Context

The existing `/demo/explore` prototype provides an atlas-style Malaysia map and
drills from state to district. It currently has four limitations:

1. District names only appear after selecting a state and only while a district
   point is hovered or focused.
2. Selecting a state does not plot the available outlets or place-based
   activities.
3. The map typography is too small, especially because SVG text shrinks with
   the national `viewBox` on narrow screens.
4. `searchActivities()` collapses a shared product to one representative outlet,
   so it cannot supply every physical outlet pin.

The prototype is moving from `/demo/explore` to `/dev/explore` to match the
repository's other internal testing pages.

## Verified current data

The live database was inspected on 2026-08-02 using the public catalogue access
path. For active, approved products whose `type_slugs` include `adventure`,
`cultural`, or `nature`:

- 14 products exist: 3 adventure, 5 cultural, and 6 nature.
- All 14 have a direct `products.outlet_id`.
- They span 12 outlets and 4 vendors.
- None has an independent latitude and longitude.
- None of the 14 uses `outlet_offers`.
- The planned `attractions` table does not exist in the live database.

The current association is technically valid for ownership and fulfilment but
not for map position. For example, Bako National Park Coastal Trail belongs to
a Kuching provider outlet; plotting the outlet coordinate would identify the
provider location rather than Bako National Park.

The existing customer activity details route already supports these products:
`/customer/activity/[id]`. Place-bound activity presentation is selected by
`isPlaceBound()` for the `nature`, `cultural`, and `adventure` type slugs.

## Product and page goal

**Subject:** Malaysia-wide tourism discovery for travellers and project testers.

**Audience:** Travellers exploring geographically and developers validating the
catalogue.

**Single job:** Let a user understand the complete state/district structure,
select a geographic area, inspect every relevant outlet or activity pin, and
continue to the existing details page.

## Decisions

### D1 — Use a hybrid pin model

Map position follows what the customer is visiting:

- `nature`, `cultural`, and `adventure` products become **place pins** at their
  own coordinates.
- Food, retail, accommodation, and all other outlet-bound listings become
  **outlet pins** at the physical outlet coordinates.
- Provider outlets that only own place-bound activities are not duplicated as
  outlet pins on this map.

This preserves the existing vendor/outlet ownership model. It changes only the
discovery coordinate used by the map.

Rejected alternatives:

- Outlet-only pins are smaller to implement but geographically wrong for
  place-bound activities.
- One product pin per outlet coordinate produces overlapping duplicates and is
  still wrong for place-bound activities.
- A new `attractions` table is unnecessary for this scoped prototype. Nullable
  structured location fields on products are sufficient until attraction
  management becomes a real product feature.

### D2 — Add structured place fields to products

Add nullable fields:

```sql
products.place_state    TEXT
products.place_district TEXT
products.place_lat      NUMERIC
products.place_lng      NUMERIC
```

Rules:

- Latitude and longitude must either both be present or both be absent.
- Latitude must be between -90 and 90; longitude between -180 and 180.
- `place_state` is required when coordinates are present.
- `place_district` remains nullable because Federal Territories and Perlis do
  not use the normal district tier.
- The migration populates all 14 current place-bound products from an explicit,
  reviewed mapping.
- The remote demo seed receives the same mapping so a fresh database reproduces
  the live result.
- A place-bound product with missing place coordinates is omitted from place
  pins and reported in a development warning. It must never silently fall back
  to the provider outlet coordinate.

No index is needed for this prototype because the page reads the approved
catalogue and builds the map DTO once. Add an index only if a later production
query filters directly by these columns and profiling shows a need.

### D3 — Keep every district plotted and every name permanently visible

The national overview renders all 115 configured district points and names,
including districts with zero listings. District labels do not depend on hover
or focus.

National label placement is deterministic:

1. Project each district seed into its Peninsular or Borneo plate.
2. Sort labels north-to-south and west-to-east for stable output.
3. Try nearby label anchors around the point while avoiding occupied label
   rectangles.
4. If no nearby anchor fits, place the label in the closest outside lane and
   draw a thin elbow leader to its point.

District dots and labels are interactive. Selecting one from the national view
sets both its state and district in a single action. Selecting only a state
shows all pins in that state without forcing the user to choose a district.

States and Federal Territories without districts remain selectable through
their state shape/card.

### D4 — Expand text without shrinking it back on mobile

The existing atlas palette stays intact:

- Sea `#DCE8F2`
- Land `#F1E8D4`
- Quiet land `#E4E7EB`
- Active land `#FBF4DE`
- Graticule `#AFC2D3`
- Coast `#8FA6BC`

No new colour system is introduced. Existing application primary/highlight
tokens remain the interaction colours.

Typography uses the existing project fonts:

- Display: `var(--font-display)` for the map and state titles.
- Body: the application body font for district labels and descriptions.
- Utility: `var(--font-mono)` only for compact counts where tabular alignment is
  useful.

Minimum target sizes:

- Page/map title: 30–36px
- State name: 16–18px
- District name: 13–14px
- Pin preview title: 18px
- Legend, count, and control text: at least 13px

The national map receives a readable minimum canvas width. On a viewport too
narrow to preserve these sizes, the map wrapper pans horizontally instead of
scaling the text down to unreadable pixels. A visible instruction tells mobile
users that the map can be dragged.

The distinctive visual element is the atlas annotation system paired with two
pin shapes: a circular outlet pin and a diamond place/activity pin. Other
decoration remains restrained.

### D5 — State selection reveals all relevant pins

Interaction sequence:

```text
National overview
  -> select a state
State view with every district name
  -> all outlet and place pins for the state appear
  -> optionally select a district to filter the pins
  -> select a pin or coordinate cluster
Preview panel
  -> open outlet, product, or activity details
```

Outlet pins:

- One pin per physical outlet.
- Popup shows vendor name, outlet name, city/district, and distinct non-place
  products offered by that outlet.
- Product uniqueness is by product ID.
- A shared product may correctly appear under multiple outlet pins, but never
  twice inside the same outlet popup.
- Actions link to `/customer/outlet/[outletId]` and
  `/customer/activity/[productId]`.

Place pins:

- One pin per place-bound product.
- Position and state/district come from the new structured place fields, not
  from the provider outlet.
- Popup shows product name, type, provider/vendor, price, and location.
- Action links to `/customer/activity/[productId]`.

Pins at the same or effectively identical coordinate collapse into one numbered
cluster. Selecting the cluster opens a list containing every outlet/place at
that coordinate; the user does not need to zoom repeatedly to separate them.

### D6 — Build a map DTO without changing catalogue-card semantics

`searchActivities()` intentionally returns one distinct product and collapses a
multi-outlet product to the nearest or cheapest representative outlet. That is
correct for catalogue cards but incorrect for a physical outlet map.

The dev map therefore uses the existing `getActivities(db)` and `getOutlets(db)`
results and passes them through a new pure map adapter. The adapter:

1. identifies place-bound products with the existing `isPlaceBound()` helper;
2. creates one place pin when structured place coordinates exist;
3. expands every non-place product through direct `outlet_id` or active
   `outlet_offers`;
4. groups expanded products by outlet ID;
5. produces state/district counts from distinct product IDs;
6. returns omitted place-bound IDs so the dev page can expose incomplete data.

This keeps map-specific expansion out of the shared catalogue search behavior
and prevents a map prototype from changing production Explore cards.

### D7 — Move the route, retain reusable map modules

- Move the page surface from `/demo/explore` to `/dev/explore`.
- Remove the old `/demo/explore` page rather than maintaining two copies.
- Keep `components/demo-map/*` and `lib/demo-map/*` names for this change. A
  folder-wide rename would be unrelated churn and would also affect other map
  prototypes.
- Do not modify `/customer/explore`, `/guest/explore`, or `/customer/map` in this
  change.

## Component boundaries

The design keeps responsibilities separate:

- **Server page:** fetch public catalogue/outlet data and pass the prepared map
  DTO to the client.
- **Pure discovery-pin adapter:** expand offers, separate place/outlet semantics,
  deduplicate products, calculate counts, and report missing place coordinates.
- **Explore client:** own selected state, district, pin/cluster, and preview
  state.
- **Malaysia district map:** project geometry, lay out permanent labels, draw
  state/district interaction, and render supplied pins.
- **Preview panel:** render outlet, activity, or cluster content and destination
  links without owning map calculations.

No component queries Supabase from the browser.

## Empty, loading, and error behavior

- Server query failure renders a clear development error state instead of an
  empty map that looks like valid zero data.
- A state with no pins still opens and shows every district, plus “No available
  outlets or activities in this state yet.”
- A district with no pins remains selectable and shows the same scoped empty
  explanation.
- Missing place coordinates appear in a development-only warning listing the
  affected product names/IDs; those products are not misplaced.
- A broken catalogue image uses the existing image fallback behavior in the
  preview panel.

## Accessibility

- State shapes, district dots/labels, pins, clusters, and preview actions are
  keyboard reachable.
- Enter and Space perform the same selection as pointer input.
- Focus styles use the existing primary token and remain visible over sea and
  land colours.
- SVG groups expose specific names and counts through `aria-label`.
- Pin shape is not the only distinction; accessible labels include “Outlet” or
  “Activity place.”
- Horizontal map overflow is keyboard-scrollable and has an accessible
  instruction.
- Reduced-motion users receive no animated pan/zoom transition.

## Scope boundaries

Included:

- `/demo/explore` to `/dev/explore` route move.
- Permanent national and state-level district labels.
- Larger typography and readable responsive behavior.
- Hybrid outlet/place pins and preview links.
- Structured product place coordinates and current-data backfill.
- Map-specific adapter and focused tests.

Explicitly excluded:

- Building the broader `attractions` CRUD system.
- Changing vendor/outlet ownership or `outlet_offers` semantics.
- Changing customer/guest Explore or the trip-planning map.
- Editing activity-detail page behavior.
- Checkout, cart, wallet, booking, review, or payment changes.
- Real district boundary GeoJSON; districts continue using the reviewed seed
  points already present in `lib/demo-map/districts.ts`.
- Adding a new map library or dependency.

## Acceptance criteria

1. `/dev/explore` loads and `/demo/explore` no longer hosts the prototype.
2. Before a state is selected, all 115 configured district names and dots are
   rendered, including zero-listing districts.
3. District names do not require hover or focus to appear.
4. Text meets the minimum sizes above and does not shrink below them on a 390px
   viewport; the map becomes pannable instead.
5. Selecting a state reveals every eligible outlet and place pin in that state.
6. Selecting a district from the national or state view filters pins to it.
7. Outlet pins contain distinct non-place products and link to the outlet and
   product details pages.
8. Adventure/cultural/nature pins use product place coordinates and link to the
   existing activity detail page.
9. No place-bound product silently uses an outlet coordinate.
10. Shared products expand to every active outlet offer without duplicate
    products inside an outlet popup.
11. Same-coordinate pins remain accessible through a numbered cluster.
12. Empty states, query failures, and missing-coordinate warnings are explicit.
13. Pointer and keyboard interaction both work.

## Verification strategy

### Data and migration

- Confirm all 14 current active, approved nature/cultural/adventure products
  have a complete valid place coordinate pair and correct state/district.
- Confirm non-place products are not required to have place fields.
- Confirm the backfill and seed mappings contain the same product IDs and
  coordinates.

### Unit tests

- Pure adapter: direct outlet product, shared offer product, place product,
  missing-coordinate omission, duplicate prevention, state/district distinct
  counts, and same-coordinate grouping.
- District layout: every configured district receives one permanent label,
  placement is deterministic, and label rectangles do not overlap after lane
  fallback.
- Accessibility helpers: pin and cluster labels describe their type and count.

### Browser verification

- Desktop national view at 1600px: all district names present and readable.
- State views for a dense state (Perak), a wide state (Sarawak), and a Federal
  Territory with no districts.
- A state containing both outlet and place pins.
- Outlet, activity, and mixed-coordinate cluster previews and links.
- Mobile at 390px: readable text, horizontal pan instruction, no clipped
  controls.
- Keyboard-only traversal and reduced-motion behavior.

### Project checks

- `npx tsc --noEmit`
- `npm run lint`
- focused Vitest map/adapter tests
- `npm test`
- `next build`

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| 115 permanent district labels make the national map dense | Deterministic collision placement, exterior lanes, a larger minimum canvas, and pan instead of destructive down-scaling |
| Curated activity coordinates are inaccurate | Keep the backfill as an explicit reviewable mapping and verify each against its named destination before applying |
| Multi-outlet products disappear or duplicate | Expand direct/offer relationships in one pure adapter and test both target and non-target outlets |
| Provider outlet is mistaken for a tourism destination | Never fall back from a missing place coordinate to outlet coordinates |
| SVG interaction becomes difficult on mobile | Preserve minimum hit targets, provide a scrollable canvas, and test at 390px |
| The prototype changes production Explore behavior | Keep the adapter and route dev-specific; do not modify `searchActivities()` semantics or customer routes |
