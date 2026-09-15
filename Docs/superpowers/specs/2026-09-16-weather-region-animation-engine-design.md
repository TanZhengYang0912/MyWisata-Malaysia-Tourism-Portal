# Weather Region Animation Engine Design

**Status:** Approved for implementation on 2026-09-16

## Context

The Trip map already renders forecast rain intensity polygons, a dashed rain
boundary, rain particles constrained to those polygons, and a RainViewer raster
for the current-time view. The temporary simulator currently changes only the
small itinerary weather badge. Its 11px icon cannot provide the requested visual
test, and it does not exercise the map animation rules.

The required behavior is a map-level weather animation system. Fog, drizzle,
rain, showers, thunderstorms, snow, and overcast effects must remain inside the
weather region calculated for that condition. Clear weather has no map
animation. A square sampling box or a full-map effect is not an acceptable
weather boundary.

## Decisions

### Provider truth

- Forecast effects use the existing Open-Meteo sample grid. Each sample already
  contains `weatherCode`, `cloudCover`, precipitation amount, and precipitation
  probability.
- Current-time weather continues to use RainViewer radar tiles. A radar raster
  is not converted into invented vector fog, cloud, snow, or thunderstorm
  regions. The current-time view therefore remains a truthful precipitation
  radar view.
- Forecast condition polygons are model-derived forecast areas, not real-time
  radar observations. Existing provider attribution remains visible.
- The development simulator may create a deterministic irregular test region so
  every animation can be inspected in Malaysia, where a real snow forecast
  cannot be expected. The simulator must remain visibly labelled as test data
  and must never write to an API or database.

### Exclusive condition regions

Each valid forecast sample is classified into one visual effect condition:

1. thunderstorm (`95-99`)
2. snow (`71-77`, `85-86`)
3. showers (`80-82`)
4. rain (`61-67`)
5. drizzle (`51-57`)
6. fog (`45`, `48`)
7. overcast (`3`)
8. none (`0-2` and unknown)

The ordering is defensive; a WMO code normally maps to exactly one group. One
binary mask per non-clear condition is contoured at `0.5`, following the same
exclusive-mask technique used by the existing light, moderate, and heavy rain
bands. A geographic position therefore has at most one condition animation.

The existing precipitation probability gate and light/moderate/heavy rain bands
remain unchanged. Rain intensity fills and the dashed rain boundary continue to
mean precipitation only; fog, snow, and cloud effects do not receive a fake blue
rain boundary.

### Animation rules

All effects reuse the current rain animation lifecycle: seed inside a GeoJSON
condition polygon, update only while visible, pause while the map is moving,
pause while the page is hidden, and disable motion when the operating system
requests reduced motion. When a moving particle exits its own condition polygon,
it is reseeded inside that same polygon.

| Condition | Map effect | Relationship to standard rain |
| --- | --- | --- |
| Fog | Wide, translucent pale particles drifting horizontally at low speed | No falling motion; fewer, larger particles |
| Drizzle | Fine, sparse blue drops moving downward slowly | Lower density and speed |
| Rain | Existing blue rain particles | Baseline behavior remains unchanged |
| Showers | Denser drops with deterministic active and quiet phases | Burst cadence rather than continuous rain |
| Thunderstorm | Dense rain plus brief, irregular pale flashes within thunderstorm polygons | Highest density; flash layer never covers the whole map |
| Snow | Soft white flakes falling slowly with bounded sideways drift | Slower descent and larger lateral movement |
| Overcast | Large, low-opacity grey-blue cloud-shadow particles drifting slowly | No falling particles |
| Clear | No map animation | No particles or decorative overlay |

Reduced-motion mode keeps the static provider polygons/radar visible but removes
particle movement, shower cadence, and lightning flashes.

## Architecture

### Geometry

`lib/weather/overlay.ts` gains a pure condition-contour builder alongside the
existing precipitation-contour builder. It consumes normalized
`WeatherOverlaySample[]` and returns a GeoJSON `FeatureCollection` whose feature
properties contain the condition. It reuses the ordered grid, coordinate
conversion, bounds, and `d3-contour` dependency already used for rain.

`WeatherOverlayResult` gains a condition contour collection. The existing
`contours`, `rainBoundary`, `dominantCenter`, and rain-band contract are retained
so current rain rendering and tests do not change meaning.

### Particle engine

`lib/weather/overlay-particles.ts` is extended from rain-only coordinates to a
small, typed weather-effect particle model. Geometry containment and bounded
rejection sampling remain shared. Presets control count, speed, direction,
opacity, size, cadence, and flash behavior without duplicating one timer per
condition.

The pure functions must remain deterministic when supplied a deterministic
random source so geometry and movement tests do not depend on real timers.

### Map renderer

`TripWeatherMapOverlay` keeps one animation loop and produces one GeoJSON source
containing typed particles. MapLibre layers filter by condition and render fog,
rain-family particles, snow, cloud shadows, and thunder flashes. Provider fills
and boundaries render below the effect particles; itinerary pins remain above
them.

The existing small `TripWeatherHint` icon remains a compact summary. It is not
the primary animation preview and does not need to be enlarged.

### Development simulator

The temporary simulator is extended to produce a synthetic
`WeatherOverlayResult` in addition to its day hint result. It uses the selected
day's first valid trip coordinate and the production sample-grid/contour
pipeline to create one irregular, non-rectangular condition region. The existing
hour mapping remains:

- 06:00 fog
- 08:00 drizzle
- 10:00 rain
- 12:00 showers
- 14:00 thunderstorm
- 16:00 snow
- 18:00 overcast
- 20:00 clear

When simulation is enabled, only the renderer input is replaced with this
clearly labelled test result. Open-Meteo, RainViewer, itinerary persistence, and
trip APIs receive no simulated data. At least one valid selected-day trip
coordinate is required so the test region has a truthful geographic anchor.

After visual acceptance, removing the simulator deletes its helper, toggle,
labels, and simulator-specific tests. The production condition geometry and
animation engine remain.

## Reuse Audit

| Candidate | Exact path | Decision | Reason |
| --- | --- | --- | --- |
| Forecast sample grid and contour conversion | `lib/weather/overlay.ts` | Extend | It already converts a geographic sample grid into non-rectangular exclusive polygons. |
| Polygon containment and seeded rain particles | `lib/weather/overlay-particles.ts` | Extend | It already guarantees particles remain within weather polygons. |
| Forecast normalization | `lib/weather/open-meteo-overlay.ts` | Reuse | It already returns the WMO code, cloud cover, precipitation, wind, and coordinates needed by the condition classifier. |
| Trip MapLibre weather renderer | `app/customer/trip/[tripId]/trip-weather-map-overlay.tsx` | Extend | It owns weather layers, animation lifecycle, map-movement state, reduced motion, legend, and attribution. |
| Temporary simulation hour selector | `app/customer/trip/[tripId]/trip-weather-simulation.ts` | Extend temporarily | The eight approved test conditions and hours already exist. |
| Small itinerary condition icon | `app/customer/trip/[tripId]/trip-weather-hint.tsx` | Reuse unchanged | It remains useful as a summary but is too small to serve as the map animation. |
| RainViewer raster | `lib/weather/rainviewer.ts` | Reuse unchanged | It is the truthful current-time precipitation source; converting its pixels into other weather conditions would be fabricated. |
| Full-map CSS weather overlay | None | Reject | It violates the condition-region requirement. |
| Reusing rain polygons for fog, snow, and overcast | Existing rain contours | Reject | A rain footprint is not evidence of fog, snow, or cloud extent. |
| New geometry or animation dependency | None | Reject | Existing GeoJSON, d3-contour, and MapLibre primitives are sufficient. |

**Reuse audit complete.** No second map, duplicate weather endpoint, shared UI
component, geometry dependency, or database model is justified.

## Error and Empty States

- No valid selected-day coordinate: the real forecast overlay keeps the existing
  missing-coordinate message; the simulator explains that a test location must
  be added and renders no fake region at the map center.
- Forecast provider unavailable: no stale new animation is fabricated. Existing
  accepted stale data may continue to render with its stale disclosure.
- A condition collection with no features: render no condition animation. Clear
  weather is a valid example, not an error.
- RainViewer unavailable: preserve the existing current-radar unavailable state;
  do not fall back silently to forecast animation while the UI says “Now.”
- Invalid or malformed provider condition data: classify it as `none` and keep
  the map usable.

## Testing

- Pure WMO-to-effect classification tests cover every supported group and
  unknown values.
- Dense polygon sampling proves no geographic point belongs to more than one
  condition feature.
- Particle tests prove every effect is seeded and reseeded inside its own
  polygon; clear creates none.
- Preset tests prove relative behavior: drizzle is lighter than rain, showers
  have cadence, thunderstorms include flashes, snow drifts, fog/cloud do not
  fall.
- Renderer contracts prove stable MapLibre layer order, condition filters,
  reduced-motion behavior, page/map pause behavior, and truthful attribution.
- Simulator tests prove all eight hours render the expected map effect and use
  an irregular condition contour anchored to a valid trip coordinate.
- API and privacy contracts prove simulated geometry is not sent to weather,
  radar, trip, or persistence endpoints.
- Browser acceptance checks every simulator hour on the real Trip page, verifies
  the effect remains inside its test contour, and confirms 20:00 clear has no
  animation.

## Scope Boundaries

In scope:

- Forecast condition contours and condition-specific map effects.
- Development-only map animation simulation for the eight approved hours.
- Necessary normalized response types, renderer logic, translations, and tests.

Out of scope:

- Air quality, haze, smoke, or MET Malaysia warning geometry.
- Fabricating non-radar current weather regions.
- Changing RainViewer or Open-Meteo providers, authentication, authorization,
  caching, rate limits, database schema, trip ownership, or itinerary mutations.
- Redesigning the Trip layout, place filters, routing, traffic, or weather-risk
  thresholds.
- Enlarging the itinerary badge into a separate weather card.

