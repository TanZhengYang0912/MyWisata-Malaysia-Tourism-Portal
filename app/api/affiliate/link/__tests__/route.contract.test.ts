import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("affiliate link verification contract", () => {
  const source = readFileSync(resolve(process.cwd(), "app/api/affiliate/link/route.ts"), "utf8");

  it("authenticates reads and writes and enforces limited/full tiers", () => {
    const post = source.slice(source.indexOf("export async function POST"));
    expect((source.match(/if \(!user\) return apiFail\('UNAUTHORIZED'/g) ?? []).length).toBe(2);
    expect(source).toContain("REQUIRED_TIER.AFFILIATE_BASIC");
    expect(post.indexOf("REQUIRED_TIER.AFFILIATE_BASIC")).toBeLessThan(post.indexOf("getOrCreateAffiliateLink"));
    expect(source).toContain("profile.tier === 'kyc_verified' && profile.kyc_status === 'approved'");
  });
});
