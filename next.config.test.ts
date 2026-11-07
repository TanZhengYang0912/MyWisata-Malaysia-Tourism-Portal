import { afterEach, describe, expect, it, vi } from "vitest";

async function loadConfig(nodeEnv: string, supabaseUrl: string) {
  vi.stubEnv("NODE_ENV", nodeEnv);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", supabaseUrl);
  vi.resetModules();
  return (await import("./next.config")).default;
}

async function getImageSourceDirective(config: Awaited<ReturnType<typeof loadConfig>>) {
  const rules = await config.headers!();
  const pageRule = rules.find((rule) => rule.source === "/(.*)");
  const csp = pageRule?.headers.find((header) => header.key === "Content-Security-Policy")?.value ?? "";
  return csp.split("; ").find((directive) => directive.startsWith("img-src ")) ?? "";
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Next.js Supabase storage image patterns", () => {
  it("allows the local Supabase Storage origin only in development", async () => {
    const localPattern = {
      protocol: "http",
      hostname: "127.0.0.1",
      port: "54321",
      pathname: "/storage/v1/object/public/**",
    };
    const localDevelopmentConfig = await loadConfig(
      "development",
      "http://127.0.0.1:54321",
    );

    expect(localDevelopmentConfig.images?.dangerouslyAllowLocalIP).toBe(true);
    expect(localDevelopmentConfig.images?.remotePatterns).toContainEqual(localPattern);
    expect(localDevelopmentConfig.images?.remotePatterns).not.toContainEqual({
      protocol: "https",
      hostname: "127.0.0.1",
      pathname: "/storage/v1/object/public/**",
    });
    expect(localDevelopmentConfig.images?.remotePatterns).toContainEqual({
      protocol: "https",
      hostname: "*.supabase.co",
      pathname: "/storage/v1/object/public/**",
    });

    const remoteDevelopmentConfig = await loadConfig(
      "development",
      "https://development-project.supabase.co",
    );
    expect(remoteDevelopmentConfig.images?.dangerouslyAllowLocalIP).toBe(false);
    expect(remoteDevelopmentConfig.images?.remotePatterns).toContainEqual({
      protocol: "https",
      hostname: "development-project.supabase.co",
      pathname: "/storage/v1/object/public/**",
    });

    const productionConfig = await loadConfig(
      "production",
      "https://production-project.supabase.co",
    );

    expect(productionConfig.images?.remotePatterns).not.toContainEqual(localPattern);
    expect(productionConfig.images?.dangerouslyAllowLocalIP).toBe(false);
    expect(productionConfig.images?.remotePatterns).toContainEqual({
      protocol: "https",
      hostname: "production-project.supabase.co",
      pathname: "/storage/v1/object/public/**",
    });
  });
});

describe("Next.js local Supabase image CSP", () => {
  it.each([
    ["http://127.0.0.1:54321", "http://127.0.0.1:54321"],
    ["http://localhost:54321", "http://localhost:54321"],
  ])("allows the configured loopback Storage origin in development (%s)", async (supabaseUrl, expectedOrigin) => {
    const config = await loadConfig("development", supabaseUrl);
    expect(await getImageSourceDirective(config)).toContain(expectedOrigin);
  });

  it.each([
    ["production", "http://127.0.0.1:54321"],
    ["development", "http://127.0.0.1:54322"],
    ["development", "https://127.0.0.1:54321"],
    ["development", "http://192.168.1.20:54321"],
  ])("does not add a local HTTP image source outside loopback development on port 54321 (%s, %s)", async (nodeEnv, supabaseUrl) => {
    const config = await loadConfig(nodeEnv, supabaseUrl);
    expect(await getImageSourceDirective(config)).not.toContain(supabaseUrl);
  });
});
