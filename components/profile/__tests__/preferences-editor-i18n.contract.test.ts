import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/profile/preferences-editor.tsx"),
  "utf8",
);

describe("PreferencesEditor localization contract", () => {
  it("renders every option collection from its declared labelKey", () => {
    for (const collection of [
      "INTEREST_OPTIONS",
      "TRAVEL_STYLES",
      "GROUP_COMPOSITIONS",
      "BUDGET_RANGES",
      "DISTANCE_OPTIONS",
      "MOBILITY_NEEDS",
    ]) {
      expect(source, `${collection} must destructure labelKey`).toMatch(
        new RegExp(`${collection}\\.map\\(\\(\\{[^}]*labelKey`),
      );
    }

    expect(source).toContain("t(labelKey)");
    expect(source).not.toMatch(/\.map\(\(\{[^}]*\blabel\b[^}]*\}\)[^\n]*>\{label\}</);
  });

  it("localizes learned category labels instead of returning English category data", () => {
    expect(source).not.toMatch(/\bgetDiscoveryCategoryLabel(?!Key)\b/);
    expect(source).toContain("getOptionalDiscoveryCategoryLabelKey");
    expect(source).toContain("key ? t(key) : slug");
  });
});
