import { describe, expect, it } from "vitest";
import { parseTripPlanIntent } from "../trip-plan-intent";

const trip = {
  start_date: "2026-11-16",
  end_date: "2026-11-18",
};

describe("parseTripPlanIntent", () => {
  it("parses a mixed-category request into separate counts for the requested trip day", () => {
    expect(parseTripPlanIntent("第二天安排三个景点，顺便加两家顺路的美食", trip, "2026-11-16")).toMatchObject({
      directAdd: true,
      targetDate: "2026-11-17",
      groups: [
        { categorySlug: "activity", requestedCount: 3 },
        { categorySlug: "food", requestedCount: 2 },
      ],
      requestedTotal: 5,
      limitExceeded: false,
    });
  });

  it("uses the selected day and an explicit two-place default for vague mixed counts", () => {
    expect(parseTripPlanIntent("帮我安排这一天，有几个景点，顺便加几家美食", trip, "2026-11-17")).toMatchObject({
      directAdd: true,
      targetDate: "2026-11-17",
      groups: [
        { categorySlug: "activity", requestedCount: 2 },
        { categorySlug: "food", requestedCount: 2 },
      ],
      requestedTotal: 4,
    });
  });

  it.each([
    ["Plan day 2 with three attractions and two places to eat", [{ categorySlug: "activity", requestedCount: 3 }, { categorySlug: "food", requestedCount: 2 }]],
    ["Hari kedua atur tiga aktiviti dan dua tempat makan", [{ categorySlug: "activity", requestedCount: 3 }, { categorySlug: "food", requestedCount: 2 }]],
  ])("parses mixed category counts in English and Malay: %s", (preference, groups) => {
    expect(parseTripPlanIntent(preference, trip, "2026-11-16")).toMatchObject({
      directAdd: true,
      targetDate: "2026-11-17",
      groups,
      requestedTotal: 5,
    });
  });

  it("does not treat a mixed-category discovery request as a direct add", () => {
    expect(parseTripPlanIntent("看看第二天有什么景点和美食", trip, "2026-11-16")).toMatchObject({
      directAdd: false,
      groups: [],
    });
  });

  it("does not silently truncate mixed requests above the ten-place limit", () => {
    expect(parseTripPlanIntent("安排六个景点和六家美食", trip, "2026-11-16")).toMatchObject({
      directAdd: true,
      requestedTotal: 12,
      limitExceeded: true,
    });
  });

  it("recognizes a Chinese day, count, food request, and explicit add intent", () => {
    expect(parseTripPlanIntent("第二天帮我安排十个吃东西的地方", trip, "2026-11-16")).toEqual({
      directAdd: true,
      targetDate: "2026-11-17",
      requestedCount: 10,
      requestedDay: 2,
      categorySlug: "food",
      groups: [{ categorySlug: "food", requestedCount: 10 }],
      requestedTotal: 10,
      limitExceeded: false,
      needsDay: false,
      invalidDay: false,
      needsCategory: false,
    });
  });

  it("recognizes an English count and uses the currently selected trip date", () => {
    expect(parseTripPlanIntent("Add ten restaurants", trip, "2026-11-18")).toMatchObject({
      directAdd: true,
      targetDate: "2026-11-18",
      requestedCount: 10,
      categorySlug: "food",
      needsDay: false,
      needsCategory: false,
    });
  });

  it("recognizes a written ordinal day and the common places-to-eat phrasing", () => {
    expect(parseTripPlanIntent("Add ten places to eat on the second day", trip, "2026-11-16")).toMatchObject({
      directAdd: true,
      targetDate: "2026-11-17",
      requestedCount: 10,
      requestedDay: 2,
    });
  });

  it("does not auto-add when the request is only asking for ideas", () => {
    expect(parseTripPlanIntent("Give me 10 food places", trip, "2026-11-16").directAdd).toBe(false);
  });

  it("does not guess when an explicitly requested day is outside the trip", () => {
    expect(parseTripPlanIntent("Add 10 food places on day 4", trip, "2026-11-16")).toMatchObject({
      directAdd: true,
      targetDate: null,
      requestedDay: 4,
      needsDay: true,
      invalidDay: true,
      needsCategory: false,
    });
  });

  it("asks for a category when an explicit batch request leaves it open", () => {
    expect(parseTripPlanIntent("Add ten places to day 2", trip, "2026-11-16")).toMatchObject({
      directAdd: false,
      needsCategory: true,
      requestedCount: 10,
    });
  });
});
