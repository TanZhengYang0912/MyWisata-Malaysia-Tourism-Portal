import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next.js development server", () => {
  it("uses the stable Webpack runner for development and production builds", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts?: { predev?: string; dev?: string; build?: string };
    };

    expect(packageJson.scripts?.predev).toBe("node scripts/prepare-next-dev-cache.mjs");
    expect(packageJson.scripts?.dev).toBe("next dev --webpack");
    expect(packageJson.scripts?.build).toBe("next build --webpack");
  });

  it("does not declare a Turbopack configuration", () => {
    const nextConfig = readFileSync(resolve(process.cwd(), "next.config.ts"), "utf8");

    expect(nextConfig).not.toMatch(/\bturbopack\s*:/);
  });
});
