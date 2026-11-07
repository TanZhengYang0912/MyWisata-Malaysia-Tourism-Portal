import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "app/vendor/orders/page.tsx"),
  "utf8",
);

const localeMessages = ["en", "zh-CN", "ms"].map((locale) => {
  const file = resolve(process.cwd(), "app/i18n/locales/" + locale + "/vendor.json");
  return JSON.parse(readFileSync(file, "utf8")).ui.orders;
});

describe("vendor order ID copy control", () => {
  it("copies the exact order reference shown in each row", () => {
    expect(source).toContain("const displayOrderId = order.display_id ||");
    expect(source).toContain('aria-label={t("ui.orders.copyOrderId", { id: displayOrderId })}');
    expect(source).toContain("onClick={() => void copyOrderId(displayOrderId)}");
    expect(source).toContain("await navigator.clipboard.writeText(orderId);");
  });

  it("provides localized copy feedback in every vendor locale", () => {
    for (const messages of localeMessages) {
      expect(messages.copyOrderId).toContain("{{id}}");
      expect(messages.orderIdCopied).toContain("{{id}}");
      expect(messages.orderIdCopyFailed).toContain("{{id}}");
    }
    expect(source).toContain('t("ui.orders.orderIdCopied", { id: orderId })');
    expect(source).toContain('t("ui.orders.orderIdCopyFailed", { id: orderId })');
  });
});
