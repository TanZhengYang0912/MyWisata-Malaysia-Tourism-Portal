import { describe, expect, it } from "vitest";
import { parseDiscoveryQuery, serializeDiscoveryQuery } from "@/lib/customer/discovery-query";

describe("shareable discovery query", () => {
  it("round-trips the supported discovery filters in canonical order", () => {
    const parsed = parseDiscoveryQuery(new URLSearchParams(
      "q=diving&state=Sabah&category=activity&category=food&type=activity%3Anature&type=food%3Aseafood&priceMax=150&timeFrom=14%3A00&timeTo=16%3A00&free=1&bookable=1&hiddenGem=1&family=1&couple=1",
    ));

    expect(parsed).toEqual({
      q: "diving",
      state: "Sabah",
      categories: ["activity", "food"],
      types: ["activity:nature", "food:seafood"],
      priceMax: 150,
      operatingDays: [],
      hoursMode: "during",
      timeAt: null,
      overnight: false,
      timeFrom: "14:00",
      timeTo: "16:00",
      openNow: false,
      freeOnly: true,
      bookableOnly: true,
      hiddenGemOnly: true,
      familyFriendlyOnly: true,
      coupleFriendlyOnly: true,
    });
    expect(serializeDiscoveryQuery(parsed).toString()).toBe(
      "q=diving&state=Sabah&category=activity&category=food&type=activity%3Anature&type=food%3Aseafood&priceMax=150&timeFrom=14%3A00&timeTo=16%3A00&free=1&bookable=1&hiddenGem=1&family=1&couple=1",
    );
  });

  it("trims strings, rejects invalid price limits, and omits defaults", () => {
    const parsed = parseDiscoveryQuery(new URLSearchParams(
      "q=%20%20&state=%20Sabah%20&category=%20activity%20&category=activity&type=%20activity%3Anature%20&type=activity%3Anature&priceMax=-1&timeFrom=14%3A00&timeTo=bad&free=0&bookable=true&hiddenGem=yes&family=0&couple=true",
    ));

    expect(parsed).toEqual({
      q: "",
      state: "Sabah",
      categories: ["activity"],
      types: ["activity:nature"],
      priceMax: null,
      operatingDays: [],
      hoursMode: "during",
      timeAt: null,
      overnight: false,
      timeFrom: "14:00",
      timeTo: null,
      openNow: false,
      freeOnly: false,
      bookableOnly: false,
      hiddenGemOnly: false,
      familyFriendlyOnly: false,
      coupleFriendlyOnly: false,
    });
    expect(serializeDiscoveryQuery(parsed).toString()).toBe("state=Sabah&category=activity&type=activity%3Anature&timeFrom=14%3A00");
  });

  it("round-trips detailed weekly opening filters", () => {
    const parsed = parseDiscoveryQuery(new URLSearchParams(
      "hoursDay=mon&hoursDay=fri&hoursMode=at&timeAt=23%3A30&overnight=1&openNow=1",
    ));

    expect(parsed.operatingDays).toEqual(["mon", "fri"]);
    expect(parsed.hoursMode).toBe("at");
    expect(parsed.timeAt).toBe("23:30");
    expect(parsed.overnight).toBe(true);
    expect(parsed.openNow).toBe(true);
    expect(serializeDiscoveryQuery(parsed).toString()).toBe("hoursDay=mon&hoursDay=fri&hoursMode=at&timeAt=23%3A30&overnight=1&openNow=1");
  });
});
