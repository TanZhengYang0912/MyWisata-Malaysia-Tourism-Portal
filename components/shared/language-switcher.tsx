"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { cn } from "@/components/utils";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_LOCALE, isAppLocale, type AppLocale } from "@/lib/i18n/locale";

export const LANGUAGE_OPTIONS = [
  { locale: "en", label: "English" },
  { locale: "zh-CN", label: "简体中文" },
  { locale: "ms", label: "Bahasa Melayu" },
] as const satisfies readonly { locale: AppLocale; label: string }[];

type LocaleFetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export async function saveLocalePreference(locale: AppLocale, fetcher: LocaleFetcher = fetch): Promise<void> {
  const response = await fetcher("/api/locale", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ locale }),
  });

  if (response.status !== 200) {
    throw new Error("Unable to save language preference");
  }
}

export function LanguageSwitcher({ compact = false, className }: { compact?: boolean; className?: string }) {
  const { t, i18n } = useTranslation("common");
  const { showFeedback } = useActionFeedback();
  const router = useRouter();
  const id = useId();
  const resolvedLocale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("");

  async function handleLocaleChange(value: string) {
    if (saving || !isAppLocale(value) || value === resolvedLocale) return;

    setSaving(true);
    try {
      await saveLocalePreference(value);
      const message = t("language.saved");
      setStatus(message);
      showFeedback("success", message);
      router.refresh();
    } catch {
      const message = t("language.saveError");
      setStatus(message);
      showFeedback("error", message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={cn("flex items-center gap-2", compact ? "w-full" : "w-fit", className)}>
      <label htmlFor={id} className={compact ? "sr-only" : "text-sm font-semibold text-foreground"}>{t("language.label")}</label>
      <Select
        value={resolvedLocale}
        onValueChange={(value) => { void handleLocaleChange(value); }}
        disabled={saving}
      >
        <SelectTrigger
          id={id}
          aria-label={t("language.label")}
          aria-busy={saving}
          className={cn(
            "rounded-xl border border-border bg-background text-sm text-foreground transition focus-visible:border-primary focus-visible:ring-4 focus-visible:ring-primary/10 disabled:cursor-wait disabled:opacity-60",
            compact ? "h-9 min-w-0 flex-1 px-3" : "h-10 min-w-44 px-3",
          )}
        >
          <SelectValue />
        </SelectTrigger>
        <SelectContent
          align="end"
          className="min-w-[var(--radix-select-trigger-width)] rounded-xl border-border shadow-[0_12px_32px_rgba(1,0,102,0.14)]"
        >
          {LANGUAGE_OPTIONS.map(({ locale, label }) => (
            <SelectItem key={locale} value={locale} className="rounded-lg py-2">
              {label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="sr-only" aria-live="polite">{status}</span>
    </div>
  );
}
