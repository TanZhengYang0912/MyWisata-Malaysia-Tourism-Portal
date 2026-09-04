import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => readFileSync(resolve(process.cwd(), file), "utf8");

describe("legacy useAuth provider bridge", () => {
  it("reuses the root AuthProvider instead of fetching auth for every consumer", () => {
    const source = read("hooks/use-auth.ts");

    expect(source).toContain('useAuth as useProviderAuth');
    expect(source).not.toContain("fetch('/api/auth/me'");
    expect(source).not.toContain('fetch("/api/auth/me"');
  });

  it("preserves vendor and outlet scope expected by the vendor portal", () => {
    const hookSource = read("hooks/use-auth.ts");
    const providerSource = read("components/providers/auth.tsx");

    expect(hookSource).toContain("activeVendorId: activeVendorId ?? null");
    expect(hookSource).toContain("activeOutletIds: activeOutletIds ?? []");
    expect(hookSource).toContain("activeOutletName");
    expect(providerSource).toContain("activeOutletName: string | null");
  });
});
