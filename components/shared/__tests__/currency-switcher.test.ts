import { describe, expect, it, vi } from "vitest";
import { REFERENCE_CURRENCIES } from "@/lib/currency/reference";
import { CURRENCY_FLAG_ASSETS, saveCurrencyPreference } from "../currency-switcher";

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
});
