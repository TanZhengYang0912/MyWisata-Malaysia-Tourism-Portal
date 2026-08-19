import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("auth state error handling", () => {
  it("handles a failed profile load without an unhandled promise rejection", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/auth.tsx"), "utf8");

    expect(source).toMatch(/loadSupabaseUser\(session\.user\.id, requestVersion\)\s*\.catch\(/);
    expect(source).toContain("setCurrentUser(null)");
    expect(source).toMatch(/\.finally\(\(\) => \{[\s\S]*setLoading\(false\)/);
  });
});
