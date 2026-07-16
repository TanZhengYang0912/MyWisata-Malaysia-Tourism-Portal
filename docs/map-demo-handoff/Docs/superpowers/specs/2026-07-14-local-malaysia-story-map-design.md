# Local Malaysia Story Map Demo Design

## Goal

Add an isolated `/demo/map` experience for the IP-Copy demo. It must demonstrate Malaysia-wide tourism discovery, local mock data, and navigation behavior without making Supabase requests or changing the existing customer/vendor/admin flows.

## Scope

The demo includes:

- `/demo/map`: Malaysia-wide Story Map discovery view.
- `/demo/map/[id]`: place detail and navigation view.
- Local mock data for activities, vendors, recommended spots, state metadata, and sample route summaries.
- Local state persistence for selected category, radius, selected place, and saved places using a versioned `localStorage` key.
- A visible Malaysia state layer with all 13 states and 3 federal territories: Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Penang, Perak, Perlis, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, and Putrajaya.
- Four travel modes: driving, walking, cycling, and public transit.
- Browser geolocation with a Kuala Lumpur demo fallback when permission is denied or unavailable.
- Mock ETA and distance values for the demo; the external Google Directions URL remains available from the detail view.

Out of scope:

- Supabase schema, migrations, seed data, queries, auth, cart, orders, chat, checkout, vendor pages, and admin pages.
- Replacing or changing `/customer/map` or `/customer/activity/[id]`.
- Real-time routing, live traffic, booking availability, or production geocoding.

## Design direction

Use the approved B / Story Map direction: the map is the primary surface, controls float above it, and a selected place opens a focused bottom sheet. The visual system is original: deep teal navigation, sea-glass map surface, warm yellow state accents, and coral category markers. Do not reproduce the supplied reference's illustration, title treatment, label callouts, mascot, text, or component arrangement.

The Malaysia state layer uses local GeoJSON geometry derived from a public GIS state-boundary reference, then renders each state with a readable label overlay. The federal-territory feature is split into Kuala Lumpur, Labuan, and Putrajaya so all 16 administrative units are individually named in the UI. Labels are not dependent on a third-party basemap.

Desktop layout:

- Full-width map canvas as the hero.
- Floating title/search panel in the upper-left.
- Horizontal category chips below the title.
- Compact radius and `Near Me` controls in the upper-right.
- Bottom sheet for the selected place, not a permanent sidebar.

Mobile layout:

- Map remains the dominant surface.
- Controls wrap into a compact top stack.
- Bottom sheet becomes a full-width, swipe-like detail panel within the page flow.
- State names remain readable through the label layer and a compact state list fallback.

## Functional behavior

1. Initial load shows all local places and all 16 state labels in a Malaysia-wide view.
2. Category filters update visible places without a network request.
3. Radius filters apply after `Near Me` obtains a location; denied geolocation uses Kuala Lumpur and shows a clear fallback message.
4. Selecting a state focuses the state, filters place cards to that state, and keeps the rest of the map visible.
5. Selecting a marker or place card opens the bottom sheet.
6. `View place` opens the local detail route.
7. Detail mode buttons update the mock ETA/distance summary.
8. `Get directions` opens Google Maps with the selected travel mode and the available origin/destination coordinates.
9. Save/unsave uses localStorage only and survives refresh.

## Architecture

- `lib/demo-map/types.ts`: demo-only domain types.
- `lib/demo-map/data.ts`: canonical local seed data and the 16 state definitions.
- `lib/demo-map/store.ts`: pure filtering/distance helpers plus browser-only localStorage persistence.
- `lib/demo-map/malaysia-states.json`: local simplified geometry imported at build time; no runtime fetch.
- `components/providers/app-providers.tsx` and `app/layout.tsx`: skip AuthProvider and CartProvider on `/demo/map` routes so the demo does not initialize or call Supabase providers.
- `components/demo-map/malaysia-state-map.tsx`: client-side SVG renderer for local state geometry, labels, place markers, and selection events.
- `components/demo-map/story-map.tsx`: Story Map discovery surface and controls.
- `components/demo-map/place-detail.tsx`: detail surface, travel-mode state, ETA, and external directions link.
- `app/demo/map/page.tsx` and `app/demo/map/[id]/page.tsx`: thin route wrappers around the local demo components.

## Error handling and accessibility

- Missing local place IDs render a clear not-found state with a link back to `/demo/map`.
- Geolocation errors never block browsing.
- All marker and filter interactions have button labels and keyboard focus.
- State labels use `aria-label`; selected state/place uses `aria-pressed` or `aria-selected`.
- No runtime network request is required for map data or route summaries.

## Verification

- Unit tests cover the 16-state list, category/state/radius filtering, haversine distance, localStorage serialization, travel-mode summaries, and demo-route provider isolation.
- `npm test -- --run` must pass.
- `npm run build` must pass.
- Manual check at `/demo/map`: all 16 administrative labels are visible, clicking a state filters places, Near Me fallback works, marker selection opens the sheet, detail travel modes change ETA, and Get Directions opens the correct URL.

## Reference data note

State geometry is based on the public `Malaysia State Boundary` FeatureServer layer exposed by ArcGIS. The geometry is simplified for a lightweight local demo asset and is not used for legal, cadastral, or production navigation purposes.
