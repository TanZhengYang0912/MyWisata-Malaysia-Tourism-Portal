"use client";

import { useState, useEffect } from "react";
import { Award, Clock, CheckCircle2, Play } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { supabase } from "@/backend/supabase";
import { Button } from "@/components/ui/button";
import { useTranslation } from "react-i18next";

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
        setError(body.error ?? t("rewards.errors.clearanceFailed", { defaultValue: "Clearance failed" }));
        return;
      }
      setLastResult({ confirmed: body.confirmed ?? 0 });
      await loadPending();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("rewards.errors.unknown", { defaultValue: "Unknown error" }));
    } finally {
      setClearing(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-center gap-3 mb-8">
        <Award size={22} className="text-primary" />
        <div>
          <h1 className="text-xl font-bold text-foreground">{t("rewards.title", { defaultValue: "Reward Clearance" })}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {t("rewards.description", { defaultValue: "Move affiliate commissions from pending hold into available earnings." })}
          </p>
        </div>
      </div>

      {/* Pending summary */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        <div className="rounded-xl border border-border p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 flex items-center gap-1.5">
            <Clock size={12} /> {t("rewards.readyToConfirm", { defaultValue: "Ready to confirm" })}
          </p>
          {loading ? (
            <p className="text-2xl font-bold text-foreground">—</p>
          ) : (
            <p className="text-2xl font-bold text-foreground">{pending?.count ?? 0}</p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{t("rewards.pastHoldWindow", { defaultValue: "attributions past hold window" })}</p>
        </div>
        <div className="rounded-xl border border-border p-5">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">{t("rewards.totalValue", { defaultValue: "Total value" })}</p>
          {loading ? (
            <p className="text-2xl font-bold text-foreground">—</p>
          ) : (
            <p className="text-2xl font-bold text-foreground font-[family-name:var(--font-mono)]">
              RM {(pending?.totalRM ?? 0).toFixed(2)}
            </p>
          )}
          <p className="text-xs text-muted-foreground mt-1">{t("rewards.movedToEarnings", { defaultValue: "to be moved to earnings_sen" })}</p>
        </div>
      </div>

      {/* Run clearance */}
      <div className="rounded-xl border border-border p-6">
        <p className="text-sm font-semibold text-foreground mb-1">{t("rewards.runNow", { defaultValue: "Run clearance now" })}</p>
        <p className="text-xs text-muted-foreground mb-4">
          {t("rewards.runDescription", { defaultValue: "Processes all pending commissions whose hold window has expired. Vercel Cron also runs this automatically at midnight MYT." })}
        </p>

        {lastResult && (
          <div className="flex items-center gap-2 text-sm text-primary mb-4">
            <CheckCircle2 size={15} />
            {t("rewards.confirmed", { defaultValue: "Confirmed {{count}} attribution.", count: lastResult.confirmed })}
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
          {clearing ? t("rewards.running", { defaultValue: "Running…" }) : t("rewards.runClearance", { defaultValue: "Run Clearance" })}
        </Button>
      </div>

      {/* Commission tiers info */}
      <div className="rounded-xl border border-border p-6 mt-6">
        <p className="text-sm font-semibold text-foreground mb-3">{t("rewards.tierRates", { defaultValue: "Affiliate Tier Rates" })}</p>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
              <th className="text-left pb-2">{t("rewards.columns.tier", { defaultValue: "Tier" })}</th>
              <th className="text-left pb-2">{t("rewards.columns.rollingConfirmed", { defaultValue: "Rolling 30-day confirmed" })}</th>
              <th className="text-right pb-2">{t("rewards.columns.rate", { defaultValue: "Rate" })}</th>
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
  );
}
