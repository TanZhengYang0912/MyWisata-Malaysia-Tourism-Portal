import { describe, expect, it } from "vitest";
import { outletCreateSchema } from "../vendor-schemas";

describe("outlet food service modes", () => {
  it("defaults new outlets to dine-in and takeaway", () => {
    expect(outletCreateSchema.parse({ name: "Food outlet" }).foodServiceModes).toEqual(["dine_in", "takeaway"]);
  });

  it("requires an outlet to support at least one recognized mode", () => {
    expect(outletCreateSchema.safeParse({ name: "Food outlet", foodServiceModes: [] }).success).toBe(false);
    expect(outletCreateSchema.safeParse({ name: "Food outlet", foodServiceModes: ["delivery"] }).success).toBe(false);
    expect(outletCreateSchema.safeParse({ name: "Food outlet", foodServiceModes: ["dine_in", "dine_in"] }).success).toBe(false);
  });
});
