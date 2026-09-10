import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("Next.js development server", () => {
  it("uses the stable Webpack runner for local development", () => {
    const packageJson = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8")) as {
      scripts?: { dev?: string };
    };

    expect(packageJson.scripts?.dev).toBe("next dev --webpack");
  });
});
