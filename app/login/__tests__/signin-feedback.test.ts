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

  it("clears any stale local session before reporting a failed password sign-in", () => {
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");

    expect(page).toMatch(
      /if \(signInError\) \{[\s\S]*?supabase\.auth\.signOut\(\{ scope: "local" \}\)[\s\S]*?setError\(tAuth\("signIn\.error"\)\)/,
    );
  });
});
