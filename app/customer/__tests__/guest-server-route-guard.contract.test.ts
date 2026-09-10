import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const page = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");
const tripPage = page("app/customer/trip/page.tsx");
const tripPlannerPage = page("app/customer/trip/[tripId]/page.tsx");
const registerVendorPage = page("app/customer/profile/register-vendor/page.tsx");

describe("guest server route guards", () => {
  it("stops a guest before loading trip data", () => {
    expect(tripPage).not.toContain("redirect(");
    expect(tripPage).toContain("if (!user) {\n    return null;\n  }");
    expect(tripPage.indexOf("if (!user)")).toBeLessThan(tripPage.indexOf("getTrips(db)"));
  });

  it("stops a guest before loading a trip planner", () => {
    expect(tripPlannerPage).not.toContain("redirect(");
    expect(tripPlannerPage).toContain("if (!user) {\n    return null;\n  }");
    expect(tripPlannerPage.indexOf("if (!user)")).toBeLessThan(tripPlannerPage.indexOf("getTripById(tripId, db)"));
  });

  it("stops a guest before reading vendor onboarding data", () => {
    expect(registerVendorPage).not.toContain("redirect(");
    expect(registerVendorPage).toContain("if (!user) {\n    return null;\n  }");
    expect(registerVendorPage.indexOf("if (!user)")).toBeLessThan(registerVendorPage.indexOf('.from(\'vendors\')'));
  });
});
