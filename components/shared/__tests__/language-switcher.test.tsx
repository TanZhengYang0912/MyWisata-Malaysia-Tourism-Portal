import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { APP_LOCALES } from "@/lib/i18n/locale";
import { LANGUAGE_OPTIONS, saveLocalePreference } from "../language-switcher";

const switcherSource = readFileSync(
  resolve(process.cwd(), "components/shared/language-switcher.tsx"),
  "utf8",
);

describe("LanguageSwitcher", () => {
  it("keeps native language labels in one shared option constant", () => {
    expect(LANGUAGE_OPTIONS).toEqual([
      { locale: "en", label: "English" },
      { locale: "zh-CN", label: "简体中文" },
      { locale: "ms", label: "Bahasa Melayu" },
    ]);
    expect(LANGUAGE_OPTIONS.map((option) => option.locale)).toEqual([...APP_LOCALES]);
  });

  it("posts the requested locale and resolves only for a 200 response", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);

    await expect(saveLocalePreference("zh-CN", fetcher)).resolves.toBeUndefined();
    expect(fetcher).toHaveBeenCalledWith("/api/locale", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locale: "zh-CN" }),
    });

    const failedFetcher = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    await expect(saveLocalePreference("ms", failedFetcher)).rejects.toThrow("Unable to save language preference");
  });

  it("uses accessible select semantics, disables while saving, and refreshes without pushing", () => {
    expect(switcherSource).toContain("<select");
    expect(switcherSource).toContain('aria-label={t("language.label")}');
    expect(switcherSource).toContain("value={confirmedLocale}");
    expect(switcherSource).toContain("disabled={saving}");
    expect(switcherSource).toContain('aria-live="polite"');
    expect(switcherSource).toContain("router.refresh()");
    expect(switcherSource).not.toContain("router.push");
  });
});
