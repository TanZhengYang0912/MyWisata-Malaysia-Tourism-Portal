import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const plannerSource = readFileSync(new URL("../[tripId]/trip-planner-client.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");

describe("trip planner layout contract", () => {
  it("uses the shared customer title and page shell", () => {
    expect(plannerSource).toContain('import { CustomerPageShell, CustomerPageTitle } from "@/components/customer/customer-page-shell";');
    expect(plannerSource).toContain("<CustomerPageTitle");
    expect(plannerSource).toContain('<CustomerPageShell wide className="pt-0 sm:pt-0">');
    expect(plannerSource).toContain("rounded-3xl border border-border bg-card");
    expect(plannerSource).not.toContain("h-[calc(100vh-4rem)]");
  });

  it("defines the approved itinerary, map, and listing regions", () => {
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.itinerary")}');
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.tripMap")}');
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.placesToAdd")}');
  });

  it("renders day-based scheduling and an unscheduled queue", () => {
    expect(plannerSource).toContain("groupTripItemsByDay");
    expect(plannerSource).toContain('tCustomer("strictMigration.tripPlanner.unscheduled")');
    expect(plannerSource).toContain("scheduled_date");
    expect(plannerSource).toContain("scheduled_time");
  });

  it("wires schedule changes through a server action", () => {
    expect(plannerSource).toContain("updateTripItemScheduleAction");
    expect(actionsSource).toContain("export async function updateTripItemScheduleAction");
  });

  it("derives weather from dated live itinerary items and renders route-local hints", () => {
    expect(plannerSource).toContain("buildItineraryWeatherPlan");
    expect(plannerSource).toContain("useItineraryWeather");
    expect(plannerSource).toContain("TripWeatherHint");
    expect(plannerSource).toContain("TripWeatherItemMarker");
    expect(plannerSource).toContain("groupedItems.days");
    expect(plannerSource).toContain("dayTargetKeyByDate");
    expect(plannerSource).toContain("itemTargetKeyById");
  });

  it("keeps weather request code private and race-safe", () => {
    const hookSource = readFileSync(new URL("../[tripId]/use-itinerary-weather.ts", import.meta.url), "utf8");
    expect(hookSource).toContain('cache: "no-store"');
    expect(hookSource).toContain("AbortController");
    expect(hookSource).toContain("requestFingerprint");
    expect(hookSource).toContain("tripId");
  });

  it("tells the weather overlay whether the selected day has usable coordinates", () => {
    expect(plannerSource).toContain("selectedRouteStops.length > 0");
    expect(plannerSource).toContain("useWeatherOverlay(");
    expect(plannerSource).toContain("weatherLayerEnabled && activeWeatherMapMode");
  });

  it("keeps the temporary animation simulator local-only and uses the production weather hint", () => {
    expect(plannerSource).toContain('process.env.NODE_ENV !== "production"');
    expect(plannerSource).toContain("buildSimulatedWeatherResult(selectedDate, overlayHour)");
    expect(plannerSource).toContain("simulationEnabled");
    expect(plannerSource).toContain('simulationActive ? "forecast"');
    expect(plannerSource).toContain("buildSimulatedWeatherOverlay");
    expect(plannerSource).toContain("simulationActive ? simulatedWeatherOverlay : overlayState.result");
    expect(plannerSource).toContain("!simulationActive");
    expect(plannerSource).not.toContain("simulatedWeatherOverlayAction");
    expect(plannerSource).toContain("simulationLabel=");
  });

  it("lets desktop users independently collapse both side panels", () => {
    expect(plannerSource).toContain("itineraryCollapsed");
    expect(plannerSource).toContain("placesCollapsed");
    expect(plannerSource).toContain("md:grid-cols-[52px_minmax(0,1fr)_360px]");
    expect(plannerSource).toContain("md:grid-cols-[360px_minmax(0,1fr)_52px]");
    expect(plannerSource).toContain("md:grid-cols-[52px_minmax(0,1fr)_52px]");
    expect(plannerSource).toContain("aria-expanded={!itineraryCollapsed}");
    expect(plannerSource).toContain("aria-expanded={!placesCollapsed}");
  });

  it("keeps complete panel content available when a collapsed desktop layout becomes mobile", () => {
    expect(plannerSource).toContain('itineraryCollapsed ? "flex md:hidden" : "flex"');
    expect(plannerSource).toContain('placesCollapsed ? "flex md:hidden" : "flex"');
    expect(plannerSource).toContain("setItineraryCollapsed((collapsed) => !collapsed)");
    expect(plannerSource).toContain("setPlacesCollapsed((collapsed) => !collapsed)");
  });

  it("bounds the desktop canvas and paginates both side panels", () => {
    expect(plannerSource).toContain("const TRIP_DAYS_PAGE_SIZE = 5");
    expect(plannerSource).toContain("const PLACES_PAGE_SIZE = 15");
    expect(plannerSource).toContain("dayPage");
    expect(plannerSource).toContain("placesPage");
    expect(plannerSource).toContain("md:h-[680px]");
    expect(plannerSource.match(/variant="compact"/g)).toHaveLength(2);
    expect(plannerSource).toContain("visibleDays");
    expect(plannerSource).toContain("visibleActivitiesPage");
    expect(plannerSource).toContain("function patchPlaceFilters");
    expect(plannerSource).toContain("setPlacesPage(1)");
  });

  it("connects the dedicated place filters and keeps promoted recommendations explicit", () => {
    expect(plannerSource).toContain("TripPlaceFilterPanel");
    expect(plannerSource).toContain("filterAndRankTripPlaces");
    expect(plannerSource).toContain("placeFilters.distanceKm");
    expect(plannerSource).toContain("data-promoted-activity");
    expect(plannerSource).toContain("eventType, productId");
    expect(plannerSource).not.toContain('id="planner-radius"');
    expect(plannerSource).not.toContain("RADIUS_OPTIONS_KM");
  });

  it("loads distance-enriched activities on first render when the trip already has an origin", () => {
    expect(plannerSource).toContain("if (!near) return;");
    expect(plannerSource).toContain('searchActivities({ category: null, near, sort: near ? "distance_asc" : "recommended" })');
  });

  it("lets a weather-risk window reveal its exact hour on the map", () => {
    expect(plannerSource).toContain("handleSelectWeatherRiskHour");
    expect(plannerSource).toContain('setWeatherMapMode("forecast")');
    expect(plannerSource).toContain("setOverlayHour(hour)");
    expect(plannerSource).toContain('setActivePanel("map")');
    expect(plannerSource).toContain("onSelectRiskHour");
  });

  it("requests and presents real traffic segments for the selected driving route", () => {
    expect(plannerSource).toContain("buildRouteDepartureTime");
    expect(plannerSource).toContain("departureTime: routeDepartureTime");
    expect(plannerSource).toContain("trafficSegments: route.traffic?.segments");
    expect(plannerSource).toContain("data-route-traffic-status");
    expect(plannerSource).toContain('tCustomer("ui.map.trafficLive")');
    expect(plannerSource).toContain('tCustomer("ui.map.trafficPredicted")');
    expect(plannerSource).toContain('tCustomer("ui.map.trafficSlow")');
    expect(plannerSource).toContain('tCustomer("ui.map.trafficCongested")');
    expect(plannerSource).toContain("ROUTE_TRAFFIC_REFRESH_MS");
    expect(plannerSource).toContain('document.visibilityState === "visible"');
  });
});
