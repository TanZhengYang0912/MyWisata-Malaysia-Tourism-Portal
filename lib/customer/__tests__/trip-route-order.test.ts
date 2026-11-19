import { describe, expect, it } from "vitest";
import { orderTripStops, type RouteOrderStop } from "../trip-route-order";

const stops: RouteOrderStop[] = [
  { id: "origin", lat: 0, lng: 0, isDayOrigin: true },
  { id: "late", lat: 0, lng: 2, scheduledTime: "15:00" },
  { id: "flex", lat: 0, lng: 1 },
  { id: "early", lat: 0, lng: 3, scheduledTime: "10:00" },
];

describe("orderTripStops", () => {
  it("keeps the day origin first and fixed-time stops chronological", () => {
    const result = orderTripStops(stops);
    expect(result.ids[0]).toBe("origin");
    expect(result.ids.indexOf("early")).toBeLessThan(result.ids.indexOf("late"));
    expect(result.basis).toBe("approximate");
  });

  it("uses directed matrix costs and preserves fixed-time anchors", () => {
    const matrix = [
      [0, 600, 120, 300],
      [600, 0, 300, 120],
      [120, 300, 0, 600],
      [300, 120, 600, 0],
    ];
    const result = orderTripStops(stops, matrix);
    expect(result.basis).toBe("matrix");
    expect(result.ids[0]).toBe("origin");
    expect(result.ids.indexOf("early")).toBeLessThan(result.ids.indexOf("late"));
    expect(result.ids).toHaveLength(stops.length);
  });

  it("falls back when matrix dimensions do not match the stops", () => {
    expect(orderTripStops(stops, [[0]]).basis).toBe("approximate");
  });

  it("starts without an explicit origin at the earliest fixed-time stop", () => {
    const result = orderTripStops(stops.filter((stop) => stop.id !== "origin"));
    expect(result.ids[0]).toBe("early");
    expect(result.ids.indexOf("early")).toBeLessThan(result.ids.indexOf("late"));
  });

  it("keeps every existing stop in order and does not place new unscheduled stops between timed anchors", () => {
    const existing = [
      { id: "origin", lat: 0, lng: 0, isDayOrigin: true, isExisting: true },
      { id: "morning", lat: 0, lng: 1, scheduledTime: "10:00", isExisting: true },
      { id: "evening", lat: 0, lng: 2, scheduledTime: "18:00", isExisting: true },
    ];
    const result = orderTripStops([...existing, { id: "new", lat: 0, lng: 1.5 }]);
    expect(result.ids.indexOf("origin")).toBeLessThan(result.ids.indexOf("morning"));
    expect(result.ids.indexOf("morning")).toBeLessThan(result.ids.indexOf("evening"));
    expect(result.ids.indexOf("new")).not.toBe(result.ids.indexOf("evening") - 1);
  });
});
