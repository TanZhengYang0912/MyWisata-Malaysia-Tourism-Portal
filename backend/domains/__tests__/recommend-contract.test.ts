import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "backend/domains/recommend.ts"),
  "utf8",
);

describe("canonical recommendation preference contract", () => {
  it("keeps the shared recommendation domain independent of profile survey persistence", () => {
    expect(source).toContain("preferred_radius_km");
    expect(source).not.toContain("travel_style");
    expect(source).not.toContain("travelStyle");
  });
});
