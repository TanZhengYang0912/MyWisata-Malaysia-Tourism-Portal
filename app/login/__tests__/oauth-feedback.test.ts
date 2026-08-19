import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("OAuth login feedback", () => {
  it("explains callback failures separately from invalid login details", () => {
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");

    expect(page).toContain('queryError === "oauth"');
    expect(page).toContain("Google sign-in could not be completed");
  });
});
