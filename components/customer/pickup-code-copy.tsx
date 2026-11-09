"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

export function PickupCodeCopy({ code }: { code: string }) {
  const { t } = useTranslation("customer");
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function copyCode() {
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setCopyFailed(false);
    } catch {
      setCopied(false);
      setCopyFailed(true);
    }
  }

  const copyLabel = copied ? t("ui.pickupPasses.codeCopied") : t("ui.pickupPasses.copyCode");

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="text-xs font-semibold text-muted-foreground">{t("ui.pickupPasses.pickupCode")}</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => void copyCode()}
        aria-label={`${copyLabel}: ${code}`}
        title={copyLabel}
        className="h-8 gap-1.5 rounded-full border-primary/40 bg-primary/5 px-2.5 text-primary hover:bg-primary/10 hover:text-primary"
      >
        <code className="select-all whitespace-nowrap font-mono text-xs font-bold tracking-[0.06em] sm:text-sm">{code}</code>
        {copied ? <Check size={14} aria-hidden="true" /> : <Copy size={14} aria-hidden="true" />}
      </Button>
      <span className="sr-only" aria-live="polite">{copied ? t("ui.pickupPasses.codeCopied") : ""}</span>
      {copyFailed && <span role="alert" className="w-full text-xs text-destructive">{t("ui.pickupPasses.copyCodeFailed")}</span>}
    </div>
  );
}
