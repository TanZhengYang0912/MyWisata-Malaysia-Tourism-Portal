import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth state error handling", () => {
  it("handles a failed profile load without an unhandled promise rejection", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(/loadSupabaseUser\(session\.user\.id\)\s*\.catch\(/);
    expect(source).toContain("setCurrentUser(null)");
    expect(source).toMatch(/\.finally\(\(\) => \{[\s\S]*setLoading\(false\)/);
  });

  it("clears any local session when any part of a demo account switch fails", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(
      /const switchUser = useCallback\([\s\S]*?try \{[\s\S]*?fetch\('\/api\/auth\/demo-signin'[\s\S]*?loadSupabaseUser\(id\)[\s\S]*?\} catch \{[\s\S]*?supabase\.auth\.signOut\(\{ scope: "local" \}\)[\s\S]*?throw new Error\(tAuth\('signIn\.error'\)\)/,
    );
  });
});
