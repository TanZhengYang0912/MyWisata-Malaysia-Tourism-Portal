"use client";

// P4 — Member 4: user affiliate dashboard. See CLAUDE.md Step 6.
// Not linked from app/customer/layout.tsx's nav — the activity page is the
// only existing file this module is allowed to touch (CLAUDE.md Section 1),
// so this page is reachable by direct URL only for now.

import { useEffect, useMemo, useState } from "react";
import { Copy, Link2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { isKycApproved } from "@/lib/affiliate/verification";
import { AffiliateClicksChart } from "@/components/customer/affiliate-clicks-chart";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import type { AffiliateDailyClicks, AffiliateProductStat } from "@/lib/affiliate/stats";

interface StatsResponse {
  affiliateCode: string | null;
  affiliateUrl: string | null;
  totals: { clicks: number; referrals: number; pendingEarnings: number; availableEarnings: number };
  byProduct: AffiliateProductStat[];
  clicksByDay: AffiliateDailyClicks[];
}

type SortKey = "clicks" | "referrals" | "earnings";

export default function AffiliateDashboardPage() {
  const { currentUser, loading: authLoading } = useAuth();
  const [stats, setStats] = useState<StatsResponse | null | undefined>(undefined); // undefined = loading
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("clicks");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  async function loadStats() {
    try {
      const res = await fetch("/api/affiliate/stats");
      if (!res.ok) {
        setStats(null);
        return;
      }
      const body = (await res.json()) as { data: StatsResponse | null };
      setStats(body.data);
    } catch {
      setStats(null);
    }
  }

  useEffect(() => {
    if (!currentUser) return;
    (async () => {
      await loadStats();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const sortedProducts = useMemo(() => {
    if (!stats) return [];
    return [...stats.byProduct].sort((a, b) => {
      const diff = a[sortKey] - b[sortKey];
      return sortDir === "asc" ? diff : -diff;
    });
  }, [stats, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  async function generateLink() {
    if (generating) return;
    setGenerating(true);
    try {
      await fetch("/api/affiliate/link", { method: "POST" });
    } finally {
      setGenerating(false);
      loadStats();
    }
  }

  async function copyLink() {
    if (!stats?.affiliateUrl) return;
    try {
      await navigator.clipboard.writeText(stats.affiliateUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // best-effort — nothing more to do if clipboard access is denied
    }
  }

  if (authLoading || stats === undefined) {
    return <div className="max-w-4xl mx-auto px-6 py-16 text-sm text-muted-foreground">Loading…</div>;
  }

  if (!currentUser) {
    return <EmptyState title="Sign in required" description="Sign in to see your affiliate dashboard." />;
  }

  if (!isKycApproved(currentUser)) {
    return (
      <EmptyState
        title="Verify your account to start earning"
        description="Affiliate links are only available to KYC-approved accounts."
      />
    );
  }

  if (stats === null) {
    return (
      <EmptyState
        title="Couldn't load your stats"
        description="Something went wrong loading your affiliate dashboard. Try refreshing the page."
      />
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
      <h1 className="text-2xl font-bold text-foreground mb-6 font-[family-name:var(--font-display)]">
        My Affiliate Dashboard
      </h1>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Clicks", value: String(stats.totals.clicks) },
          { label: "Referrals", value: String(stats.totals.referrals) },
          { label: "Pending earnings", value: `RM ${stats.totals.pendingEarnings.toFixed(2)}` },
          { label: "Available earnings", value: `RM ${stats.totals.availableEarnings.toFixed(2)}` },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border p-4">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{card.label}</p>
            <p className="text-xl font-bold text-foreground font-[family-name:var(--font-mono)]">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-border p-4 mb-6 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          <Link2 size={16} className="text-teal shrink-0" />
          {stats.affiliateCode ? (
            <span className="text-sm font-semibold text-foreground font-[family-name:var(--font-mono)] truncate">
              {stats.affiliateUrl}
            </span>
          ) : (
            <span className="text-sm text-muted-foreground">You don&apos;t have an affiliate link yet.</span>
          )}
        </div>
        {stats.affiliateCode ? (
          <Button size="sm" onClick={copyLink} className="shrink-0">
            <Copy size={14} /> {copied ? "Copied" : "Copy"}
          </Button>
        ) : (
          <Button size="sm" onClick={generateLink} disabled={generating} className="shrink-0">
            {generating ? "Generating…" : "Generate my link"}
          </Button>
        )}
      </div>

      <div className="rounded-xl border border-border p-4 mb-6">
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3">Clicks — last 30 days</p>
        <AffiliateClicksChart data={stats.clicksByDay} />
      </div>

      <div className="rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-4 py-2.5 font-semibold">Activity</th>
              {(["clicks", "referrals", "earnings"] as SortKey[]).map((key) => (
                <th key={key} className="text-right px-4 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(key)} className="uppercase tracking-wide">
                    {key === "earnings" ? "Earned" : key}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedProducts.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No clicks on any activity yet.
                </td>
              </tr>
            ) : (
              sortedProducts.map((p) => (
                <tr key={p.productId} className="border-t border-border">
                  <td className="px-4 py-2.5 font-medium text-foreground">{p.productName}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{p.clicks}</td>
                  <td className="px-4 py-2.5 text-right text-foreground">{p.referrals}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-foreground">
                    RM {p.earnings.toFixed(2)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
