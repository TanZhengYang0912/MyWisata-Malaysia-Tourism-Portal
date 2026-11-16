import { describe, expect, it } from "vitest";
import { formatEventShortDateRange, getDefaultStopId, getEventLocationPhase } from "@/lib/promotion-campaigns/locations";

describe("getEventLocationPhase", () => {
  const stop = { startsOn: "2026-10-03", endsOn: "2026-10-08", closesAt: "23:00" };
  const at = (iso: string) => getEventLocationPhase(stop, new Date(iso));

  it("is upcoming before the first day", () => {
    expect(at("2026-10-02T23:59:00+08:00")).toBe("upcoming");
  });
  it("is running from the first day, even before opening", () => {
    expect(at("2026-10-03T08:00:00+08:00")).toBe("running");
  });
  it("is running on the last day until closing, then ended", () => {
    expect(at("2026-10-08T22:59:00+08:00")).toBe("running");
    expect(at("2026-10-08T23:00:00+08:00")).toBe("ended");
    expect(at("2026-10-09T10:00:00+08:00")).toBe("ended");
  });
  it("uses the Malaysia calendar day, not UTC", () => {
    // 2026-10-02 16:30 UTC is already 2026-10-03 00:30 in Malaysia.
    expect(at("2026-10-02T16:30:00Z")).toBe("running");
  });
});

describe("formatEventShortDateRange", () => {
  it("omits the year and collapses a one-day range", () => {
    expect(formatEventShortDateRange("2026-10-03", "2026-10-08", "en")).not.toMatch(/2026/);
    expect(formatEventShortDateRange("2026-10-03", "2026-10-08", "en")).toMatch(/3.*8/);
    expect(formatEventShortDateRange("2026-11-14", "2026-11-14", "en")).toBe("Nov 14");
  });
});

describe("getDefaultStopId", () => {
  const stops = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const pick = (phases: string[]) => getDefaultStopId(stops, new Map(stops.map((stop, index) => [stop.id, phases[index] as "ended" | "running" | "upcoming"])));

  it("prefers the running stop, then the next upcoming one, then the last", () => {
    expect(pick(["ended", "running", "upcoming"])).toBe("b");
    expect(pick(["ended", "upcoming", "upcoming"])).toBe("b");
    expect(pick(["ended", "ended", "ended"])).toBe("c");
    expect(getDefaultStopId([], new Map())).toBeNull();
  });
});
