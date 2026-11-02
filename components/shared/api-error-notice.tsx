"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type ClipboardWriter = Pick<Clipboard, "writeText">;

export async function copyRequestId(requestId: string, clipboard: ClipboardWriter): Promise<void> {
  await clipboard.writeText(requestId);
}

export function ApiErrorNotice({ message, requestId }: { message: string; requestId?: string }) {
  const { t } = useTranslation("common");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");

  async function copyReference() {
    if (!requestId) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("clipboard_unavailable");
      await copyRequestId(requestId, navigator.clipboard);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  }

  return (
    <div role="alert" className="space-y-2 text-sm text-destructive">
      <p>{message}</p>
      {requestId && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span>{t("errors.referenceId")}</span>
          <code className="select-all break-all rounded bg-muted px-1.5 py-1 font-mono text-foreground">{requestId}</code>
          <Button type="button" size="sm" variant="outline" onClick={copyReference}>
            {t(copyState === "copied" ? "errors.referenceCopied" : "errors.copyReferenceId")}
          </Button>
          {copyState === "unavailable" && <span aria-live="polite">{t("errors.referenceCopyUnavailable")}</span>}
        </div>
      )}
    </div>
  );
}
