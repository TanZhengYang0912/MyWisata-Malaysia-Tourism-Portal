# Local Malaysia Story Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build an isolated `/demo/map` and `/demo/map/[id]` Story Map demo backed only by local mock data, with readable labels for all 13 Malaysian states and 3 federal territories.

**Architecture:** Add a demo-only domain under `lib/demo-map/`, render a local simplified state-boundary GeoJSON layer inside an SVG, and keep the approved Story Map bottom-sheet interaction in `components/demo-map/`. Wrap the root providers in a pathname-aware `AppProviders` component so demo routes skip AuthProvider and CartProvider entirely while all existing routes retain their current behavior.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Tailwind CSS utility classes, inline SVG, local GeoJSON, localStorage, Vitest.

## Global Constraints

- Do not modify Supabase schema, migrations, seeds, queries, or stored data.
- Do not replace or change `/customer/map` or `/customer/activity/[id]`.
- Demo routes must not make Supabase network requests.
- State coverage must include Johor, Kedah, Kelantan, Melaka, Negeri Sembilan, Pahang, Penang, Perak, Perlis, Sabah, Sarawak, Selangor, Terengganu, Kuala Lumpur, Labuan, and Putrajaya.
- No copied illustration, mascot, text, title treatment, or component arrangement from the supplied reference image.
- Runtime map data and route summaries must come from local files and localStorage only.

---

### Task 1: Create the local demo-map domain and state geometry

**Files:**
- Create: `lib/demo-map/types.ts`
- Create: `lib/demo-map/data.ts`
- Create: `lib/demo-map/store.ts`
- Create: `lib/demo-map/geo.ts`
- Create: `lib/demo-map/malaysia-states.json`
- Test: `lib/demo-map/__tests__/store.test.ts`

**Interfaces:**
- `DemoState`: `{ id: string; name: string; kind: "state" | "federal-territory"; region: string; label: [number, number] }`.
- `DemoPlace`: `{ id: string; name: string; type: "activity" | "vendor" | "recommended"; category: string; stateId: string; city: string; description: string; image: string; lat: number; lng: number; rating: number; reviews: number; price: number; address: string; tags: string[]; route: Record<TravelMode, RouteSummary> }`.
- `filterPlaces(places, filters)`: pure category/state/radius filtering and deterministic sorting.
- `loadDemoPreferences()` and `saveDemoPreferences(next)`: browser-safe localStorage functions using `ip-copy-demo-map-v1`.
- `projectPoint`, `projectGeometry`, and `featureToPath`: pure GeoJSON-to-SVG helpers.

- [x] **Step 1: Normalize the source geometry into a local 16-feature JSON asset.**

Use the simplified GeoJSON downloaded from the public Malaysia state-boundary FeatureServer. Split the `WILAYAH PERSEKUTUAN` MultiPolygon parts into three named features by their bounding boxes: Kuala Lumpur `[101.6153,3.0362,101.7564,3.2451]`, Labuan `[115.1573,5.2416,115.2695,5.3934]`, and Putrajaya `[101.6629,2.8861,101.7326,2.9831]`. Store only `type`, `properties.id`, `properties.name`, and `geometry` in `lib/demo-map/malaysia-states.json`.

Run a JSON validation after writing it:

```bash
node -e "const fs=require('fs'); const d=JSON.parse(fs.readFileSync('lib/demo-map/malaysia-states.json','utf8')); if(d.features.length!==16) throw new Error('Expected 16 features'); console.log(d.features.map(f=>f.properties.name).join(', '))"
```

Expected: 16 names, including all 13 states and Kuala Lumpur, Labuan, Putrajaya.

- [x] **Step 2: Write the failing domain tests.**

```ts
import { describe, expect, it } from "vitest";
import { DEMO_PLACES, DEMO_STATES, getRouteSummary } from "@/lib/demo-map/data";
import { filterPlaces, haversineKm, parseDemoPreferences, serializeDemoPreferences } from "@/lib/demo-map/store";

describe("local demo map domain", () => {
  it("contains all 16 Malaysian administrative units", () => {
    expect(DEMO_STATES).toHaveLength(16);
    expect(DEMO_STATES.map((state) => state.name)).toEqual(expect.arrayContaining(["Johor", "Penang", "Kuala Lumpur", "Labuan", "Putrajaya", "Sabah", "Sarawak"]));
  });

  it("filters by category, state, and radius", () => {
    const result = filterPlaces(DEMO_PLACES, { category: "Food & Dining", stateId: "penang", near: { lat: 5.4141, lng: 100.3288 }, radiusKm: 30 });
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((place) => place.category === "Food & Dining" && place.stateId === "penang" && (place.distanceKm ?? Infinity) <= 30)).toBe(true);
  });

  it("serializes preferences without losing saved place ids", () => {
    const value = { category: "Nature & Hiking", radiusKm: 50, selectedStateId: "sabah", savedPlaceIds: ["place-1"] };
    expect(parseDemoPreferences(serializeDemoPreferences(value))).toEqual(value);
  });

  it("provides a deterministic route summary for every travel mode", () => {
    expect(getRouteSummary(DEMO_PLACES[0], "driving").distanceText).toMatch(/km/);
    expect(getRouteSummary(DEMO_PLACES[0], "transit").durationText).toMatch(/min/);
  });

  it("computes a zero distance for the same point", () => {
    expect(haversineKm({ lat: 3.139, lng: 101.6869 }, { lat: 3.139, lng: 101.6869 })).toBe(0);
  });
});
```

Run: `npm test -- --run lib/demo-map/__tests__/store.test.ts`

Expected: FAIL because the demo domain files do not exist yet.

- [x] **Step 3: Implement the types, 16 states, local places, routes, filters, and GeoJSON helpers.**

Keep all seed content in `lib/demo-map/data.ts`. Include at least one place for every state/territory, plus extra places in Kuala Lumpur, Penang, Melaka, Sabah, and Sarawak so cluster behavior is visible. Use only local image URLs or stable gradients; do not fetch images at runtime.

`filterPlaces` must assign `distanceKm` only when `near` is provided, filter by `radiusKm` only when both are provided, and sort by distance when a location exists or rating otherwise.

`store.ts` must return defaults on the server, ignore malformed localStorage JSON, and never throw when `window.localStorage` is unavailable.

- [x] **Step 4: Run the domain tests.**

Run: `npm test -- --run lib/demo-map/__tests__/store.test.ts`

Expected: PASS with all state, filter, serialization, route, and distance assertions passing.

- [x] **Step 5: Commit the local domain and geometry asset.**

```bash
git add lib/demo-map
git commit -m "feat: add local Malaysia map demo domain"
```

### Task 2: Isolate demo routes from shared Supabase providers

**Files:**
- Create: `components/providers/app-providers.tsx`
- Modify: `app/layout.tsx`
- Create: `lib/demo-map/route.ts`
- Test: `lib/demo-map/__tests__/route.test.ts`

**Interfaces:**
- `isDemoMapRoute(pathname: string): boolean` returns true for `/demo/map` and descendants only.
- `AppProviders({ children })` renders only `ActionFeedbackProvider` on demo-map routes; non-demo routes render the existing ActionFeedbackProvider → AuthProvider → CartProvider nesting unchanged.

- [x] **Step 1: Write the failing route-isolation test.**

```ts
import { describe, expect, it } from "vitest";
import { isDemoMapRoute } from "@/lib/demo-map/route";

describe("demo map route isolation", () => {
  it("matches only the demo map surface", () => {
    expect(isDemoMapRoute("/demo/map")).toBe(true);
    expect(isDemoMapRoute("/demo/map/place-1")).toBe(true);
    expect(isDemoMapRoute("/customer/map")).toBe(false);
    expect(isDemoMapRoute("/demo/maps")).toBe(false);
  });
});
```

Run: `npm test -- --run lib/demo-map/__tests__/route.test.ts`

Expected: FAIL because the route helper does not exist.

- [x] **Step 2: Implement `isDemoMapRoute` and `AppProviders`.**

Use `usePathname()` in `AppProviders`. Preserve the existing provider nesting for all non-demo routes exactly. Update `app/layout.tsx` to import only `AppProviders` around `{children}`.

- [x] **Step 3: Run the focused route test and typecheck the provider changes.**

Run: `npm test -- --run lib/demo-map/__tests__/route.test.ts`

Expected: PASS.

- [x] **Step 4: Commit provider isolation.**

```bash
git add app/layout.tsx components/providers/app-providers.tsx lib/demo-map/route.ts lib/demo-map/__tests__/route.test.ts
git commit -m "feat: isolate local map demo from Supabase providers"
```

### Task 3: Build the Malaysia state map layer

**Files:**
- Create: `components/demo-map/malaysia-state-map.tsx`
- Test: `lib/demo-map/__tests__/geo.test.ts`

**Interfaces:**
- `MalaysiaStateMap({ places, selectedPlaceId, selectedStateId, onSelectPlace, onSelectState })` renders an accessible SVG map with state paths, all 16 state labels, markers, cluster bubbles, and a current-location marker when supplied.

- [x] **Step 1: Write projection/path tests.**

```ts
import { describe, expect, it } from "vitest";
import { featureToPath, projectPoint } from "@/lib/demo-map/geo";

describe("Malaysia map projection", () => {
  it("keeps projected coordinates inside the canvas", () => {
    const point = projectPoint([101.6869, 3.139], { minLng: 99, minLat: 0, maxLng: 120, maxLat: 8 }, { width: 900, height: 500, padding: 26 });
    expect(point.x).toBeGreaterThanOrEqual(26);
    expect(point.y).toBeGreaterThanOrEqual(26);
    expect(point.x).toBeLessThanOrEqual(874);
    expect(point.y).toBeLessThanOrEqual(474);
  });

  it("creates an SVG path for a polygon feature", () => {
    expect(featureToPath({ type: "Polygon", coordinates: [[[100, 1], [101, 1], [101, 2], [100, 1]]] }, { minLng: 99, minLat: 0, maxLng: 120, maxLat: 8 }, { width: 900, height: 500, padding: 26 })).toMatch(/^M/);
  });
});
```

Run: `npm test -- --run lib/demo-map/__tests__/geo.test.ts`

Expected: FAIL until the projection helpers are implemented.

- [x] **Step 2: Implement projection helpers and the SVG renderer.**

Use the imported local JSON, calculate one shared bounding box, render MultiPolygon rings as separate subpaths, and render each state label from the `DEMO_STATES` label coordinate. Use `pointer-events` and `<button>` overlays for labels/markers where possible; otherwise give each SVG `<g>` a `role="button"`, `tabIndex={0}`, keyboard handler, and `aria-label`.

At cluster zoom, group places by state and render one count bubble per state. At expanded zoom, render individual place markers. Keep label text visible at every zoom level and add a compact text state index outside the SVG for small federal territories.

- [x] **Step 3: Run projection and state-asset tests.**

Run: `npm test -- --run lib/demo-map/__tests__/geo.test.ts lib/demo-map/__tests__/store.test.ts`

Expected: PASS.

- [x] **Step 4: Commit the state map layer.**

```bash
git add components/demo-map/malaysia-state-map.tsx lib/demo-map/geo.ts lib/demo-map/__tests__/geo.test.ts
git commit -m "feat: render labeled Malaysia state map"
```

### Task 4: Build the Story Map discovery route

**Files:**
- Create: `components/demo-map/story-map.tsx`
- Create: `app/demo/map/page.tsx`
- Create: `app/demo/map/loading.tsx`
- Test: `lib/demo-map/__tests__/story-map-filters.test.ts`

**Interfaces:**
- `StoryMap` owns category, state, radius, location, zoom, selected place, and saved-place UI state; it consumes only `DEMO_STATES`, `DEMO_PLACES`, `filterPlaces`, and local preference helpers.

- [x] **Step 1: Write the filter contract test.**

```ts
import { expect, it } from "vitest";
import { DEMO_PLACES } from "@/lib/demo-map/data";
import { filterPlaces } from "@/lib/demo-map/store";

it("returns all demo places when no filter is active", () => {
  expect(filterPlaces(DEMO_PLACES, {}).length).toBe(DEMO_PLACES.length);
});
```

Run: `npm test -- --run lib/demo-map/__tests__/story-map-filters.test.ts`

Expected: FAIL until the test file/helper exists.

- [x] **Step 2: Implement the Story Map layout and controls.**

Render the approved Story Map design: floating title panel, category chips, radius controls, `Near Me`, local state selector/index, full Malaysia state SVG, marker/cluster interactions, selected-place bottom sheet, save action, and a concise list of filtered stories below the map. Use an original palette and typography already present in the project, but do not copy the provided screenshot's visual assets.

`Near Me` must call `navigator.geolocation.getCurrentPosition`; on error or missing support, set the Kuala Lumpur coordinates and show `Location unavailable — using Kuala Lumpur for this demo.`. Do not call an API.

- [x] **Step 3: Implement local preference hydration and persistence.**

Load preferences in a client effect, keep UI usable before hydration, and save category/radius/state/saved IDs after each relevant change. Never read localStorage during server rendering.

- [x] **Step 4: Run the focused tests and lint only the new files.**

Run: `npm test -- --run lib/demo-map/__tests__/story-map-filters.test.ts lib/demo-map/__tests__/store.test.ts`

Expected: PASS.

Run: `npx eslint app/demo/map components/demo-map lib/demo-map components/providers/app-providers.tsx app/layout.tsx`

Expected: no new errors in the demo files.

- [x] **Step 5: Commit the discovery route.**

```bash
git add app/demo/map components/demo-map/story-map.tsx lib/demo-map/__tests__/story-map-filters.test.ts
git commit -m "feat: add local Story Map discovery route"
```

### Task 5: Build local place detail and navigation

**Files:**
- Create: `components/demo-map/place-detail.tsx`
- Create: `app/demo/map/[id]/page.tsx`
- Create: `app/demo/map/[id]/not-found.tsx`
- Test: `lib/demo-map/__tests__/navigation.test.ts`

**Interfaces:**
- `buildDirectionsUrl(place, mode, origin?)` returns a Google Maps directions URL with `api=1`, destination coordinates, and one of `driving`, `walking`, `bicycling`, `transit`.
- `getRouteSummary(place, mode)` returns `{ durationText, distanceText }` from local mock data.

- [x] **Step 1: Write navigation tests.**

```ts
import { describe, expect, it } from "vitest";
import { DEMO_PLACES } from "@/lib/demo-map/data";
import { buildDirectionsUrl, getRouteSummary } from "@/lib/demo-map/store";

describe("local demo navigation", () => {
  it("builds a mode-specific Google Maps URL", () => {
    const url = new URL(buildDirectionsUrl(DEMO_PLACES[0], "bicycling", { lat: 3.139, lng: 101.6869 }));
    expect(url.hostname).toBe("www.google.com");
    expect(url.searchParams.get("travelmode")).toBe("bicycling");
    expect(url.searchParams.get("origin")).toBe("3.139,101.6869");
  });

  it("returns a local summary without a network request", () => {
    expect(getRouteSummary(DEMO_PLACES[0], "walking")).toEqual(expect.objectContaining({ durationText: expect.any(String), distanceText: expect.any(String) }));
  });
});
```

Run: `npm test -- --run lib/demo-map/__tests__/navigation.test.ts`

Expected: FAIL until the navigation helpers are implemented.

- [x] **Step 2: Implement the detail route.**

Show place image/gradient, state, category, rating, price, tags, description, route summary, travel-mode buttons, location permission action, `Get directions`, and `Back to map`. If the ID is missing, render the not-found page. If geolocation is denied, open Google Maps without an origin and explain that the destination is still available.

- [x] **Step 3: Run detail and navigation tests.**

Run: `npm test -- --run lib/demo-map/__tests__/navigation.test.ts lib/demo-map/__tests__/store.test.ts`

Expected: PASS.

- [x] **Step 4: Commit the detail route.**

```bash
git add app/demo/map/[id] components/demo-map/place-detail.tsx lib/demo-map/__tests__/navigation.test.ts
git commit -m "feat: add local map place navigation detail"
```

### Task 6: Verify the complete demo and clean generated design artifacts

**Files:**
- Modify: `Docs/superpowers/specs/2026-07-14-local-malaysia-story-map-design.md` only if verification exposes a contradiction.
- Modify: `Docs/superpowers/plans/2026-07-14-local-malaysia-story-map.md` to mark completed steps during execution.

- [x] **Step 1: Run the full unit test suite.**

Run: `npm test -- --run`

Expected: all existing and new tests pass.

- [x] **Step 2: Run a production build.**

Run: `npm run build`

Expected: Next.js production build succeeds and includes `/demo/map` and `/demo/map/[id]`.

- [x] **Step 3: Run focused lint.**

Run: `npx eslint app/demo/map components/demo-map lib/demo-map components/providers/app-providers.tsx app/layout.tsx`

Expected: no new errors in the changed demo files. Existing repository-wide lint errors remain outside this scope if they are unchanged.

- [x] **Step 4: Manual browser verification.**

Open `http://localhost:3000/demo/map` and verify:

1. The page loads without login and without a Supabase request.
2. All 16 labels are visible, including Kuala Lumpur, Labuan, and Putrajaya.
3. State selection filters the local places.
4. Category and radius filters update results locally.
5. Near Me fallback works when permission is denied.
6. Marker/cluster selection opens the Story Map bottom sheet.
7. View place opens the detail route.
8. All four travel modes change the local ETA/distance summary.
9. Get directions opens the correct external URL.
10. Save/unsave survives refresh.

- [x] **Step 5: Remove only the temporary `.superpowers/brainstorm/` visual companion session created for design review.**

Do not remove the user's existing `.codex/` directory or any unrelated untracked file.

