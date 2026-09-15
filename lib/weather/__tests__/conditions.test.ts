import { describe, expect, it } from "vitest";
import { weatherConditionForCode, weatherEffectConditionForCode } from "@/lib/weather/conditions";

describe("weather conditions", () => {
  it.each([
    [0, "clear", null],
    [1, "mainly-clear", null],
    [2, "partly-cloudy", null],
    [3, "overcast", "overcast"],
    [45, "fog", "fog"],
    [53, "drizzle", "drizzle"],
    [63, "rain", "rain"],
    [75, "snow", "snow"],
    [81, "showers", "showers"],
    [95, "thunderstorm", "thunderstorm"],
    [null, "unknown", null],
  ] as const)("maps WMO %s to %s with map effect %s", (code, condition, effect) => {
    expect(weatherConditionForCode(code)).toBe(condition);
    expect(weatherEffectConditionForCode(code)).toBe(effect);
  });
});
