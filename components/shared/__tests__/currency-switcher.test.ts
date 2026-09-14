import { describe, expect, it, vi } from "vitest";
import { REFERENCE_CURRENCIES } from "@/lib/currency/reference";
import { saveCurrencyPreference } from "../currency-switcher";

describe("currency switcher preference save", () => {
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
