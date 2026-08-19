import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("email sign-in feedback", () => {
  it("guides people who originally used Google without revealing account identity", () => {
    const page = readFileSync(resolve(process.cwd(), "app/login/page.tsx"), "utf8");
    const messages = ["en", "zh-CN", "ms"].map((locale) => {
      const dictionary = JSON.parse(readFileSync(
        resolve(process.cwd(), `app/i18n/locales/${locale}/auth.json`),
        "utf8",
      )) as { signIn: { error: string } };
      return dictionary.signIn.error;
    });

    expect(page).toContain('setError(tAuth("signIn.error"))');
    expect(messages.every((message) => message.length > 0)).toBe(true);
    expect(messages[0]).toContain("If you originally used Google");
  });
});
