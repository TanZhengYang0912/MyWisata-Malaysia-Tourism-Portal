import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("cart provider catalogue error handling", () => {
  it("does not filter newly requested selections through a stale cart snapshot", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/cart.tsx"), "utf8");
    const selectionStart = source.indexOf("const replaceSelectedKeys");
    const selectionEnd = source.indexOf("const addItem", selectionStart);
    const selection = source.slice(selectionStart, selectionEnd);

    expect(selection).toContain("setSelectedKeysState(new Set(keys))");
    expect(selection).toContain("sessionStorage.setItem(");
    expect(selection).toContain("JSON.stringify(keys)");
    expect(selection).toMatch(/replaceSelectedKeys = useCallback\([\s\S]+?\}, \[currentUser\]\)/);
    expect(selection).not.toContain("items.map(cartItemKey)");
  });

  it("exposes whether activity data matches the current cart before pruning selections", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/cart.tsx"), "utf8");

    expect(source).toContain("activitiesReady: boolean");
    expect(source).toContain("const activitiesReady = activityData.key === activityIdsKey;");
    expect(source).toContain("activities, activitiesReady, activitiesFailed, reloadActivities, selectedKeys");
  });

  it("handles a failed initial catalogue load without an unhandled rejection", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/cart.tsx"), "utf8");
    const catalogueLoadStart = source.indexOf("getActivitiesByIds(activityIds)");
    const catalogueLoadEnd = source.indexOf("return () => { active = false; };", catalogueLoadStart);
    const catalogueLoad = source.slice(catalogueLoadStart, catalogueLoadEnd);

    expect(catalogueLoadStart).toBeGreaterThanOrEqual(0);
    expect(catalogueLoad).toMatch(/getActivitiesByIds\(activityIds\)[\s\S]+\.catch\(/);
    expect(catalogueLoad).toContain("setActivityData({ key: activityIdsKey, activities: [], failed: true })");
  });

  it("handles a failed authenticated cart load without an unhandled rejection", () => {
    const source = readFileSync(resolve(process.cwd(), "components/providers/cart.tsx"), "utf8");
    const cartLoadStart = source.indexOf("if (userId)");
    const cartLoad = source.slice(cartLoadStart, source.indexOf("else { setItems([]);", cartLoadStart));

    expect(cartLoad).toMatch(/commerce\.getCart\(userId\)[\s\S]+\.catch\(/);
    expect(cartLoad).toContain("setItems([])");
    expect(cartLoad).toContain("setMounted(true)");
  });
});
