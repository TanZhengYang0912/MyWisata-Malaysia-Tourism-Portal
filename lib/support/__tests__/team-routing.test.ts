import { describe, expect, it } from "vitest";
import { TICKET_CATEGORIES } from "@/lib/chatbot/classify";
import { CATEGORY_TEAM, teamForCategory } from "../team-routing";

describe("teamForCategory", () => {
  it("has a team for every known ticket category", () => {
    for (const category of TICKET_CATEGORIES) {
      expect(teamForCategory(category)).toBe(CATEGORY_TEAM[category]);
      expect(teamForCategory(category).length).toBeGreaterThan(0);
    }
  });

  it("routes the new categories to their own dedicated team", () => {
    expect(teamForCategory("kyc")).toBe("KYC Team");
    expect(teamForCategory("technical")).toBe("Technical Support Team");
    expect(teamForCategory("withdrawal")).toBe("Wallet Team");
  });

  it("falls back to the general team for an unknown/legacy category", () => {
    expect(teamForCategory("something_old")).toBe(CATEGORY_TEAM.general);
    expect(teamForCategory("")).toBe(CATEGORY_TEAM.general);
  });
});
