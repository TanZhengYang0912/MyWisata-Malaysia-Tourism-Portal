import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("login demo account recovery", () => {
  const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");

  it("keeps demo lookup failures separate from sign-in feedback and supports explicit retry", () => {
    expect(page).toContain('setDemoLoadState("error")');
    expect(page).toContain('role="alert"');
    expect(page).toContain('setDemoRetryKey((key) => key + 1)');
    expect(page).not.toContain('.catch(() => setError(tAuth("errors.demoLoad")))');
  });

  it("aborts stale loads and ignores responses from an earlier retry", () => {
    expect(page).toContain("const controller = new AbortController()");
    expect(page).toContain("generation !== demoRequestGeneration.current");
    expect(page).toContain("return () => controller.abort()");
  });

  it("does not promise demo accounts when the environment has none", () => {
    const auth = JSON.parse(readFileSync(resolve(process.cwd(), "app/i18n/locales/en/auth.json"), "utf8")) as {
      demo: { empty: string; retry: string };
    };

    expect(page).not.toContain('tAuth("login.description")');
    expect(auth.demo.empty).toBeTruthy();
    expect(auth.demo.retry).toBeTruthy();
  });
});
