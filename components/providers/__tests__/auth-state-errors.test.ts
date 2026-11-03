import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth state error handling", () => {
  it("does not reload the profile for Supabase's initial session event", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(/onAuthStateChange\(\(_event, session\) => \{[\s\S]*?if \(_event === "INITIAL_SESSION"\) return;/);
  });

  it("handles a failed profile load without an unhandled promise rejection", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(/loadSupabaseUser\(session\.user\.id, authRequest\)\s*\.catch\(/);
    expect(source).toContain("if (!active || !isCurrentRequest(authRequest)) return;");
    expect(source).toContain("setCurrentUser(null)");
    expect(source).toMatch(/\.finally\(\(\) => \{[\s\S]*setLoading\(false\)/);
  });

  it("clears any local session when any part of a demo account switch fails", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(
      /const switchUser = useCallback\([\s\S]*?try \{[\s\S]*?fetch\('\/api\/auth\/demo-signin'[\s\S]*?loadSupabaseUser\(id, request\)[\s\S]*?\} catch \(error\) \{[\s\S]*?supabase\.auth\.signOut\(\{ scope: "local" \}\)[\s\S]*?if \(error instanceof DemoSignInCaptchaError\) throw error;[\s\S]*?throw new Error\(tAuth\('signIn\.error'\)\)/,
    );
  });

  it("preserves a stable CAPTCHA failure code from the demo sign-in response", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(/const payload: unknown = await response\.json\(\)\.catch\(\(\) => null\)/);
    expect(source).toContain("payload.code === DEMO_SIGN_IN_CAPTCHA_FAILED_CODE");
    expect(source).toContain("throw new DemoSignInCaptchaError()");
  });
});
