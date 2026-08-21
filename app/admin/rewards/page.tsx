"use client";

import { useState, useEffect } from "react";
import { Award, Clock, CheckCircle2, Play } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { supabase } from "@/backend/supabase";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";

interface PendingSummary {
  count: number;
  totalRM: number;
}

export default function AdminRewardsPage() {
  const { currentUser } = useAuth();
  const { t } = useTranslation("admin");
  const [pending, setPending]     = useState<PendingSummary | null>(null);
  const [loading, setLoading]     = useState(true);
  const [clearing, setClearing]   = useState(false);
  const [lastResult, setLastResult] = useState<{ confirmed: number } | null>(null);
  const [error, setError]         = useState("");

  async function loadPending() {
    setLoading(true);
    try {
      // Count attributions past their hold_until (ready to confirm)
      const { data: overdue } = await supabase
        .from("affiliate_attributions")
        .select("commission_amount")
        .eq("status", "pending")
        .lte("hold_until", new Date().toISOString());

      const rows = overdue ?? [];
      setPending({
        count:   rows.length,
        totalRM: rows.reduce((s, r) => s + Number(r.commission_amount), 0),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (currentUser) loadPending();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  async function runClearance() {
    setClearing(true);
    setError("");
    setLastResult(null);
    try {
      const res = await fetch("/api/admin/clear-earnings", { method: "POST" });
      const body = await res.json();
      if (!res.ok) {
        setError(body.error ?? t("rewards.errors.clearanceFailed"));
        return;
      }
      setLastResult({ confirmed: body.confirmed ?? 0 });
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rewards.errors.unknown"));
    } finally {
      setClearing(false);
    }
  }

  return (
    <AdminPageShell>
      <div className="mx-auto w-full max-w-2xl space-y-6">
        <AdminPageHeader
          eyebrow={<span className="flex items-center gap-2"><Award size={14} /> {t("rewards.title")}</span>}
          title={t("rewards.title")}
          description={t("rewards.description")}
        />

      {/* Pending summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
            <Clock size={12} /> {t("rewards.readyToConfirm")}
          </p>
          {loading ? (
            <p className="text-2xl font-bold text-foreground">—</p>
          ) : (
            <p className="text-2xl font-bold text-foreground">{pending?.count ?? 0}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{t("rewards.pastHoldWindow")}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("rewards.totalValue")}</p>
          {loading ? (
            <p className="text-2xl font-bold text-foreground">—</p>
          ) : (
            <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">
              {MYR_CODE} {(pending?.totalRM ?? 0).toFixed(2)}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{t("rewards.movedToEarnings")}</p>
        </div>
      </div>

      {/* Run clearance */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm font-semibold text-foreground mb-1">{t("rewards.runNow")}</p>
        <p className="text-xs text-muted-foreground mb-4">
          {t("rewards.runDescription")}
        </p>

        {lastResult && (
          <div className="flex items-center gap-2 text-sm text-primary mb-4">
            <CheckCircle2 size={15} />
            {t("rewards.confirmed", { count: lastResult.confirmed })}
          </div>
        )}

        {error && (
          <p className="text-sm text-destructive mb-4">{error}</p>
        )}

        <Button
          onClick={runClearance}
          disabled={clearing || loading}
          className="flex items-center gap-2"
        >
          <Play size={14} />
          {clearing ? t("rewards.running") : t("rewards.runClearance")}
        </Button>
      </div>

      {/* Commission tiers info */}
      <div className="rounded-2xl border border-border bg-card p-6">
        <p className="text-sm font-semibold text-foreground mb-3">{t("rewards.tierRates")}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="text-left pb-2">{t("rewards.columns.tier")}</th>
              <th className="text-left pb-2">{t("rewards.columns.rollingConfirmed")}</th>
              <th className="text-right pb-2">{t("rewards.columns.rate")}</th>
            </tr>
          </thead>
          <tbody className="text-foreground">
            {[
              { tier: "Bronze", range: "0 – 3", rate: "3%" },
              { tier: "Silver", range: "4 – 7", rate: "4%" },
              { tier: "Gold",   range: "8+",    rate: "5%" },
            ].map((row) => (
              <tr key={row.tier} className="border-b border-border last:border-0">
                <td className="py-2 font-medium">{row.tier}</td>
                <td className="py-2 text-muted-foreground">{row.range}</td>
                <td className="py-2 text-right font-[family-name:var(--font-mono)]">{row.rate}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </div>
    </AdminPageShell>
  );
}
