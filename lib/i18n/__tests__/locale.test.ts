import { describe, expect, it } from "vitest";
import { isAppLocale, matchAcceptedLocale, resolveAppLocale } from "../locale";

describe("resolveAppLocale", () => {
  it("uses cookie, account, browser, then English precedence", () => {
    expect(resolveAppLocale({ accountLocale: "ms", cookieLocale: "zh-CN", acceptLanguage: "en" })).toBe("zh-CN");
    expect(resolveAppLocale({ accountLocale: "ms", cookieLocale: null, acceptLanguage: "zh-CN" })).toBe("ms");
    expect(resolveAppLocale({ accountLocale: null, cookieLocale: "zh-CN", acceptLanguage: "ms-MY,en;q=0.8" })).toBe("zh-CN");
    expect(resolveAppLocale({ accountLocale: null, cookieLocale: null, acceptLanguage: "ms-MY,en;q=0.8" })).toBe("ms");
    expect(resolveAppLocale({ accountLocale: null, cookieLocale: "xx", acceptLanguage: "fr" })).toBe("en");
  });

  it("normalizes supported browser variants without accepting arbitrary values", () => {
    expect(matchAcceptedLocale("zh-SG,zh;q=0.9,en;q=0.8")).toBe("zh-CN");
    expect(matchAcceptedLocale("ms-MY,en;q=0.8")).toBe("ms");
    expect(isAppLocale("en")).toBe(true);
    expect(isAppLocale("zh-TW")).toBe(false);
  });
});
