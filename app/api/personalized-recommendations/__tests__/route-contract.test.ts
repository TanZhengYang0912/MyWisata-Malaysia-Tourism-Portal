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

  it("uses the Phone-gated basic-AI capability from the trusted user id", () => {
    expect(source).toMatch(/await resolveServerCustomerCapability\(user\.id, CUSTOMER_CAPABILITY\.BASIC_AI\)/);
    expect(source).toContain("customerCapabilityFailure");
    expect(source).not.toContain("PHONE_READY_TIERS");
  });

  it("does not use a legacy tier as recommendation authorization or personalization state", () => {
    expect(source).not.toContain("PERSONALIZED_TIERS");
    expect(source).not.toContain("select('tier");
    expect(source).toContain("profile_completed_at");
  });
});
