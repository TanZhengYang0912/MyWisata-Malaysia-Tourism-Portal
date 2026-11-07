"use client";

import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  titleIsTranslated?: boolean;
  description: string | ReactNode;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  confirmControl?: ReactNode;
  content?: ReactNode;
  confirmationPhrase?: string;
  confirmationResetKey?: string | number;
};

export function AdminConfirmDialog({ open, title, titleIsTranslated = false, description, confirmLabel, confirmVariant = "default", busy = false, onCancel, onConfirm, confirmControl, content, confirmationPhrase, confirmationResetKey }: Props) {
  const { t: tAdmin } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const resetKey = `${open}:${title}:${confirmationPhrase ?? ""}:${String(confirmationResetKey ?? "")}`;
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/45 p-4" role="presentation">
      <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200">
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-start justify-between gap-3">
              <h2 id="admin-confirm-title" className="break-words text-base font-semibold text-foreground">{titleIsTranslated ? title : tAdmin(title)}</h2>
              <button type="button" aria-label={tCommon("accessibility.closeConfirmation")} onClick={onCancel} disabled={busy} className="rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50">
                <X size={17} />
              </button>
            </div>
            <div id="admin-confirm-description" className="mt-2 text-sm leading-5 text-muted-foreground">
              {typeof description === "string" ? tAdmin(description) : description}
            </div>
        {content}
          </div>
        </div>
        <ConfirmationActions
          key={resetKey}
          phrase={confirmationPhrase}
          confirmLabel={confirmLabel}
          confirmVariant={confirmVariant}
          busy={busy}
          onCancel={onCancel}
          onConfirm={onConfirm}
          confirmControl={confirmControl}
        />
      </div>
    </div>
  );
}

function ConfirmationActions({ phrase, confirmLabel, confirmVariant, busy, onCancel, onConfirm, confirmControl }: Pick<Props, "confirmLabel" | "confirmVariant" | "busy" | "onCancel" | "onConfirm" | "confirmControl"> & { phrase?: string }) {
  const { t: tAdmin } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const [typedConfirmation, setTypedConfirmation] = useState("");

  return <>
    {phrase && <label className="mt-5 block text-sm">
      <span className="block text-muted-foreground">{tAdmin("accessControl.confirm.typePhrase", { phrase })}</span>
      <input aria-label={tAdmin("accessControl.confirm.typePhraseLabel")} value={typedConfirmation} onChange={(event) => setTypedConfirmation(event.target.value)} className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2" autoComplete="off" />
    </label>}
    <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
      <Button autoFocus variant="outline" onClick={onCancel} disabled={busy}>{tCommon("actions.cancel")}</Button>
      {confirmControl ?? <Button variant={confirmVariant} onClick={onConfirm} disabled={busy || Boolean(phrase && typedConfirmation !== phrase)}>{busy ? tCommon("states.processingEllipsis") : tAdmin(confirmLabel)}</Button>}
    </div>
  </>;
}
