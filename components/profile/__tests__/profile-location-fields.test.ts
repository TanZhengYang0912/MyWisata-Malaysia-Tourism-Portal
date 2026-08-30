import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const read = (file: string) => {
  const path = resolve(process.cwd(), file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

const fields = read("components/profile/profile-location-fields.tsx");
const country = read("components/profile/country-combobox.tsx");
const city = read("components/profile/city-autocomplete.tsx");

describe("shared Profile location fields", () => {
  it("keeps country and city controlled with catalogue/manual transitions", () => {
    expect(fields).toContain("export function ProfileLocationFields");
    expect(fields).toContain("cityId: null");
    expect(fields).toContain("getCanonicalCountryName");
    expect(fields).toContain("<CountryCombobox");
    expect(fields).toContain("<CityAutocomplete");
  });

  it("provides searchable accessible country selection", () => {
    expect(country).toContain('role="combobox"');
    expect(country).toContain('role="listbox"');
    expect(country).toContain("getCountryOptions");
    expect(country).toContain("ArrowDown");
    expect(country).toContain("Escape");
  });

  it("debounces bounded country-scoped city search and rejects stale responses", () => {
    expect(city).toContain("setTimeout");
    expect(city).toContain("300");
    expect(city).toContain("AbortController");
    expect(city).toContain("requestGeneration");
    expect(city).toContain("visibleSuggestions");
    expect(city).toContain("visibleLoading");
    expect(city).toContain("/api/locations/cities");
    expect(city).toContain("country=");
    expect(city).toContain("slice(0, 5)");
  });

  it("supports manual input, keyboard selection and required GeoNames attribution", () => {
    expect(city).toContain("onChange(value, null)");
    expect(city).toContain("ArrowDown");
    expect(city).toContain("Enter");
    expect(city).toContain("Escape");
    expect(city).toContain("https://www.geonames.org/");
    expect(city).toContain("CC BY 4.0");
  });
});
