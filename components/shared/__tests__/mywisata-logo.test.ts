import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const sourcePath = resolve(process.cwd(), "components/shared/mywisata-logo.tsx");
const source = existsSync(sourcePath) ? readFileSync(sourcePath, "utf8") : "";

describe("MyWisata logo contract", () => {
  it("defines a reusable mark using the authentic brand asset with proportional scaling", () => {
    expect(source).toContain("export function MyWisataMark");
    expect(source).toContain("/branding/mywisata-mark-transparent.png");
    expect(source).toContain("object-contain");
    expect(existsSync(resolve(process.cwd(), "public/branding/mywisata-mark-transparent.png"))).toBe(true);
  });

  it("uses the canonical logo name in the shared wordmark", () => {
    expect(source).toContain('import { LOGO_BRAND_NAME } from "@/lib/i18n/invariant-tokens"');
    expect(source).toContain("alt={LOGO_BRAND_NAME}");
    expect(source).toContain("export function MyWisataLogo");
  });

  it("renders the master logo with object-contain to prevent image distortion", () => {
    expect(source).toContain("/branding/mywisata-logo-transparent.png?v=2");
    expect(source).toContain("object-contain");
    expect(existsSync(resolve(process.cwd(), "public/branding/mywisata-logo-transparent.png"))).toBe(true);
  });
});
