import { describe, expect, it } from "vitest";
import {
  OUTLET_MANAGER_SHOP_PAGE_HREF,
  OUTLET_MANAGER_SHOP_EDITOR_HREF,
  getOutletManagerDestination,
  getOutletManagerEditorDestination,
  isOutletManagerShopMode,
  isOutletManagerShopEditMode,
} from "@/lib/vendor/outlet-manager-navigation";

describe("outlet manager navigation", () => {
  it("uses the shop page query destination for outlet managers", () => {
    expect(getOutletManagerDestination(true)).toBe(OUTLET_MANAGER_SHOP_PAGE_HREF);
    expect(getOutletManagerDestination(false)).toBe("/vendor/outlets");
  });

  it("only enables shop page mode for an outlet manager", () => {
    expect(isOutletManagerShopMode(true, "shop")).toBe(true);
    expect(isOutletManagerShopMode(true, undefined)).toBe(true);
    expect(isOutletManagerShopMode(false, "shop")).toBe(false);
    expect(isOutletManagerShopMode(true, "list")).toBe(false);
  });

  it("uses an explicit editor destination after the preview", () => {
    expect(OUTLET_MANAGER_SHOP_EDITOR_HREF).toBe("/vendor/outlets?mode=shop&edit=1");
    expect(getOutletManagerEditorDestination(true)).toBe(OUTLET_MANAGER_SHOP_EDITOR_HREF);
    expect(getOutletManagerEditorDestination(false)).toBe("/vendor/outlets");
    expect(isOutletManagerShopEditMode(true, "1")).toBe(true);
    expect(isOutletManagerShopEditMode(true, null)).toBe(false);
    expect(isOutletManagerShopEditMode(false, "1")).toBe(false);
  });
});
