import { describe, expect, it } from "vitest";
import { parseDiscoveryQuery, serializeDiscoveryQuery } from "@/lib/customer/discovery-query";

describe("shareable discovery query", () => {
  it("round-trips the supported discovery filters in canonical order", () => {
    const parsed = parseDiscoveryQuery(new URLSearchParams(
      "q=diving&state=Sabah&category=activity&priceMax=150&free=1&bookable=1&hiddenGem=1",
    ));

    expect(parsed).toEqual({
      q: "diving",
      state: "Sabah",
      category: "activity",
      priceMax: 150,
      freeOnly: true,
      bookableOnly: true,
      hiddenGemOnly: true,
    });
    expect(serializeDiscoveryQuery(parsed).toString()).toBe(
      "q=diving&state=Sabah&category=activity&priceMax=150&free=1&bookable=1&hiddenGem=1",
    );
  });

  it("trims strings, rejects invalid price limits, and omits defaults", () => {
    const parsed = parseDiscoveryQuery(new URLSearchParams(
      "q=%20%20&state=%20Sabah%20&category=%20activity%20&priceMax=-1&free=0&bookable=true&hiddenGem=yes",
    ));

    expect(parsed).toEqual({
      q: "",
      state: "Sabah",
      category: "activity",
      priceMax: null,
      freeOnly: false,
      bookableOnly: false,
      hiddenGemOnly: false,
    });
    expect(serializeDiscoveryQuery(parsed).toString()).toBe("state=Sabah&category=activity");
  });
});
