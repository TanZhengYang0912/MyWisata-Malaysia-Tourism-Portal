# Trip Weather Simulation Design

## Status

Approved in conversation on 2026-09-16; awaiting written-spec confirmation before implementation.

## Context

The real Trip page only renders the weather condition returned by Open-Meteo, so a tester cannot reliably observe every icon animation. An empty trip also currently turns the weather overlay API's `NO_VALID_COORDINATES` response into the generic message "route weather layer unavailable," which incorrectly suggests a provider failure.

This is a temporary local-development testing aid. After the user finishes visually reviewing the animations, the simulation UI and synthetic data will be removed in a follow-up change.

## Decisions

- Add a development-only weather simulation control to the existing Trip page.
- Keep the tester inside the real Trip layout so the user sees the same day card, typography, spacing, colors, and animation used by customers.
- Reuse the existing forecast-hour slider. In simulation mode, the selected hour controls the selected day's compact weather badge.
- Use the following deterministic schedule for 2026-09-17:

| Time | Simulated condition | WMO code |
| --- | --- | --- |
| 06:00 | Fog | 45 |
| 08:00 | Drizzle | 53 |
| 10:00 | Rain | 63 |
| 12:00 | Rain showers | 81 |
| 14:00 | Thunderstorm | 95 |
| 16:00 | Snow | 75 |
| 18:00 | Overcast | 3 |
| 20:00 | Clear sky | 0 |

- Mark simulated content clearly as test data.
- Never write simulated weather to Supabase, caches, or trip records.
- Never send a simulated condition to Open-Meteo or RainViewer.
- Do not fabricate a route-weather contour when the trip has no coordinates.
- When no valid origin or selected-day stop exists, replace the generic overlay failure with a specific instruction to add a starting point or trip place.
- Production builds must not expose or activate the simulation control.

## User Flow

1. Open the existing Trip page locally and select 17 September 2026.
2. Enable **Simulated weather** in the route-weather panel.
3. Move the existing forecast-hour slider to one of the documented test times.
4. Observe the selected day's real weather badge and animation update immediately.
5. Disable simulation to return to the real Open-Meteo forecast.
6. If the trip has no weather coordinates, the map explains that a starting point or trip place is required; it does not claim the weather provider is unavailable.

## Data Flow

- Real mode remains unchanged: Trip data -> weather target -> forecast API -> `TripWeatherHint`.
- Simulation mode is client-only: selected date + slider hour -> deterministic WMO code -> synthetic `WeatherTargetResult` -> existing `TripWeatherHint`.
- The existing `weatherConditionForCode` classifier and `AnimatedWeatherIcon` remain the sole condition rendering path.
- Route overlay and live radar remain real-data-only.

## Reuse Audit

| Candidate | Path | Decision | Reason |
| --- | --- | --- | --- |
| Trip weather hint | `app/customer/trip/[tripId]/trip-weather-hint.tsx` | Reuse unchanged where possible | It is the production renderer the user needs to inspect. |
| Forecast hour slider | `app/customer/trip/[tripId]/trip-weather-map-overlay.tsx` | Extend | It already provides the time interaction in the real layout. |
| Trip planner weather state | `app/customer/trip/[tripId]/trip-planner-client.tsx` | Extend | It owns selected date, overlay hour, and day-card rendering. |
| WMO condition classifier | `app/customer/trip/[tripId]/trip-weather-hint.tsx` | Reuse | Simulation should exercise the exact production mapping and animation. |
| Overlay API error | `app/api/weather/overlay/route.ts` | Reuse contract | It already distinguishes `NO_VALID_COORDINATES`; the UI needs to preserve that meaning. |
| Dedicated preview page | N/A | Reject | It would not reproduce the real Trip page layout requested by the user. |
| Database-backed mock weather | N/A | Reject | It risks persisted test data and is unnecessary for visual verification. |

Reuse audit complete.

## Scope

Expected modifications:

- `app/customer/trip/[tripId]/trip-planner-client.tsx`
- `app/customer/trip/[tripId]/trip-weather-map-overlay.tsx`
- `app/customer/trip/[tripId]/use-weather-overlay.ts`
- route-local tests for the simulator and overlay state
- customer locale JSON files for the test-only label and accurate missing-coordinate message

The implementation may add one route-local pure helper for the deterministic schedule if keeping it inside the already-large client component would reduce clarity.

## Out of Scope

- Changing Open-Meteo or RainViewer requests
- Persisting simulated weather
- Fabricating rain contours or radar tiles
- Changing weather-risk thresholds
- Changing itinerary dates or stops
- Supporting haze
- Shipping the simulation control to production

## Error Handling

- Missing coordinates produce a specific, localized instruction.
- Genuine provider, authorization, or network failures continue to use the existing unavailable message.
- Simulation mode never masks live-radar state or changes API error handling outside forecast overlay requests.

## Verification

- Pure tests cover every scheduled hour and WMO code.
- Rendering tests confirm each time produces the expected `data-weather-condition` marker through the production hint component.
- Contract tests confirm the simulator is development-only and clearly labelled.
- Overlay tests distinguish `NO_VALID_COORDINATES` from a provider failure.
- Manual browser verification uses the real Trip page on 2026-09-17 and inspects all eight times.
- Run affected Vitest tests, the full test suite, TypeScript, ESLint, and `git diff --check`.

## Removal Follow-up

After visual approval, remove the simulation toggle, deterministic schedule/helper, test-only translations, and simulator-specific tests. Preserve the improved missing-coordinate message because it fixes a real user-facing error independently of the temporary simulator.
