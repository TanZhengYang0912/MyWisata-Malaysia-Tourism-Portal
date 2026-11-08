"use client";

import { AlertTriangle, Archive, ArrowDown, PauseCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

import type { SponsoredImpactPreview } from "@/lib/sponsored-placements/impact";

type SponsoredImpactDialogProps = {
  preview: SponsoredImpactPreview;
  intent: "create" | "approve";
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

export function SponsoredImpactDialog({
  preview,
  intent,
  busy,
  onCancel,
  onConfirm,
}: SponsoredImpactDialogProps) {
  const { t } = useTranslation("admin");
  const hasImpact = preview.shifts.length > 0 || preview.paused.length > 0 || preview.archived.length > 0;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-950/50 p-4" role="presentation">
      <section
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="sponsored-impact-title"
        aria-describedby="sponsored-impact-description"
        className="max-h-[90dvh] w-full max-w-xl overflow-y-auto overscroll-contain rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6"
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-700 dark:text-amber-200">
            <AlertTriangle size={19} />
          </div>
          <div className="min-w-0 break-words">
            <h2 id="sponsored-impact-title" className="text-lg font-bold text-foreground">
              {t(`sponsoredPlacements.preview.${intent === "create" ? "createTitle" : "approveTitle"}`)}
            </h2>
            <p id="sponsored-impact-description" className="mt-1 text-sm text-muted-foreground">
              {t("sponsoredPlacements.preview.position")} <strong className="text-foreground">{preview.requestedPosition}</strong>
            </p>
          </div>
        </div>

        {!hasImpact && (
          <div className="mt-5 rounded-xl border border-emerald-200 dark:border-emerald-500/30 bg-emerald-50 dark:bg-emerald-500/10 p-4 text-sm text-emerald-800 dark:text-emerald-200">
            {t("sponsoredPlacements.preview.noImpact")}
          </div>
        )}

        {preview.shifts.length > 0 && (
          <ImpactSection icon={<ArrowDown size={17} />} title={t("sponsoredPlacements.preview.shifts")}>
            {preview.shifts.map((item) => (
            <li key={item.placementId} className="flex flex-col gap-1 rounded-lg bg-secondary/60 px-3 py-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <span className="break-words font-medium text-foreground">{item.productName}</span>
                <span className="shrink-0 text-muted-foreground">{item.fromPosition} {t("sponsoredPlacements.preview.to")} {item.toPosition}</span>
              </li>
            ))}
          </ImpactSection>
        )}

        {preview.paused.length > 0 && (
          <ImpactSection icon={<PauseCircle size={17} />} title={t("sponsoredPlacements.preview.paused")} tone="warning">
            {preview.paused.map((item) => <li key={item.placementId} className="break-words">{item.productName}</li>)}
          </ImpactSection>
        )}

        {preview.archived.length > 0 && (
          <ImpactSection icon={<Archive size={17} />} title={t("sponsoredPlacements.preview.archived")}>
            {preview.archived.map((item) => <li key={item.placementId} className="break-words">{item.productName}</li>)}
          </ImpactSection>
        )}

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-full border border-border px-4 py-2 text-sm font-bold text-foreground disabled:opacity-50">
            {t("sponsoredPlacements.preview.cancel")}
          </button>
          <button type="button" disabled={busy} onClick={onConfirm} className="rounded-full bg-primary px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
            {t(`sponsoredPlacements.preview.${intent === "create" ? "confirmCreate" : "confirmApprove"}`)}
          </button>
        </div>
      </section>
    </div>
  );
}

function ImpactSection({
  icon,
  title,
  tone = "neutral",
  children,
}: {
  icon: React.ReactNode;
  title: string;
  tone?: "neutral" | "warning";
  children: React.ReactNode;
}) {
  return (
    <section className={`mt-4 rounded-xl border p-4 ${tone === "warning" ? "border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10" : "border-border bg-background"}`}>
      <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">{icon}{title}</h3>
      <ul className="mt-2 space-y-2 text-sm text-muted-foreground">{children}</ul>
    </section>
  );
}
