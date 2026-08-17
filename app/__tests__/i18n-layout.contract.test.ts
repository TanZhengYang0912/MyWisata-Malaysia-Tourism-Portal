import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "../..");
const layoutSource = readFileSync(resolve(root, "app/layout.tsx"), "utf8");

describe("root locale hydration contract", () => {
  it("resolves the request locale and resources before rendering the html shell", () => {
    expect(layoutSource).toMatch(/export default async function RootLayout/);
    expect(layoutSource).toContain("const locale = await getRequestLocale();");
    expect(layoutSource).toContain("const resources = await loadLocaleResources(locale);");
    expect(layoutSource).toMatch(/<html[\s\S]*lang=\{locale\}/);
  });

  it("keeps the existing feedback, auth, and cart provider relationship inside i18n", () => {
    const i18nIndex = layoutSource.indexOf("<AppI18nProvider");
    const feedbackIndex = layoutSource.indexOf("<ActionFeedbackProvider", i18nIndex);
    const authIndex = layoutSource.indexOf("<AuthProvider", feedbackIndex);
    const cartIndex = layoutSource.indexOf("<CartProvider", authIndex);

    expect(i18nIndex).toBeGreaterThanOrEqual(0);
    expect(feedbackIndex).toBeGreaterThan(i18nIndex);
    expect(authIndex).toBeGreaterThan(feedbackIndex);
    expect(cartIndex).toBeGreaterThan(authIndex);
    expect(layoutSource).toContain("</CartProvider>");
    expect(layoutSource).toContain("</AuthProvider>");
    expect(layoutSource).toContain("</ActionFeedbackProvider>");
    expect(layoutSource).toContain("</AppI18nProvider>");
  });
});
