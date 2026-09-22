import { describe, expect, it } from "vitest";
import { ticketProgress } from "../ticket-progress";

describe("ticket entry progress", () => {
  it("shows one used entry and no remaining entries after a single-entry scan", () => {
    expect(ticketProgress("single_entry", 1, 1)).toEqual({ used: 1, total: 1, remaining: 0, unit: "entry" });
  });

  it("counts multi-entry scans as visits", () => {
    expect(ticketProgress("multi_entry", 3, 1)).toEqual({ used: 1, total: 3, remaining: 2, unit: "visits" });
  });

  it("counts group admission as guests and clamps stale values", () => {
    expect(ticketProgress("group_entry", 4, 8)).toEqual({ used: 4, total: 4, remaining: 0, unit: "guests" });
  });
});
