import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const exploreSource = readFileSync(resolve(process.cwd(), "app/guest/explore/page.tsx"), "utf8");
const activitySource = readFileSync(resolve(process.cwd(), "app/guest/activity/[id]/page.tsx"), "utf8");
const vendorSource = readFileSync(resolve(process.cwd(), "app/guest/vendor/[vendorId]/page.tsx"), "utf8");

describe("legacy guest route contract", () => {
  it("redirects the old explore page to the canonical customer experience", () => {
    expect(exploreSource).toContain('redirect("/customer")');
    expect(exploreSource).not.toContain("searchActivities");
  });

  it("encodes dynamic listing and vendor ids before redirecting", () => {
    expect(activitySource).toContain("encodeURIComponent(id)");
    expect(activitySource).toContain('redirect(`/customer/activity/${safeId}`)');
    expect(activitySource).not.toContain("getComputedActivity");
    expect(vendorSource).toContain("encodeURIComponent(vendorId)");
    expect(vendorSource).toContain('redirect(`/customer/vendor/${safeVendorId}`)');
    expect(vendorSource).not.toContain("getGuestVendor");
  });
});
