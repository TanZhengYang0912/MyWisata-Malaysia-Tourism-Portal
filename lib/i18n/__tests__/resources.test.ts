import { describe, expect, it } from "vitest";
import { APP_LOCALES } from "../locale";
import { APP_NAMESPACES, loadLocaleResources } from "../resources";

function flattenJson(value: unknown, prefix = "", entries = new Map<string, unknown>()): Map<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [key, nestedValue] of Object.entries(value)) {
      flattenJson(nestedValue, prefix ? `${prefix}.${key}` : key, entries);
    }
  } else if (prefix) {
    entries.set(prefix, value);
  }

  return entries;
}

function interpolationVariables(value: unknown): string[] {
  if (typeof value !== "string") return [];
  return [...value.matchAll(/\{\{\s*([^},\s]+)[^}]*\}\}/g)]
    .map((match) => match[1])
    .sort();
}

describe("translation resources", () => {
  it("keeps every non-English namespace in parity with English", async () => {
    const resources = Object.fromEntries(
      await Promise.all(APP_LOCALES.map(async (locale) => [locale, await loadLocaleResources(locale)] as const)),
    );
    const englishResources = resources.en;

    for (const namespace of APP_NAMESPACES) {
      const englishKeys = [...flattenJson(englishResources[namespace]).keys()].sort();

      for (const locale of APP_LOCALES.filter((candidate) => candidate !== "en")) {
        const localeEntries = flattenJson(resources[locale][namespace]);
        expect([...localeEntries.keys()].sort(), `${locale}/${namespace} key parity`).toEqual(englishKeys);

        for (const [key, value] of localeEntries) {
          if (typeof value === "string") {
            expect(value.trim(), `${locale}/${namespace}/${key} should not be empty`).not.toBe("");
            expect(
              interpolationVariables(value),
              `${locale}/${namespace}/${key} interpolation parity`,
            ).toEqual(interpolationVariables(flattenJson(englishResources[namespace]).get(key)));
          }
        }
      }
    }
  }, 15_000);
});
