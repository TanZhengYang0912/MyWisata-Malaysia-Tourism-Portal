import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

describe("customer verification page gates", () => {
  it("uses the central capability policy on tier-sensitive pages", () => {
    expect(read("app/customer/wallet/page.tsx")).toContain("CUSTOMER_CAPABILITY.CHECKOUT");
    expect(read("app/customer/wallet/page.tsx")).toContain("CUSTOMER_CAPABILITY.WITHDRAWAL");
    expect(read("app/customer/checkout/page.tsx")).toContain("CUSTOMER_CAPABILITY.CHECKOUT");
    expect(read("app/customer/for-you/for-you-client.tsx")).toContain("CUSTOMER_CAPABILITY.BASIC_AI");
    expect(read("app/customer/recommendations/page.tsx")).toContain("CUSTOMER_CAPABILITY.RECOMMENDATION_SUBMIT");
    expect(read("app/customer/affiliate/page.tsx")).toContain("CUSTOMER_CAPABILITY.AFFILIATE_LIMITED");
  });

  it("preserves safe continuations through profile and KYC", () => {
    expect(read("app/customer/profile/page.tsx")).toContain('searchParams.get("next")');
    expect(read("app/customer/kyc/page.tsx")).toContain('searchParams.get("next")');
  });

  it.each([
    ["app/customer/wallet/page.tsx", "fetch('/api/wallet/summary')"],
    ["app/customer/checkout/page.tsx", 'fetch("/api/wallet/summary")'],
    ["app/customer/profile/page.tsx", 'fetch("/api/profile/me")'],
    ["app/customer/kyc/page.tsx", 'fetch("/api/kyc/submission")'],
    ["app/customer/recommendations/page.tsx", "fetch('/api/recommendations')"],
  ])("guards private loading in %s", (path, request) => {
    const source = read(path);
    expect(source).toContain("GuestAccountEmptyState");
    expect(source.indexOf("if (!currentUser")).toBeLessThan(source.indexOf(request));
  });

  it("does not invoke the affiliate stats loader for a Guest", () => {
    const source = read("app/customer/affiliate/page.tsx");
    const effect = source.slice(source.indexOf("useEffect(() => {"));
    expect(source).toContain("GuestAccountEmptyState");
    expect(effect.indexOf("if (!currentUser")).toBeLessThan(effect.indexOf("await loadStats()"));
  });

  it("keeps withdrawal receipts private for Guests", () => {
    const source = read("app/customer/wallet/withdrawals/[id]/page.tsx");
    expect(source).toContain("GuestAccountEmptyState");
    expect(source.indexOf("if (!currentUser")).toBeLessThan(source.indexOf("fetch(`/api/wallet/withdrawals/"));
  });

  it("renders public popular activities before personalized AI is available", () => {
    const server = read("app/customer/for-you/page.tsx");
    const client = read("app/customer/for-you/for-you-client.tsx");
    expect(server).toContain("searchActivities");
    expect(server).toContain("initialPopular");
    expect(client).toContain("initialPopular: ComputedActivity[]");
  });
});
