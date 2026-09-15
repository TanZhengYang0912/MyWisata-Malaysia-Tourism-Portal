import { describe, expect, it } from "vitest";
import {
  fallbackTripNameSuggestions,
  isMeaningfulTripIdea,
  nextDefaultTripName,
  parseSubmittedTripDates,
  parseSubmittedTripName,
  parseTripNameSuggestions,
  tripDuration,
} from "@/lib/customer/trip-name";

describe("trip name defaults", () => {
  it("starts at Trip 1 when no default names exist", () => {
    expect(nextDefaultTripName([])).toBe("Trip 1");
    expect(nextDefaultTripName([{ name: "Penang Escape" }, { name: "My Trip 8" }])).toBe("Trip 1");
  });

  it("advances beyond the greatest valid default without filling deleted gaps", () => {
    expect(nextDefaultTripName([
      { name: "Trip 1" },
      { name: "trip 3" },
      { name: " Trip 2 " },
      { name: "Trip 0" },
      { name: "Trip 9007199254740991" },
    ])).toBe("Trip 4");
    expect(nextDefaultTripName([], 3)).toBe("Trip 4");
  });

  it("requires a meaningful idea instead of an untouched generated default", () => {
    expect(isMeaningfulTripIdea("Penang", "Trip 4")).toBe(true);
    expect(isMeaningfulTripIdea("Trip 4", "Trip 4")).toBe(false);
    expect(isMeaningfulTripIdea("Trip 99", "Trip 4")).toBe(false);
    expect(isMeaningfulTripIdea(" ", "Trip 4")).toBe(false);
  });

  it("accepts only safe bounded string values from FormData", () => {
    expect(parseSubmittedTripName("  Penang Escape  ")).toBe("Penang Escape");
    expect(parseSubmittedTripName("   ")).toBeNull();
    expect(parseSubmittedTripName(null)).toBeNull();
    expect(() => parseSubmittedTripName({ name: "uploaded.txt" })).toThrow(RangeError);
    expect(() => parseSubmittedTripName("x".repeat(61))).toThrow(RangeError);
    expect(() => parseSubmittedTripName("Penang\u202Etrip")).toThrow(RangeError);
  });

  it("accepts only an empty or complete valid FormData date range", () => {
    expect(parseSubmittedTripDates("2026-09-17", "2026-09-19")).toEqual({
      startDate: "2026-09-17",
      endDate: "2026-09-19",
    });
    expect(parseSubmittedTripDates("", "")).toEqual({ startDate: undefined, endDate: undefined });
    expect(() => parseSubmittedTripDates({ name: "date.txt" }, "2026-09-19")).toThrow(RangeError);
    expect(() => parseSubmittedTripDates("2026-02-30", "2026-03-02")).toThrow(RangeError);
    expect(() => parseSubmittedTripDates("2026-09-19", "2026-09-17")).toThrow(RangeError);
    expect(() => parseSubmittedTripDates("2026-09-17", "")).toThrow(RangeError);
  });
});

describe("trip duration", () => {
  it("calculates inclusive calendar days and nights", () => {
    expect(tripDuration("2026-09-17", "2026-09-19")).toEqual({ days: 3, nights: 2 });
    expect(tripDuration("2026-09-17", "2026-09-17")).toEqual({ days: 1, nights: 0 });
  });

  it("rejects malformed, impossible, and reversed ranges", () => {
    expect(() => tripDuration("17-09-2026", "2026-09-19")).toThrow(RangeError);
    expect(() => tripDuration("2026-02-30", "2026-03-02")).toThrow(RangeError);
    expect(() => tripDuration("2026-09-19", "2026-09-17")).toThrow(RangeError);
  });
});

describe("trip name suggestions", () => {
  const duration = { days: 3, nights: 2 };

  it("accepts three distinct grounded names from plain or fenced JSON", () => {
    const raw = '```json\n{"suggestions":["Penang 3D2N Escape","Discover Penang","Penang Getaway"]}\n```';
    expect(parseTripNameSuggestions(raw, duration)).toEqual([
      "Penang 3D2N Escape",
      "Discover Penang",
      "Penang Getaway",
    ]);
  });

  it("removes duplicates, markup, excessive text, and conflicting durations", () => {
    const raw = JSON.stringify({ suggestions: [
      "Penang 7D6N",
      "Penang 3 days 2 nights",
      "penang 3 DAYS 2 NIGHTS",
      "槟城 4天3夜",
      "Penang 3 hari 2 malam",
      "<b>Penang</b>",
      "x".repeat(61),
    ] });
    expect(parseTripNameSuggestions(raw, duration)).toEqual([
      "Penang 3 days 2 nights",
      "Penang 3 hari 2 malam",
    ]);
  });

  it("rejects malformed response shapes", () => {
    expect(parseTripNameSuggestions("not json", duration)).toEqual([]);
    expect(parseTripNameSuggestions('{"suggestions":"Penang"}', duration)).toEqual([]);
  });

  it("builds three safe deterministic fallbacks grounded in the duration", () => {
    expect(fallbackTripNameSuggestions("  Penang  ", duration)).toEqual([
      "Penang 3D2N",
      "Penang Escape",
      "Penang Getaway",
    ]);
    const suggestions = fallbackTripNameSuggestions("<script>alert(1)</script>", duration);
    expect(suggestions).toHaveLength(3);
    expect(suggestions.every((name) => name.length <= 60 && !/[<>]/.test(name))).toBe(true);
  });

  it("localizes deterministic fallbacks to the selected app locale", () => {
    expect(fallbackTripNameSuggestions("马六甲", duration, "zh-CN")).toEqual([
      "马六甲 3天2夜",
      "漫游马六甲",
      "马六甲探索之旅",
    ]);
    expect(fallbackTripNameSuggestions("Melaka", duration, "ms")).toEqual([
      "Melaka 3 Hari 2 Malam",
      "Percutian Melaka",
      "Terokai Melaka",
    ]);
  });

  it("rejects English-only AI names when Simplified Chinese is requested", () => {
    const raw = JSON.stringify({ suggestions: [
      "Melaka 3D2N Escape",
      "Discover Melaka",
      "Melaka Getaway",
    ] });
    expect(parseTripNameSuggestions(raw, duration, "zh-CN")).toEqual([]);
  });

  it("does not return PII or bidirectional control characters from AI or fallback names", () => {
    const raw = JSON.stringify({ suggestions: [
      "Alice alice@example.com Penang",
      "Call +60123456789 for Penang",
      "IC 990101-14-5678 Penang",
      "Passport A12345678 Penang",
      "Penang\u202Egnorw",
    ] });
    expect(parseTripNameSuggestions(raw, duration)).toEqual([]);

    const fallback = fallbackTripNameSuggestions("Penang alice@example.com +60123456789", duration);
    expect(fallback.join(" ")).not.toContain("alice@example.com");
    expect(fallback.join(" ")).not.toContain("+60123456789");
  });
});
