export const APP_LOCALES = ["en", "zh-CN", "ms"] as const;
export type AppLocale = (typeof APP_LOCALES)[number];
export const DEFAULT_LOCALE: AppLocale = "en";
export const LOCALE_COOKIE = "NEXT_LOCALE";

export type ResolveLocaleInput = {
  accountLocale?: string | null;
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
};

export function isAppLocale(value: unknown): value is AppLocale {
  return typeof value === "string" && APP_LOCALES.includes(value as AppLocale);
}

function matchLanguageTag(tag: string): AppLocale | null {
  const normalizedTag = tag.trim().toLowerCase();

  if (normalizedTag === "en" || normalizedTag.startsWith("en-")) {
    return "en";
  }

  if (normalizedTag === "ms" || normalizedTag.startsWith("ms-")) {
    return "ms";
  }

  if (normalizedTag === "zh" || normalizedTag.startsWith("zh-")) {
    const parts = normalizedTag.split("-");
    const script = parts.find((part) => part.length === 4);
    const region = parts.find((part) => part.length === 2 || part.length === 3);

    if (script === "hant" || ["hk", "mo", "tw"].includes(region ?? "")) {
      return null;
    }

    return "zh-CN";
  }

  return null;
}

export function matchAcceptedLocale(header: string | null | undefined): AppLocale | null {
  if (!header) {
    return null;
  }

  const entries = header
    .split(",")
    .map((entry, index) => {
      const [languageRange, ...parameters] = entry.trim().split(";");
      const qualityParameter = parameters.find((parameter) => parameter.trim().toLowerCase().startsWith("q="));
      const quality = qualityParameter ? Number(qualityParameter.trim().slice(2)) : 1;

      return {
        languageRange: languageRange.trim(),
        quality: Number.isFinite(quality) ? Math.max(0, Math.min(1, quality)) : 0,
        index,
      };
    })
    .filter((entry) => entry.quality > 0 && entry.languageRange)
    .sort((left, right) => right.quality - left.quality || left.index - right.index);

  for (const entry of entries) {
    const locale = matchLanguageTag(entry.languageRange);

    if (locale) {
      return locale;
    }
  }

  return null;
}

export function resolveAppLocale(input: ResolveLocaleInput): AppLocale {
  if (isAppLocale(input.accountLocale)) {
    return input.accountLocale;
  }

  if (isAppLocale(input.cookieLocale)) {
    return input.cookieLocale;
  }

  return matchAcceptedLocale(input.acceptLanguage) ?? DEFAULT_LOCALE;
}
