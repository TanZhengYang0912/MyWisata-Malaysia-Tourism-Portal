import { describe, expect, it } from "vitest";
import { entryLabel } from "@/components/customer/place-card";
import type { Place } from "@/backend/core/types";

const place = { entryFee: 16 } as unknown as Place;

describe("entryLabel", () => {
  it("uses the resolved ticket price when the caller supplies one", () => {
    expect(entryLabel(place, undefined, { price: 18, fromTicket: true }).text).toContain("18");
  });

  it("falls back to the posted fee when nothing is resolved", () => {
    expect(entryLabel(place, undefined).text).toContain("16");
  });

  it("treats a resolved price of 0 as free, not as missing", () => {
    expect(entryLabel(place, undefined, { price: 0, fromTicket: true }).text).toBe("Free entry");
  });

  it("treats a resolved null as no gate", () => {
    const free = { entryFee: 0 } as unknown as Place;
    expect(entryLabel(free, undefined, { price: null, fromTicket: false }).text).toBe("Public access");
  });
});
