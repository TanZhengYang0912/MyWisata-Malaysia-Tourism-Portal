import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const source = fs.readFileSync(path.resolve(process.cwd(), "app/customer/trip/[tripId]/trip-planner-client.tsx"), "utf8");
const pageSource = fs.readFileSync(path.resolve(process.cwd(), "app/customer/trip/[tripId]/page.tsx"), "utf8");

describe("journey canvas integration contract", () => {
  it("allows real catalogue activities to be dragged or keyboard-assigned directly to a day", () => {
    expect(source).toContain('kind: "catalogue"');
    expect(source).toContain("scheduled_date: schedule?.date");
    expect(source).toContain("draggable={!added}");
    expect(source).toContain("chooseDayForActivity");
  });

  it("shows real activity imagery in itinerary and map markers", () => {
    expect(source).toContain("activity?.image");
    expect(source).toContain("imageUrl:");
    expect(source).toContain("data-itinerary-image");
  });

  it("routes and requests weather for the selected day", () => {
    expect(source).toContain("selectedDate");
    expect(source).toContain("selectedRouteStops");
    expect(source).toContain("useWeatherOverlay");
    expect(source).toContain("<TripWeatherMapOverlay");
    expect(source).toContain("isValidTripCoordinate(item.lat, item.lng)");
  });

  it("uses live radar only for today and forecast for future times", () => {
    expect(source).toContain("canUseLiveRadar");
    expect(source).toContain("useWeatherRadar");
    expect(source).toContain("useState<WeatherMapMode>(() => canUseLiveRadar");
    expect(source).toContain('weatherMapMode === "now"');
    expect(source).toContain('activeWeatherMapMode === "now"');
    expect(source).toContain('activeWeatherMapMode === "forecast"');
  });

  it("rolls schedule changes back with an accessible error", () => {
    expect(source).toContain('alert(t("strictMigration.tripPlanner.scheduleFailed"))');
  });

  it("constrains stop times by itinerary order and rolls rejected reorders back", () => {
    expect(source).toContain("getTripItemTimeBounds");
    expect(source).toContain("min={timeBounds.min}");
    expect(source).toContain("max={timeBounds.max}");
    expect(source).toContain("disabled={timeBounds.disabled}");
    expect(source).toContain("const previousItems = items;");
    expect(source).toContain("setItems(previousItems);");
  });

  it("projects only public sponsored fields and vendor suggestion timestamps into the canvas", () => {
    expect(pageSource).toContain('rpc("list_active_sponsored_discovery_placements")');
    expect(pageSource).toContain('.from("vendor_recommendations")');
    expect(pageSource).toContain('.select("converted_vendor_id,created_at")');
    expect(pageSource).toContain("collapseSuggestedAtByVendor");
    expect(pageSource).toContain("sponsoredPlacements={sponsoredPlacements}");
    expect(pageSource).toContain("suggestedAtByVendor={suggestedAtByVendor}");
    expect(pageSource).not.toContain("recommender_id");
    expect(pageSource).not.toContain("recommendation_images");
    expect(pageSource).not.toContain("why_recommend");
    expect(pageSource).not.toContain("reviewer_id");
  });
});
