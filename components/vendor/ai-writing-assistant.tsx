"use client";

import type { ReactNode } from "react";
import { Check, RotateCcw, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  draft?: ReactNode;
  busy?: boolean;
  error?: string | null;
  label?: string;
  buttonLabel?: string;
  compact?: boolean;
  onGenerate: () => void;
  onApply?: () => void;
  onDiscard?: () => void;
}

export default function AiWritingAssistant({
  draft,
  busy = false,
  error,
  label = "AI writing assistant",
  buttonLabel = "Generate with AI",
  compact = false,
  onGenerate,
  onApply,
  onDiscard,
}: Props) {
  const { t } = useTranslation("vendor");
  const resolvedLabel = label === "AI writing assistant" ? t("assistant.title") : label === "AI hero copy" ? t("assistant.heroLabel") : label === "AI listing assistant" ? t("assistant.listingLabel") : label;
  const resolvedButtonLabel = buttonLabel === "Generate with AI" ? t("assistant.generateWithAi") : buttonLabel === "Generate" ? t("assistant.generate") : buttonLabel === "Suggest listing" ? t("assistant.suggestListing") : buttonLabel;
  return (
    <div className={`rounded-xl border border-violet-100 dark:border-violet-500/30 bg-violet-50/70 dark:bg-violet-500/10 ${compact ? "p-2.5" : "p-3"}`}>
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-950 dark:text-violet-200"><Sparkles size={14} /> {resolvedLabel}</p>
        </div>
        <button type="button" onClick={onGenerate} disabled={busy} className="inline-flex min-h-11 w-full shrink-0 items-center justify-center gap-1.5 rounded-lg bg-violet-700 px-3 py-2 text-xs font-semibold text-white transition hover:bg-violet-800 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto">
          <Sparkles size={13} /> {busy ? t("assistant.drafting") : resolvedButtonLabel}
        </button>
      </div>
      {error && <p role="alert" className="mt-2 text-xs text-red-700 dark:text-red-200">{error}</p>}
      {draft && (
        <div className="mt-3 rounded-lg border border-violet-200 dark:border-violet-500/30 bg-white dark:bg-card p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-violet-700 dark:text-violet-200">{t("assistant.draftPreview")}</p>
          <div className="mt-2 text-sm leading-6 text-gray-800 dark:text-foreground">{draft}</div>
          {(onApply || onDiscard) && <div className="mt-3 flex flex-wrap gap-2">
            {onApply && <button type="button" onClick={onApply} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white"><Check size={13} /> {t("assistant.applyDraft")}</button>}
            {onDiscard && <button type="button" onClick={onDiscard} className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 dark:border-border px-3 py-2 text-xs font-semibold text-gray-600 dark:text-muted-foreground hover:bg-gray-50 dark:hover:bg-muted/50"><X size={13} /> {t("assistant.discard")}</button>}
            {onGenerate && <button type="button" onClick={onGenerate} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 dark:border-violet-500/30 px-3 py-2 text-xs font-semibold text-violet-700 dark:text-violet-200 hover:bg-violet-50 dark:hover:bg-violet-500/10 disabled:opacity-50"><RotateCcw size={13} /> {t("assistant.regenerate")}</button>}
          </div>}
        </div>
      )}
    </div>
  );
}
