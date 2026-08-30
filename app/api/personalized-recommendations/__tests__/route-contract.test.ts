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

  it("uses the current canonical Profile evidence rather than trusting a historical timestamp", () => {
    expect(source).not.toContain("PERSONALIZED_TIERS");
    expect(source).not.toContain("select('tier");
    expect(source).toContain("profile_completed_at");
    expect(source).toContain("computeProfileVerification");
    expect(source).toContain("full_name,avatar_url,bio");
    expect(source).toMatch(/Boolean\(profile\.profile_completed_at\)[\s\S]*profileVerification\.complete/);
  });
});
