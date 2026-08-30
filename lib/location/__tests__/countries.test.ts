import { describe, expect, it } from "vitest";
import {
  DEFAULT_COUNTRY_CODE,
  findCountryCode,
  getCanonicalCountryName,
  getCountryOptions,
  isCountryCode,
} from "@/lib/location/countries";

describe("Profile country catalogue", () => {
  it("defaults to Malaysia and covers the complete ISO alpha-2 list", () => {
    expect(DEFAULT_COUNTRY_CODE).toBe("MY");
    const options = getCountryOptions("en");
    expect(options).toHaveLength(249);
    expect(options.find((option) => option.code === "MY")?.canonicalName).toBe("Malaysia");
    expect(options.find((option) => option.code === "CN")?.canonicalName).toBe("China");
  });

  it("localizes labels without changing canonical persistence names", () => {
    const china = getCountryOptions("zh-CN").find((option) => option.code === "CN");
    expect(china).toMatchObject({ code: "CN", canonicalName: "China" });
    expect(china?.label).toBeTruthy();
  });

  it("maps codes, canonical names, localized names and legacy UK", () => {
    expect(findCountryCode("Malaysia", "en")).toBe("MY");
    expect(findCountryCode("中国", "zh-CN")).toBe("CN");
    expect(findCountryCode("CN", "en")).toBe("CN");
    expect(findCountryCode("UK", "en")).toBe("GB");
    expect(findCountryCode("Legacy Atlantis", "en")).toBeNull();
    expect(findCountryCode("", "en")).toBe(DEFAULT_COUNTRY_CODE);
    expect(getCanonicalCountryName("MY")).toBe("Malaysia");
    expect(isCountryCode("MY")).toBe(true);
    expect(isCountryCode("ZZ")).toBe(false);
  });
});
