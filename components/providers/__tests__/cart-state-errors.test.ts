import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cart provider catalogue error handling", () => {
  it("handles a failed initial catalogue load without an unhandled rejection", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/cart.tsx"), "utf8");
    const hydrationStart = source.indexOf("setMounted(false)");
    const initialLoad = source.slice(
      hydrationStart,
      source.indexOf("if (currentUser)", hydrationStart),
    );

    expect(initialLoad).toMatch(/getActivities\(\)[\s\S]+\.catch\(/);
    expect(initialLoad).toContain("setActivities([])");
  });
});
