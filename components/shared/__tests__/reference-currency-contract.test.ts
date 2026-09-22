import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const read = (file: string) => {
  const path = resolve(workspace, file);
  return existsSync(path) ? readFileSync(path, "utf8") : "";
};

describe("reference currency UI contract", () => {
  it("provides a root-scoped currency context from the validated cookie and server rate", () => {
    const layout = read("app/layout.tsx");
    const provider = read("components/providers/reference-currency.tsx");

    expect(provider).toContain("ReferenceCurrencyProvider");
    expect(provider).toContain("useReferenceCurrency");
    expect(layout).toContain("REFERENCE_CURRENCY_COOKIE");
    expect(layout).toContain("resolveReferenceCurrency");
    expect(layout).toContain("getReferenceRate(currency)");
    expect(layout).toContain("<ReferenceCurrencyProvider");
  });

  it("renders a symbol-first selected price and can expose the exact MYR settlement amount", () => {
    const price = read("components/shared/reference-price.tsx");

    expect(price).toContain("formatMYR(amountMYR)");
    expect(price).toContain("formatReferenceCurrency");
    expect(price).not.toContain("≈");
    expect(price).toContain("showSettlementMYR");
    expect(price).toContain('t("currency.settlementAmount"');
    expect(price).toContain('t("currency.referenceOnly")');
    expect(price).toContain('t("currency.rateDate"');
  });

  it("persists only the five approved display currencies and refreshes server state", () => {
    const switcher = read("components/shared/currency-switcher.tsx");

    expect(switcher).toContain("REFERENCE_CURRENCIES.map");
    expect(switcher).toContain('fetcher("/api/currency"');
    expect(switcher).toContain("router.refresh()");
    expect(switcher).toContain('t("currency.label")');
    expect(switcher).toContain("SelectTrigger");
    expect(switcher).toContain("CURRENCY_FLAG_ASSETS");
    expect(switcher).not.toContain("<select");
  });

  it("uses the shared styled Select for both language and currency preferences", () => {
    const language = read("components/shared/language-switcher.tsx");
    const currency = read("components/shared/currency-switcher.tsx");

    expect(language).toContain('from "@/components/ui/select"');
    expect(currency).toContain('from "@/components/ui/select"');
    expect(language).toContain("onValueChange={(value) => { void handleLocaleChange(value); }}");
    expect(language).not.toContain("<select");
    expect(currency).not.toContain("<select");
  });

  it("exposes the switcher in both customer and guest headers", () => {
    const customer = read("app/customer/layout.tsx");
    const guest = read("app/guest/layout.tsx");

    expect(customer).toContain('<CurrencySwitcher compact className="w-20 md:w-24" />');
    expect(guest).toContain("<CurrencySwitcher compact");
  });
});
