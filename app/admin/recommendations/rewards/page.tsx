"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Play } from "lucide-react";
import { useTranslation } from "react-i18next";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { Button } from "@/components/ui/button";

export default function RecommendationRewardOperationsPage() {
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [clearing, setClearing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runRewardClearing() {
    if (clearing) return;
    setClearing(true);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/recommendations/run-clearing", { method: "POST" });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.error?.message ?? t("ui.recommendations.rewardClearing.error"));
      const result = body?.data ?? {};
      const completed = t("ui.recommendations.rewardClearing.completed", {
        cleared: result.cleared?.length ?? 0,
        reversed: result.reversed?.length ?? 0,
        skipped: result.skipped ?? 0,
      });
      setMessage(completed);
      showFeedback("success", completed);
    } catch (clearingError) {
      const failure = clearingError instanceof Error ? clearingError.message : t("ui.recommendations.rewardClearing.error");
      setError(failure);
      showFeedback("error", failure);
    } finally {
      setClearing(false);
    }
  }

  return (
    <AdminPageShell>
      <Link href="/admin/recommendations" className="inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline">
        <ArrowLeft size={15} /> {t("recommendation.detail.backToRecommendations")}
      </Link>
      <AdminPageHeader
        eyebrow={t("ui.recommendations.rewardClearing.eyebrow")}
        title={t("ui.recommendations.rewardClearing.title")}
        description={t("ui.recommendations.rewardClearing.description")}
      />

      <section className="rounded-2xl border border-border bg-card p-5" aria-label={t("ui.recommendations.rewardClearing.ariaLabel")}>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">{t("ui.recommendations.rewardClearing.operationTitle")}</h2>
            <p className="mt-1 max-w-2xl text-xs text-muted-foreground">{t("ui.recommendations.rewardClearing.operationDescription")}</p>
          </div>
          <Button type="button" onClick={runRewardClearing} disabled={clearing} className="shrink-0 gap-2">
            {clearing ? <CheckCircle2 size={15} className="animate-pulse" /> : <Play size={15} />}
            {clearing ? t("ui.recommendations.rewardClearing.running") : t("ui.recommendations.rewardClearing.run")}
          </Button>
        </div>
        {message && <p className="mt-4 rounded-xl bg-primary/10 px-4 py-3 text-sm font-medium text-primary">{message}</p>}
        {error && <p role="alert" className="mt-4 rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
      </section>
    </AdminPageShell>
  );
}
