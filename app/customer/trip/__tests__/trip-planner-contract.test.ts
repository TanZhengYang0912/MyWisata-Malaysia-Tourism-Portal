import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const plannerSource = readFileSync(new URL("../[tripId]/trip-planner-client.tsx", import.meta.url), "utf8");
const hookSource = readFileSync(new URL("../[tripId]/use-trip-items.ts", import.meta.url), "utf8");
const routeHookSource = readFileSync(new URL("../[tripId]/use-trip-routes.ts", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");
const planRouteSource = readFileSync(new URL("../../../api/trips/plan/route.ts", import.meta.url), "utf8");
const mapRendererSource = readFileSync(new URL("../../../../components/map/maplibre-map.tsx", import.meta.url), "utf8");

describe("trip planner workspace contract", () => {
  it("removes the repeated page title and uses the full area below the customer navigation", () => {
    expect(plannerSource).not.toContain("<CustomerPageTitle");
    expect(plannerSource).not.toContain("<CustomerPageShell");
    expect(plannerSource).toContain("h-[calc(100dvh-6rem)] w-full overflow-hidden bg-card sm:h-[calc(100dvh-4.25rem)]");
  });

  it("presents an AI planner, one selected day, and the places rail", () => {
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.ai.title")}');
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.itinerary")}');
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.placesToAdd")}');
    expect(plannerSource).toContain('id="planner-selected-day"');
    expect(plannerSource).toContain("selectedDay ? renderDaySection");
    expect(plannerSource).toContain("data-trip-leg");
    expect(plannerSource).toContain("activeRoute?.legs?.[index]");
  });

  it("keeps the AI request on demand and adds suggestions to the selected day", () => {
    expect(plannerSource).toContain('fetch("/api/trips/plan"');
    expect(plannerSource).toContain("function addAiSuggestion");
    expect(plannerSource).toContain("{ date: selectedDate }");
    expect(planRouteSource).toContain("CUSTOMER_CAPABILITY.BASIC_AI");
    expect(planRouteSource).toContain("getTripCopilotCandidates");
    expect(planRouteSource).toContain("generateTripSuggestions");
  });

  it("wires schedule changes through the existing server action", () => {
    expect(hookSource).toContain("updateTripItemScheduleAction");
    expect(actionsSource).toContain("export async function updateTripItemScheduleAction");
  });

  it("matches persisted vendor stops by their catalogue activity id", () => {
    expect(hookSource).toContain("item.id === id || item.experience_id === id");
    expect(plannerSource).toContain("const stopIdSet = new Set(trip.items.map((item) => item.experience_id ?? item.id));");
  });

  it("keeps dated weather hints and gives the map its own column or tab", () => {
    expect(plannerSource).toContain("buildItineraryWeatherPlan");
    expect(plannerSource).toContain("useItineraryWeather");
    expect(plannerSource).toContain("TripWeatherHint");
    expect(plannerSource).toContain("TripWeatherItemMarker");
    expect(plannerSource).toContain("<MapView pins={pins}");
    expect(plannerSource).toContain('(activePanel === "map" ? "flex" : "hidden")');
    expect(plannerSource).toContain('setActivePanel("map")');
    expect(plannerSource).not.toContain("mapExpanded");
  });

  it("fits the full-height, pannable map to the selected day's route", () => {
    expect(plannerSource).toContain("data-trip-route-map");
    expect(plannerSource).toContain("fitCoordinates={selectedRouteCoordinates}");
    expect(plannerSource).not.toContain("disableNavigationGestures");
    expect(plannerSource).toContain("data-trip-leg");
  });

  it("warns about unrealistic travel and lists every day in an overview", () => {
    expect(plannerSource).toContain("LONG_DAY_TRAVEL_MIN");
    expect(plannerSource).toContain("data-long-day-warning");
    expect(plannerSource).toContain("data-long-leg");
    expect(plannerSource).toContain("data-trip-overview");
  });

  it("labels the buy action with what checkout can actually add", () => {
    expect(plannerSource).toContain("countTripPurchasableItems(trip.items, activitiesById)");
    expect(plannerSource).toContain('tCustomer("ui.tripCheckout.buy", { count: purchasableCount })');
    expect(plannerSource).toContain('tCustomer("ui.tripCheckout.addFailed"');
    expect(plannerSource).toContain('tCustomer("ui.tripCheckout.unavailable"');
  });

  it("disables map navigation gestures while preserving route fitting and marker clicks", () => {
    expect(mapRendererSource).toContain("dragPan={!disableNavigationGestures}");
    expect(mapRendererSource).toContain("scrollZoom={!disableNavigationGestures}");
    expect(mapRendererSource).toContain("touchZoomRotate={!disableNavigationGestures}");
    expect(mapRendererSource).toContain("touchPitch={!disableNavigationGestures}");
    expect(mapRendererSource).toContain("map.fitBounds(");
    expect(mapRendererSource).toContain("maxZoom: 12.5");
    expect(mapRendererSource).toContain("onClick={handleMapClick}");
  });

  it("keeps weather requests private, race-safe, and attached to this trip", () => {
    const hookSource = readFileSync(new URL("../[tripId]/use-itinerary-weather.ts", import.meta.url), "utf8");
    expect(hookSource).toContain('cache: "no-store"');
    expect(hookSource).toContain("AbortController");
    expect(hookSource).toContain("requestFingerprint");
    expect(hookSource).toContain("tripId");
  });

  it("keeps the weather simulator local-only", () => {
    expect(plannerSource).toContain('process.env.NODE_ENV !== "production"');
    expect(plannerSource).toContain("buildSimulatedWeatherResult(selectedDate, overlayHour)");
    expect(plannerSource).toContain("simulationEnabled");
    expect(plannerSource).toContain('simulationActive ? "forecast"');
    expect(plannerSource).toContain("buildSimulatedWeatherOverlay");
    expect(plannerSource).toContain("!simulationActive");
    expect(plannerSource).toContain('simulationLabel={simulationLabel}');
  });

  it("lets users resize and collapse the AI panel with keyboard and pointer input", () => {
    expect(plannerSource).toContain("onPointerDown={handleAiResizeStart}");
    expect(plannerSource).toContain('role="separator"');
    expect(plannerSource).toContain('aria-valuenow={aiWidth}');
    expect(plannerSource).toContain('event.key === "ArrowRight"');
    expect(plannerSource).toContain("aiCollapsed");
    expect(plannerSource).toContain("setAiCollapsed");
    expect(plannerSource).toContain('aria-expanded={!aiCollapsed}');
    expect(plannerSource).toContain('"--planner-ai-width"');
  });

  it("keeps panel controls usable when switching to the single-panel mobile view", () => {
    expect(plannerSource).toContain('plannerViews")}');
    expect(plannerSource).toContain('(["ai", "itinerary", "map", "places"] as const)');
    expect(plannerSource).toContain('aiCollapsed ? "flex xl:hidden" : "flex"');
    expect(plannerSource).toContain('placesCollapsed ? "flex xl:hidden" : "flex"');
    expect(plannerSource).toContain("xl:grid-cols-[var(--planner-ai-width)_minmax(360px,440px)_minmax(0,1fr)_var(--planner-places-width)]");
    expect(plannerSource).toContain("border-r border-border bg-card xl:flex");
  });

  it("keeps place search, filters, result paging, and map-focus behavior", () => {
    expect(plannerSource).toContain("TripPlaceFilterPanel");
    expect(plannerSource).toContain("filterAndRankTripPlaces");
    expect(plannerSource).toContain("placeFilters.distanceKm");
    expect(plannerSource).toContain("data-promoted-activity");
    expect(plannerSource).toContain("eventType, productId");
    expect(plannerSource).toContain("function focusPin");
    expect(plannerSource).toContain('setPlacesPage(1)');
    expect(plannerSource).toContain("const PLACES_PAGE_SIZE = 15");
  });

  it("loads distance-enriched activities around the start or the selected day's last stop", () => {
    expect(plannerSource).toContain("const discoveryNear = getTripDiscoveryAnchor(trip.items, selectedDate) ?? (near ?? (dayLastStop ?");
    expect(plannerSource).toContain('discoveryNear ? `?${new URLSearchParams({lat:String(discoveryNear.lat),lng:String(discoveryNear.lng)})}` : ""');
    expect(plannerSource).toContain("/api/trips/${encodeURIComponent(tripData.id)}/activities${query}");
    expect(plannerSource).not.toContain("getActivitiesByIds");
    expect(plannerSource).toContain('[tripData.id, discoveryFingerprint, discoveryNear?.lat, discoveryNear?.lng, initialDiscoveryFingerprint]');
  });

  it("reveals the map when a weather risk window is selected", () => {
    expect(plannerSource).toContain("handleSelectWeatherRiskHour");
    expect(plannerSource).toContain('setWeatherMapMode("forecast")');
    expect(plannerSource).toContain("setOverlayHour(hour)");
    expect(plannerSource).toContain("onSelectRiskHour");
  });

  it("retains real route traffic status and explains the shared color legend", () => {
    expect(plannerSource).toContain("buildRouteDepartureTime");
    expect(plannerSource).toContain("useTripRoutes(hasDifferentRoutePoints ? selectedRouteCoordinates : [], mode, routeDepartureTime, routeRefreshTick)");
    expect(plannerSource).toContain("const sameLocationRoute = selectedRouteCoordinates.length >= 2 && !hasDifferentRoutePoints");
    expect(plannerSource).toContain('tCustomer("ui.trip.sameLocationNoTravel")');
    expect(routeHookSource).toContain("departureTime:departure");
    expect(plannerSource).toContain("trafficSegments: route.traffic?.segments");
    expect(plannerSource).toContain("data-route-traffic-status");
    expect(plannerSource).toContain('tCustomer("ui.map.trafficLive")');
    expect(plannerSource).toContain('tCustomer("ui.map.trafficPredicted")');
    expect(plannerSource).toContain("ROUTE_TRAFFIC_REFRESH_MS");
    expect(plannerSource).toContain('document.visibilityState === "visible"');
  });

  it("shows the traffic color legend only with real segments and explains when traffic is unavailable", () => {
    expect(plannerSource).toContain("data-route-traffic-legend");
    expect(plannerSource).toContain('label: "ui.map.trafficNormal"');
    expect(plannerSource).toContain('label: "ui.map.trafficSlow"');
    expect(plannerSource).toContain('label: "ui.map.trafficCongested"');
    expect(plannerSource).toContain('label: "ui.map.trafficSevere"');
    expect(plannerSource).toContain('label: "ui.map.trafficUnknown"');
    expect(plannerSource).toContain('tCustomer("ui.map.trafficUnavailable")');
    expect(plannerSource).toContain("ROUTE_TRAFFIC_COLORS");
  });
});
