import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => {
  const absolutePath = resolve(process.cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
};

function stringValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringValues);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringValues);
  return [];
}

const layoutSource = read("app/layout.tsx");
const nextConfigSource = read("next.config.ts");
const iconPath = resolve(process.cwd(), "app/icon.png");
const legacyFaviconPath = resolve(process.cwd(), "app/favicon.ico");
const localePaths = [
  "app/i18n/locales/en/common.json",
  "app/i18n/locales/en/customer.json",
  "app/i18n/locales/en/vendor.json",
  "app/i18n/locales/en/admin.json",
  "app/i18n/locales/ms/common.json",
  "app/i18n/locales/ms/customer.json",
  "app/i18n/locales/ms/vendor.json",
  "app/i18n/locales/ms/admin.json",
  "app/i18n/locales/zh-CN/common.json",
  "app/i18n/locales/zh-CN/customer.json",
  "app/i18n/locales/zh-CN/vendor.json",
  "app/i18n/locales/zh-CN/admin.json",
];

describe("platform branding contract", () => {
  it("uses the shared logo in each visible platform brand entry", () => {
    for (const path of ["app/guest/layout.tsx", "app/login/page.tsx", "components/layout/portal-sidebar.tsx"]) {
      expect(read(path), path).toContain("@/components/shared/mywisata-logo");
    }
    expect(read("app/customer/layout.tsx")).toContain("/branding/mywisata-logo-transparent.png?v=2");
  });

  it("exposes the MyLawatan browser title and App Router icon", () => {
    expect(layoutSource).toContain('title: "MyLawatan — Malaysia Tourism Portal"');
    expect(layoutSource).toContain("metadataBase");
    expect(layoutSource).toContain('applicationName: "MyLawatan"');
    expect(layoutSource).toContain('url: "/icon.png?v=2"');
    expect(existsSync(iconPath)).toBe(true);
    expect(existsSync(legacyFaviconPath)).toBe(false);
  });

  it("keeps the visible logo wordmark name separate from product copy", () => {
    expect(read("components/shared/mywisata-logo.tsx")).toContain("LOGO_BRAND_NAME");
    expect(read("app/customer/layout.tsx")).toContain("LOGO_BRAND_NAME");
  });

  it("allows the versioned logo asset through next/image", () => {
    expect(nextConfigSource).toContain("pathname: '/branding/mywisata-logo-transparent.png'");
    expect(nextConfigSource).toContain("search: '?v=2'");
  });

  it("uses the renamed brand in the browser tab metadata", () => {
    expect(layoutSource).not.toContain("MyWisata — Malaysia Tourism Portal");
    expect(layoutSource).toContain("MyLawatan — Malaysia Tourism Portal");
    expect(layoutSource).not.toContain('siteName: "MyWisata"');
    expect(layoutSource).toContain('siteName: "MyLawatan"');
  });

  it("keeps public locale copy on the current brand", () => {
    for (const path of localePaths) {
      const values = stringValues(JSON.parse(read(path)));
      expect(values.join("\n"), path).not.toContain("MyWisata");
    }
  });

  it("uses one canonical public brand token", () => {
    const tokenSource = read("lib/i18n/invariant-tokens.ts");
    expect(tokenSource).toContain('BRAND_NAME = "MyLawatan"');
    expect(tokenSource).toContain("LOGO_BRAND_NAME = BRAND_NAME");
    expect(tokenSource).toContain('ATLAS_BRAND_NAME = "MyLawatan / Atlas"');
  });
});
