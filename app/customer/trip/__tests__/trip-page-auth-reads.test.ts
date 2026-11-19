import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const hubPageSource = readFileSync(new URL("../page.tsx", import.meta.url), "utf8");
const plannerPageSource = readFileSync(new URL("../[tripId]/page.tsx", import.meta.url), "utf8");

describe("trip page sign-in and read contract", () => {
  it("redirects with verified claims and leaves the owner check to the trip reads", () => {
    for (const source of [hubPageSource, plannerPageSource]) {
      expect(source).toContain("await getClaimsUserId(db)");
      expect(source).not.toContain("auth.getUser()");
    }
  });

  it("reads the trip list once on the hub", () => {
    expect(hubPageSource.match(/getTrips\(db\)/g)).toHaveLength(1);
    expect(hubPageSource).not.toContain("await getTripNameSequence");
    expect(hubPageSource).toContain("highestDefaultTripNumber(trips)");
  });

  it("loads the planner trip and its stops together", () => {
    expect(plannerPageSource).toContain("await Promise.all([getTripById(tripId, db), getTripItems(tripId, db)])");
    expect(plannerPageSource).toContain("notFound()");
  });
});
