import { describe, expect, it } from "vitest";
import { isDemoMapRoute } from "@/lib/demo-map/route";

describe("demo map route isolation", () => {
  it("matches only the demo map surface", () => {
    expect(isDemoMapRoute("/demo/map")).toBe(true);
    expect(isDemoMapRoute("/demo/map/place-1")).toBe(true);
    expect(isDemoMapRoute("/customer/map")).toBe(false);
    expect(isDemoMapRoute("/demo/maps")).toBe(false);
  });
});
