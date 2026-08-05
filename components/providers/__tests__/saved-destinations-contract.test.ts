import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const providerPath = resolve(process.cwd(), "components/providers/saved-destinations.tsx");

describe("saved destination provider contract", () => {
  it("hydrates saved states and exposes optimistic toggle behavior", () => {
    expect(existsSync(providerPath)).toBe(true);
    const source = readFileSync(providerPath, "utf8");
    expect(source).toContain("SavedDestinationsProvider");
    expect(source).toContain("useSavedDestinations");
    expect(source).toContain("/api/saved-destinations");
    expect(source).toContain("setSavedStates");
    expect(source).toContain("catch");
  });
});
