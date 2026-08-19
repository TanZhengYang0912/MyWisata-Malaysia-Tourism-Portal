import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email sign-in feedback", () => {
  it("guides people who originally used Google without revealing account identity", () => {
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
    const auth = JSON.parse(readFileSync(resolve(process.cwd(), "app/i18n/locales/en/auth.json"), "utf8")) as { signIn?: { error?: string } };

    expect(page).toContain('tAuth("signIn.error")');
    expect(auth.signIn?.error).toContain("If you originally used Google, select Continue with Google or reset your password.");
  });
});
