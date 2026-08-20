import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/api/personalized-recommendations/route.ts"),
  "utf8",
);

describe("personalized recommendations route contract", () => {
  it("reads and maps the numeric preferred radius", () => {
    expect(source).toContain("preferred_radius_km");
    expect(source).toContain("preferredRadiusKm");
    expect(source).not.toContain("preferred_distance");
    expect(source).not.toContain("preferredDistance");
  });
});
