import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("server translation runtime", () => {
  it("disables cross-language fallback before exposing a fixed translator", () => {
    const source = readFileSync(resolve(process.cwd(), "lib/i18n/server.ts"), "utf8");
    expect(source).toContain("i18n.options.fallbackLng = false");
    expect(source).toContain("i18n.getFixedT(locale, namespace)");
  });
});
