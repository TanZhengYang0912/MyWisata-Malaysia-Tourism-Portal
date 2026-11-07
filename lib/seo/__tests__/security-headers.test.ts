import { afterEach, describe, expect, it, vi } from "vitest";
import nextConfig from "../../../next.config";

afterEach(() => vi.unstubAllEnvs());

async function headerMap() {
  const rules = await nextConfig.headers!();
  const all = rules.find((rule) => rule.source === "/(.*)");
  return new Map((all?.headers ?? []).map((header) => [header.key, header.value]));
}

describe("security headers", () => {
  it("sends the baseline security headers on every route", async () => {
    const headers = await headerMap();
    expect(headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
    expect(headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(headers.get("Permissions-Policy")).toContain("microphone=()");
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("blocks framing by other sites, plugins, base hijacking and unknown script origins", async () => {
    const csp = (await headerMap()).get("Content-Security-Policy") ?? "";
    expect(csp).toContain("frame-ancestors 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toMatch(/script-src 'self' 'unsafe-inline'[^;]*https:\/\/maps\.googleapis\.com/);
    expect(csp).not.toMatch(/script-src[^;]*\s(\*|https:)(\s|;|$)/);
    expect(csp).toContain("worker-src 'self' blob:");
    expect(csp).toMatch(/script-src[^;]*https:\/\/challenges\.cloudflare\.com/);
    expect(csp).toContain("frame-src 'self' https://challenges.cloudflare.com");
  });
});

describe("single indexed host", () => {
  it("redirects www to the public site permanently and names each page's canonical URL", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://mylawatan.my");
    expect((await nextConfig.redirects!()).filter((rule) => rule.has)).toEqual([{
      source: "/:path*",
      has: [{ type: "host", value: "www\\.mylawatan\\.my" }],
      destination: "https://mylawatan.my/:path*",
      permanent: true,
    }]);
    const canonical = (await nextConfig.headers!()).filter((rule) => rule.headers.some((header) => header.key === "Link"));
    expect(canonical).toEqual([
      { source: "/", headers: [{ key: "Link", value: '<https://mylawatan.my/>; rel="canonical"' }] },
      { source: "/:path+", headers: [{ key: "Link", value: '<https://mylawatan.my/:path+>; rel="canonical"' }] },
    ]);
  });

  it.each(["http://localhost:3000", "", "not a url"])("adds neither on localhost or without a site URL (%j)", async (siteUrl) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", siteUrl);
    expect((await nextConfig.redirects!()).filter((rule) => rule.has)).toEqual([]);
    expect((await nextConfig.headers!()).some((rule) => rule.headers.some((header) => header.key === "Link"))).toBe(false);
  });
});
