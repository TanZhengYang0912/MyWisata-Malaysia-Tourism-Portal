"use client";

import { AlertTriangle, ArrowRight, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";

import { AdminMetricGrid } from "@/components/admin/admin-page-shell";
import { Button } from "@/components/ui/button";
import type { AccessControlTabId, ApiEnvelope } from "@/components/admin/access-control/types";
import { errorMessage } from "@/components/admin/access-control/types";

type OverviewData = {
  generation: number;
  counts: {
    capabilities: number;
    policies: number;
    activeVersions: number;
    pendingApprovals: number;
    activeAssignments: number;
    expiringAssignments: number;
  };
  warnings: string[];
};

export function OverviewTab({ onOpenTab }: { onOpenTab: (tab: AccessControlTabId) => void }) {
  const { t } = useTranslation("admin");
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/access-control/overview", { cache: "no-store" });
      const body = await response.json() as ApiEnvelope<OverviewData>;
      if (!response.ok || !body.data) throw new Error(errorMessage(body, t("accessControl.errors.load")));
      setData(body.data);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : t("accessControl.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    const timeoutId = setTimeout(() => { void load(); }, 0);
    return () => clearTimeout(timeoutId);
  }, [load]);

  if (loading && !data) return <StateCard text={t("accessControl.states.loading")} />;
  if (error && !data) return <StateCard text={error} action={<Button variant="outline" onClick={() => void load()}><RefreshCw /> {t("accessControl.actions.retry")}</Button>} />;
  if (!data) return <StateCard text={t("accessControl.states.empty")} />;

  return (
    <div className="space-y-5">
      <AdminMetricGrid items={[
        { label: t("accessControl.overview.activeVersions"), value: data.counts.activeVersions, detail: t("accessControl.overview.policiesDetail", { count: data.counts.policies }) },
        { label: t("accessControl.overview.pendingApprovals"), value: data.counts.pendingApprovals, tone: data.counts.pendingApprovals ? "text-amber-600" : undefined },
        { label: t("accessControl.overview.activeAssignments"), value: data.counts.activeAssignments, detail: t("accessControl.overview.expiringDetail", { count: data.counts.expiringAssignments }) },
        { label: t("accessControl.overview.generation"), value: data.generation, detail: t("accessControl.overview.capabilitiesDetail", { count: data.counts.capabilities }) },
      ]} />

      <section className="grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div className="rounded-2xl border border-border bg-card p-5">
          <div className="flex items-center justify-between gap-3">
            <div><h2 className="font-semibold text-foreground">{t("accessControl.overview.healthTitle")}</h2><p className="mt-1 text-sm text-muted-foreground">{t("accessControl.overview.healthDescription")}</p></div>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /> {t("accessControl.actions.refresh")}</Button>
          </div>
          {data.warnings.length === 0 ? (
            <p className="mt-5 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">{t("accessControl.overview.noWarnings")}</p>
          ) : (
            <ul className="mt-5 space-y-2">{data.warnings.map((warning) => <li key={warning} className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-300"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {t(`accessControl.warnings.${warning}`)}</li>)}</ul>
          )}
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <h2 className="font-semibold text-foreground">{t("accessControl.overview.attentionTitle")}</h2>
          <div className="mt-4 grid gap-2">
            <QuickLink label={t("accessControl.overview.reviewApprovals", { count: data.counts.pendingApprovals })} onClick={() => onOpenTab("policies")} />
            <QuickLink label={t("accessControl.overview.reviewExpiring", { count: data.counts.expiringAssignments })} onClick={() => onOpenTab("assignments")} />
            <QuickLink label={t("accessControl.overview.openAudit")} onClick={() => onOpenTab("audit-log")} />
          </div>
        </div>
      </section>
    </div>
  );
}

function QuickLink({ label, onClick }: { label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5 text-left text-sm font-medium text-foreground transition hover:border-primary/30 hover:bg-secondary">{label}<ArrowRight className="h-4 w-4 text-muted-foreground" /></button>;
}

function StateCard({ text, action }: { text: string; action?: React.ReactNode }) {
  return <div className="rounded-2xl border border-border bg-card px-6 py-14 text-center"><p className="text-sm text-muted-foreground">{text}</p>{action && <div className="mt-4 flex justify-center">{action}</div>}</div>;
}
