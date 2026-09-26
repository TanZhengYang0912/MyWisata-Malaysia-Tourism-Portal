"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Check, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type RefundRequestItem = {
  qty: number;
  label: string;
};

type RefundRequestDialogProps = {
  open: boolean;
  summary?: string;
  items?: readonly RefundRequestItem[];
  submitting?: boolean;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
};

const REFUND_REASON_OPTIONS = [
  { value: "schedule_change", key: "ui.orders.refundReasonSchedule" },
  { value: "mistake", key: "ui.orders.refundReasonMistake" },
  { value: "unavailable", key: "ui.orders.refundReasonUnavailable" },
  { value: "dissatisfied", key: "ui.orders.refundReasonDissatisfied" },
  { value: "other", key: "ui.orders.refundReasonOther" },
];

export function RefundRequestDialog({
  open,
  summary,
  items = [],
  submitting = false,
  onCancel,
  onConfirm,
}: RefundRequestDialogProps) {
  const { t } = useTranslation("customer");
  const [reasonType, setReasonType] = useState("schedule_change");
  const [customReason, setCustomReason] = useState("");

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reset form state when a new dialog opens
    setReasonType("schedule_change");
    setCustomReason("");
  }, [open, summary]);

  if (!open) return null;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const selectedReasonLabel = t(
      REFUND_REASON_OPTIONS.find((option) => option.value === reasonType)?.key ?? "ui.orders.refundReasonOther",
    );
    const reason = customReason.trim()
      ? `${selectedReasonLabel}: ${customReason.trim()}`
      : selectedReasonLabel;
    if (reason.length < 5 || submitting) return;
    onConfirm(reason);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="refund-request-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/50 p-4 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-card p-6 shadow-2xl animate-in zoom-in-95 duration-200 sm:p-7">
        <button
          type="button"
          onClick={onCancel}
          disabled={submitting}
          className="absolute right-5 top-5 rounded-full p-2 text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-50"
          aria-label={t("ui.actions.close")}
        >
          <X size={18} />
        </button>

        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-amber-500/10 text-amber-600">
            <RotateCcw size={22} />
          </div>
          <div className="pr-6">
            <h2 id="refund-request-dialog-title" className="text-xl font-bold tracking-tight text-foreground">
              {t("ui.orders.requestRefundModalTitle")}
            </h2>
            {summary && <p className="mt-1 text-xs text-muted-foreground">{summary}</p>}
          </div>
        </div>

        {items.length > 0 && (
          <div className="mt-5 rounded-xl border border-border bg-secondary/30 p-3.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              {t("ui.orders.refundableItems")}
            </p>
            <div className="mt-2 space-y-1">
              {items.map((item, index) => (
                <p key={`${item.label}-${index}`} className="break-words whitespace-normal text-xs font-medium text-foreground">
                  {item.qty}× {item.label}
                </p>
              ))}
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("ui.orders.refundReasonSelect")}
            </p>
            <div className="mt-2 space-y-2">
              {REFUND_REASON_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  className={`flex cursor-pointer items-center justify-between rounded-xl border p-3 text-xs font-semibold transition ${
                    reasonType === option.value
                      ? "border-primary bg-primary/5 text-primary ring-1 ring-primary"
                      : "border-border bg-card text-foreground hover:bg-secondary/40"
                  }`}
                >
                  <span>{t(option.key)}</span>
                  <input
                    type="radio"
                    name="refundReason"
                    value={option.value}
                    checked={reasonType === option.value}
                    onChange={() => setReasonType(option.value)}
                    className="sr-only"
                  />
                  {reasonType === option.value && <Check size={14} className="text-primary" />}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="refund-request-details" className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {t("ui.orders.refundDetailsLabel")}
            </label>
            <textarea
              id="refund-request-details"
              rows={3}
              value={customReason}
              onChange={(event) => setCustomReason(event.target.value)}
              placeholder={t("ui.orders.refundDetailsPlaceholder")}
              className="mt-2 w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="flex gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <p>{t("ui.orders.refundPolicyNotice")}</p>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-border pt-3">
            <Button type="button" variant="outline" className="rounded-xl px-4" onClick={onCancel} disabled={submitting}>
              {t("ui.actions.cancel")}
            </Button>
            <Button type="submit" disabled={submitting} className="rounded-xl bg-primary px-5 font-semibold text-white hover:bg-primary/90">
              {submitting ? t("ui.states.submitting") : t("ui.orders.submitRefund")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
