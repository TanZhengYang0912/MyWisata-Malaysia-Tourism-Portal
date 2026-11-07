import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { REFERENCE_CURRENCIES } from "@/lib/currency/reference";
import {
  CURRENCY_FLAG_ASSETS,
  isReferenceRateUnavailable,
  saveCurrencyPreference,
  shouldNotifyRateUnavailable,
} from "../currency-switcher";

describe("currency switcher preference save", () => {
  it("maps every supported currency to its regional flag asset", () => {
    expect(CURRENCY_FLAG_ASSETS).toEqual({
      MYR: "/flags/my.svg",
      SGD: "/flags/sg.svg",
      USD: "/flags/us.svg",
      CNY: "/flags/cn.svg",
      EUR: "/flags/eu.svg",
    });
  });

  it("posts one of the exact approved currency codes", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 200 });

    await saveCurrencyPreference("CNY", fetcher);

    expect(REFERENCE_CURRENCIES).toEqual(["MYR", "SGD", "USD", "CNY", "EUR"]);
    expect(fetcher).toHaveBeenCalledWith("/api/currency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currency: "CNY" }),
    });
  });

  it("rejects a failed save so the UI can show feedback", async () => {
    const fetcher = vi.fn().mockResolvedValue({ status: 500 });

    await expect(saveCurrencyPreference("EUR", fetcher)).rejects.toThrow("Unable to save display currency");
  });

  it("detects a saved foreign currency whose rate is unavailable", () => {
    expect(isReferenceRateUnavailable("SGD", null)).toBe(true);
    expect(isReferenceRateUnavailable("MYR", null)).toBe(false);
    expect(isReferenceRateUnavailable("SGD", {
      base: "MYR",
      quote: "SGD",
      rate: 0.31289,
      date: "2026-09-21",
      provider: "BNM",
    })).toBe(false);
  });

  it("notifies only once for the same unavailable currency", () => {
    expect(shouldNotifyRateUnavailable(null, "SGD", true)).toBe(true);
    expect(shouldNotifyRateUnavailable("SGD", "SGD", true)).toBe(false);
    expect(shouldNotifyRateUnavailable("SGD", "USD", true)).toBe(true);
    expect(shouldNotifyRateUnavailable(null, "SGD", false)).toBe(false);
  });
});

describe("currency switcher mobile label", () => {
  const source = readFileSync(resolve(process.cwd(), "components/shared/currency-switcher.tsx"), "utf8");

  it("keeps the selected code visible and hides only the flag on narrow mobile screens", () => {
    expect(source).toContain("hideFlagOnNarrowMobile?: boolean");
    expect(source).toContain('hideFlagOnNarrowMobile ? "max-[419px]:hidden" : undefined');
    expect(source).toContain("<CurrencyOption currency={currency} hideFlagOnNarrowMobile={hideFlagOnNarrowMobile} />");
    expect(source).not.toContain("codeHiddenOnMobile");
    expect(source).not.toContain("max-md:sr-only");
    // The dropdown list always shows flag + code.
    expect(source).toContain("<CurrencyOption currency={code} />");
  });
});
