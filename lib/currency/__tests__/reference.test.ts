import { describe, expect, it } from "vitest";
import {
  DEFAULT_REFERENCE_CURRENCY,
  REFERENCE_CURRENCIES,
  convertMYR,
  formatReferenceCurrency,
  isReferenceCurrency,
  resolveReferenceCurrency,
} from "../reference";

describe("reference currency contract", () => {
  it("accepts exactly the approved display currencies", () => {
    expect(REFERENCE_CURRENCIES).toEqual(["MYR", "SGD", "USD", "CNY", "EUR"]);
    expect(REFERENCE_CURRENCIES.every(isReferenceCurrency)).toBe(true);
    expect(isReferenceCurrency("GBP")).toBe(false);
    expect(isReferenceCurrency(null)).toBe(false);
  });

  it("falls back to MYR for missing or unsupported preferences", () => {
    expect(DEFAULT_REFERENCE_CURRENCY).toBe("MYR");
    expect(resolveReferenceCurrency("USD")).toBe("USD");
    expect(resolveReferenceCurrency("GBP")).toBe("MYR");
    expect(resolveReferenceCurrency(undefined)).toBe("MYR");
  });

  it("converts valid non-negative MYR display amounts", () => {
    expect(convertMYR(120, 0.2366666667)).toBeCloseTo(28.4, 8);
    expect(convertMYR(0, 0.24)).toBe(0);
  });

  it("rejects invalid amounts and rates instead of leaking bad display values", () => {
    expect(convertMYR(Number.NaN, 0.24)).toBeNull();
    expect(convertMYR(Number.POSITIVE_INFINITY, 0.24)).toBeNull();
    expect(convertMYR(-1, 0.24)).toBeNull();
    expect(convertMYR(10, 0)).toBeNull();
    expect(convertMYR(10, -1)).toBeNull();
    expect(convertMYR(10, Number.NaN)).toBeNull();
  });

  it("formats reference values with unambiguous storefront symbols", () => {
    expect(formatReferenceCurrency(28.4, "USD", "en")).toBe("US$28.40");
    expect(formatReferenceCurrency(28.4, "SGD", "en")).toBe("S$28.40");
    expect(formatReferenceCurrency(28.4, "CNY", "zh-CN")).toBe("¥28.40");
    expect(formatReferenceCurrency(28.4, "EUR", "en")).toBe("€28.40");
  });
});
