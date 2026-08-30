import { describe, expect, it } from "vitest";
import { isDemoToolRuntimeEnabled } from "@/lib/demo/runtime";

describe("Demo tool runtime isolation", () => {
  it("requires an explicit opt-in", () => {
    expect(isDemoToolRuntimeEnabled({ NODE_ENV: "development" })).toBe(false);
    expect(isDemoToolRuntimeEnabled({ NODE_ENV: "development", MYWISATA_DEMO_TOOLS: "true" })).toBe(true);
  });

  it("cannot be enabled in production", () => {
    expect(isDemoToolRuntimeEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "production",
      MYWISATA_DEMO_TOOLS: "true",
    })).toBe(false);
    expect(isDemoToolRuntimeEnabled({
      NODE_ENV: "development",
      MYWISATA_ENV: "production",
      MYWISATA_DEMO_TOOLS: "true",
    })).toBe(false);
  });

  it("allows an explicitly opted-in preview or staging deployment", () => {
    expect(isDemoToolRuntimeEnabled({
      NODE_ENV: "production",
      VERCEL_ENV: "preview",
      MYWISATA_DEMO_TOOLS: "true",
    })).toBe(true);
    expect(isDemoToolRuntimeEnabled({
      NODE_ENV: "production",
      MYWISATA_ENV: "staging",
      MYWISATA_DEMO_TOOLS: "true",
    })).toBe(true);
  });
});
