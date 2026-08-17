import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const entryPoints = [
  "app/login/page.tsx",
  "app/customer/layout.tsx",
  "app/guest/layout.tsx",
  "components/layout/vendor-sidebar.tsx",
  "app/admin/layout.tsx",
];

describe("shared language entry points", () => {
  it("renders the shared switcher from every role shell", () => {
    for (const path of entryPoints) {
      const contents = source(path);
      expect(contents, path).toContain("LanguageSwitcher");
    }
  });

  it("keeps the profile language card in one profile section", () => {
    const contents = source("components/profile/profile-sections.tsx");
    expect(contents).toContain("LanguageSwitcher");
    expect(contents).toContain("language.andRegion");
    expect(contents.match(/language\.andRegion/g)).toHaveLength(1);
  });

  it("does not define another language option list in a shell", () => {
    for (const path of entryPoints) {
      const contents = source(path);
      expect(contents, path).not.toMatch(/English|简体中文|Bahasa Melayu/);
      expect(contents, path).not.toMatch(/APP_LOCALES|LANGUAGE_OPTIONS/);
    }
  });

  it("keeps the fixed footer language control above sign out", () => {
    for (const path of ["components/layout/vendor-sidebar.tsx", "app/admin/layout.tsx"]) {
      const contents = source(path);
      const switcherIndex = contents.indexOf("LanguageSwitcher");
      expect(switcherIndex, `${path} should render the shared switcher`).toBeGreaterThanOrEqual(0);
      expect(switcherIndex, `${path} should place it before sign out`).toBeLessThan(contents.lastIndexOf("Sign out"));
    }
  });
});
