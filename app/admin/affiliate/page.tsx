"use client";

// P4 — Member 4: admin affiliate oversight. See CLAUDE.md Step 9.

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";

interface AdminAffiliateStats {
  totals: {
    totalAffiliates: number;
    totalClicks: number;
    totalReferrals: number;
    totalCommission: number;
    currentRate: number;
  };
  topEarners: { userId: string; userName: string; referrals: number; commission: number }[];
  suspiciousLinks: {
    linkId: string;
    userId: string;
    userName: string;
    affiliateCode: string;
    clicks: number;
    referrals: number;
    reasons: string[];
  }[];
  attributions: {
    id: string;
    userId: string;
    userName: string;
    productId: string | null;
    productName: string | null;
    orderId: string;
    commissionAmount: number;
    status: string;
    createdAt: string;
  }[];
}

type SortKey = "createdAt" | "userName" | "productName" | "status";

const REASON_LABEL: Record<string, string> = {
  high_clicks_no_referrals: "Many clicks, zero referrals",
  clustered_visitor: "Clicks clustered on one visitor",
};

export default function AdminAffiliatePage() {
  const [stats, setStats] = useState<AdminAffiliateStats | null | undefined>(undefined);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/admin/affiliate/stats");
        const body = (await res.json()) as { data: AdminAffiliateStats | null };
        setStats(res.ok && body.data ? body.data : null);
      } catch {
        setStats(null);
      }
    })();
  }, []);

  const filteredAttributions = useMemo(() => {
    if (!stats) return [];
    let rows = stats.attributions;
    if (statusFilter !== "all") rows = rows.filter((r) => r.status === statusFilter);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.userName.toLowerCase().includes(q) || (r.productName ?? "").toLowerCase().includes(q));
    }
    return [...rows].sort((a, b) => {
      let diff = 0;
      if (sortKey === "createdAt") diff = a.createdAt < b.createdAt ? -1 : 1;
      else if (sortKey === "userName") diff = a.userName.localeCompare(b.userName);
      else if (sortKey === "productName") diff = (a.productName ?? "").localeCompare(b.productName ?? "");
      else diff = a.status.localeCompare(b.status);
      return sortDir === "asc" ? diff : -diff;
    });
  }, [stats, statusFilter, search, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("desc");
    }
  }

  if (stats === undefined) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (stats === null) {
    return (
      <EmptyState
        title="Couldn't load affiliate stats"
        description="Something went wrong loading the affiliate overview. Try refreshing the page."
      />
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-1">Affiliate Oversight</h1>
      <p className="text-xs text-muted-foreground mb-6">
        Current commission rate: {(stats.totals.currentRate * 100).toFixed(1)}%
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[
          { label: "Affiliates", value: String(stats.totals.totalAffiliates) },
          { label: "Clicks", value: String(stats.totals.totalClicks) },
          { label: "Referrals", value: String(stats.totals.totalReferrals) },
          { label: "Commission committed", value: `RM ${stats.totals.totalCommission.toFixed(2)}` },
        ].map((card) => (
          <div key={card.label} className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{card.label}</p>
            <p className="text-xl font-bold text-foreground">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
            <TrendingUp size={13} /> Top earners
          </p>
          {stats.topEarners.length === 0 ? (
            <p className="text-sm text-muted-foreground">No commissions earned yet.</p>
          ) : (
            <div className="space-y-2">
              {stats.topEarners.map((e, i) => (
                <div key={e.userId} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {i + 1}. {e.userName}
                  </span>
                  <span className="text-muted-foreground">
                    {e.referrals} referrals · <span className="font-semibold text-foreground">RM {e.commission.toFixed(2)}</span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-destructive mb-3 flex items-center gap-1.5">
            <AlertTriangle size={13} /> Suspicious activity
          </p>
          {stats.suspiciousLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing flagged.</p>
          ) : (
            <div className="space-y-2">
              {stats.suspiciousLinks.map((l) => (
                <div key={l.linkId} className="text-sm">
                  <p className="text-foreground font-medium">
                    {l.userName} <span className="text-muted-foreground font-normal">({l.affiliateCode})</span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {l.clicks} clicks · {l.referrals} referrals — {l.reasons.map((r) => REASON_LABEL[r] ?? r).join(", ")}
                  </p>
                </div>
              ))}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-3 pt-3 border-t border-border">
            Self-referrals are rejected at attribution time and never stored — there is no row to show
            here for them.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">All attributions</p>
        <div className="flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search user or activity…"
            className="h-8 rounded-lg border border-border px-3 text-xs bg-background text-foreground"
          />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="confirmed">Confirmed</option>
            <option value="reversed">Reversed</option>
          </select>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <table className="w-full text-sm">
          <thead className="bg-muted text-muted-foreground text-xs uppercase tracking-wide">
            <tr>
              {(
                [
                  ["userName", "User"],
                  ["productName", "Activity"],
                  ["createdAt", "Date"],
                  ["status", "Status"],
                ] as [SortKey, string][]
              ).map(([key, label]) => (
                <th key={key} className="text-left px-4 py-2.5 font-semibold">
                  <button onClick={() => toggleSort(key)}>
                    {label}
                    {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </th>
              ))}
              <th className="text-right px-4 py-2.5 font-semibold">Commission</th>
            </tr>
          </thead>
          <tbody>
            {filteredAttributions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-sm text-muted-foreground">
                  No attributions match this filter.
                </td>
              </tr>
            ) : (
              filteredAttributions.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-4 py-2.5 text-foreground">{r.userName}</td>
                  <td className="px-4 py-2.5 text-foreground">{r.productName ?? "—"}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2.5 text-foreground capitalize">{r.status}</td>
                  <td className="px-4 py-2.5 text-right font-[family-name:var(--font-mono)] text-foreground">
                    RM {r.commissionAmount.toFixed(2)}
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
