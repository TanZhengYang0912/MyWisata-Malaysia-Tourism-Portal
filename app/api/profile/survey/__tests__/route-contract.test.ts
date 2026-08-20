import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const surveyRoute = readFileSync(
  resolve(process.cwd(), "app/api/profile/survey/route.ts"),
  "utf8",
);
const profileRoute = readFileSync(
  resolve(process.cwd(), "app/api/profile/me/route.ts"),
  "utf8",
);

describe("profile preference route contracts", () => {
  it("uses only supported survey fields", () => {
    expect(surveyRoute).toContain("preferred_radius_km");
    expect(surveyRoute).not.toMatch(
      /travel_style|group_composition|p_travel_style|p_group_composition/,
    );
  });

  it("maps the profile summary from the numeric radius column", () => {
    expect(profileRoute).toContain("preferred_radius_km");
    expect(profileRoute).not.toContain("preferred_distance");
    expect(profileRoute).not.toContain("travel_style");
  });
});
