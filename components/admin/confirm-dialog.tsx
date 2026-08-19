"use client";

import { useEffect } from "react";
import { AlertTriangle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  confirmVariant?: "default" | "destructive";
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function AdminConfirmDialog({ open, title, description, confirmLabel, confirmVariant = "default", busy = false, onCancel, onConfirm }: Props) {
  const { t: tAdmin } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
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
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-5 shadow-2xl" role="alertdialog" aria-modal="true" aria-labelledby="admin-confirm-title" aria-describedby="admin-confirm-description">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-700">
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-3">
              <h2 id="admin-confirm-title" className="text-base font-semibold text-foreground">{tAdmin(title, { defaultValue: title })}</h2>
              <button type="button" aria-label={tCommon("accessibility.closeConfirmation", { defaultValue: "Close confirmation" })} onClick={onCancel} disabled={busy} className="rounded-md p-1 text-muted-foreground hover:bg-secondary disabled:opacity-50">
                <X size={17} />
              </button>
            </div>
            <p id="admin-confirm-description" className="mt-2 text-sm leading-5 text-muted-foreground">{tAdmin(description, { defaultValue: description })}</p>
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button autoFocus variant="outline" onClick={onCancel} disabled={busy}>{tCommon("actions.cancel", { defaultValue: "Cancel" })}</Button>
          <Button variant={confirmVariant} onClick={onConfirm} disabled={busy}>{busy ? tCommon("states.processingEllipsis", { defaultValue: "Processing…" }) : tAdmin(confirmLabel, { defaultValue: confirmLabel })}</Button>
        </div>
      </div>
    </div>
  );
}
