import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const plannerSource = readFileSync(new URL("../[tripId]/trip-planner-client.tsx", import.meta.url), "utf8");
const actionsSource = readFileSync(new URL("../actions.ts", import.meta.url), "utf8");

describe("trip planner layout contract", () => {
  it("defines the approved itinerary, map, and listing regions", () => {
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.itinerary")}');
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.tripMap")}');
    expect(plannerSource).toContain('aria-label={tCustomer("strictMigration.tripPlanner.placesToAdd")}');
  });

  it("renders day-based scheduling and an unscheduled queue", () => {
    expect(plannerSource).toContain("groupTripItemsByDay");
    expect(plannerSource).toContain('tCustomer("strictMigration.tripPlanner.unscheduled")');
    expect(plannerSource).toContain("scheduled_date");
    expect(plannerSource).toContain("scheduled_time");
  });

  it("wires schedule changes through a server action", () => {
    expect(plannerSource).toContain("updateTripItemScheduleAction");
    expect(actionsSource).toContain("export async function updateTripItemScheduleAction");
  });
});
