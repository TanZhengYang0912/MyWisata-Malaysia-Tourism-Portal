"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Clipboard, Download, FileBarChart2, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { csvRow } from "@/lib/admin/csv";

type ReportDetail = { user_id: string; user_email: string; date: string; source: string; request_count: number; amount_rm: number; payout_fees_rm: number };
type Report = { report_id: string; period_start: string; period_end: string; summary: Record<string, number> & { details?: ReportDetail[] } };

function currentMalaysiaMonth() { const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date()); const year = parts.find((part) => part.type === "year")?.value; const month = parts.find((part) => part.type === "month")?.value; return year && month ? `${year}-${month}` : ""; }
function monthLabel(period: string) { return new Intl.DateTimeFormat("en-MY", { month: "long", year: "numeric" }).format(new Date(`${period}-01T12:00:00`)); }
function dateLabel(value: string) { return new Intl.DateTimeFormat("en-MY", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(`${value}T12:00:00+08:00`)); }
function amount(value: unknown) { return Number(value ?? 0).toLocaleString("en-MY", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

const amountMetrics = [["amount_requested_rm", "Requested RM"], ["amount_approved_rm", "Approved RM"], ["amount_paid_rm", "Paid RM"], ["pending_withdrawal_amount_rm", "Pending withdrawal RM"], ["pending_earnings_amount_rm", "Pending earnings RM"], ["reserved_amount_rm", "Reserved RM"], ["available_amount_rm", "Available RM"], ["amount_failed_rm", "Failed RM"], ["amount_withdrawn_rm", "Withdrawn RM"], ["payout_fees_rm", "Payout fees RM"]] as const;

export default function PayoutReportsPage() {
  const { showFeedback } = useActionFeedback();
  const [period, setPeriod] = useState(currentMalaysiaMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [source, setSource] = useState("");

  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/admin/reports/payouts?period=${period}`, { cache: "no-store" }); const body = await response.json() as { data?: Report; error?: { message?: string } }; if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load payout report"); setReport(body.data); }
    catch (err) { setError(err instanceof Error ? err.message : "Unable to load payout report"); }
    finally { setLoading(false); }
  }

  function downloadCsv() {
    if (!report) return;
    const rows = [csvRow(["section", "date_or_metric", "user_or_source", "source_or_value", "count", "amount_rm", "payout_fees_rm"]), ...Object.entries(report.summary).filter(([key]) => key !== "details").map(([key, value]) => csvRow(["summary", key, "", "", "", value, ""])), ...(report.summary.details ?? []).map((detail) => csvRow(["detail", detail.date, detail.user_email, detail.source, detail.request_count, detail.amount_rm, detail.payout_fees_rm]))];
    const url = URL.createObjectURL(new Blob([`${rows.join("\n")}\n`], { type: "text/csv;charset=utf-8" })); const link = document.createElement("a"); link.href = url; link.download = `payout-report-${report.period_start.slice(0, 7)}.csv`; link.click(); URL.revokeObjectURL(url); showFeedback("success", "Payout report exported.");
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect, react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const details = report?.summary.details ?? [];
  const sources = useMemo(() => [...new Set(details.map((detail) => detail.source))].sort(), [details]);
  const filteredDetails = details.filter((detail) => !source || detail.source === source).filter((detail) => !search || `${detail.user_email} ${detail.user_id} ${detail.source}`.toLowerCase().includes(search.toLowerCase()));
  const totalRequests = Number(report?.summary.total_requested ?? 0);
  const statusTotal = Math.max(1, totalRequests);

  return <main className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
    <Link href="/admin/withdrawals" className="mb-5 inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={15} /> Back to withdrawals</Link>
    <header><div className="flex items-center gap-2 text-primary"><FileBarChart2 size={18} /><p className="text-xs font-semibold uppercase tracking-[0.18em]">Finance operations</p></div><h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">Payout reports</h1><p className="mt-1 max-w-2xl text-sm text-muted-foreground">Generate a monthly payout snapshot. All dates and totals use Asia/Kuala_Lumpur.</p></header>
    <section className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-end justify-between gap-4"><label className="text-sm"><span className="mb-1.5 block font-medium text-foreground">Report month</span><input type="month" value={period} onChange={(event) => setPeriod(event.target.value)} className="h-11 rounded-xl border border-border bg-background px-3 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></label><div className="flex flex-wrap gap-2"><Button onClick={() => void load()} disabled={loading || !period}><RefreshCw size={15} /> {loading ? "Generating…" : "Generate report"}</Button>{report && <Button variant="outline" onClick={downloadCsv}><Download size={15} /> Export CSV</Button>}</div></div></section>
    {error && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {report && <section className="mt-5 space-y-5"><div className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-border bg-card p-5"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Monthly snapshot</p><h2 className="mt-2 text-xl font-bold text-foreground">{monthLabel(period)}</h2><p className="mt-1 text-sm text-muted-foreground">{dateLabel(report.period_start)} – {dateLabel(report.period_end)} · Malaysia time</p></div><button type="button" onClick={() => { void navigator.clipboard.writeText(report.report_id); showFeedback("success", "Report ID copied."); }} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:bg-secondary"><Clipboard size={14} /> Copy report ID</button></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[["Requested", amount(report.summary.amount_requested_rm), "RM"], ["Pending", report.summary.pending_count ?? 0, "requests"], ["Approved", amount(report.summary.amount_approved_rm), "RM"], ["Paid", amount(report.summary.amount_paid_rm), "RM"]].map(([label, value, unit]) => <div key={label} className="rounded-2xl border border-border bg-card p-5"><p className="text-sm font-semibold text-muted-foreground">{label}</p><p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-foreground">{value}</p><p className="mt-1 text-xs font-medium text-muted-foreground">{unit} this month</p></div>)}</div>
      <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]"><div className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">Request status</h3><p className="mt-1 text-xs text-muted-foreground">A quick view of the monthly payout queue.</p></div><span className="text-xs text-muted-foreground">{totalRequests} total</span></div><div className="mt-5 space-y-3">{[["Pending", "pending_count", "bg-amber-500"], ["Completed", "total_completed", "bg-emerald-500"], ["Rejected", "total_rejected", "bg-red-500"], ["Failed", "total_failed", "bg-slate-400"]].map(([label, key, color]) => { const count = Number(report.summary[key] ?? 0); return <div key={key}><div className="flex justify-between text-xs"><span className="text-muted-foreground">{label}</span><span className="font-semibold text-foreground">{count}</span></div><div className="mt-1 h-2 overflow-hidden rounded-full bg-secondary"><div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(100, (count / statusTotal) * 100)}%` }} /></div></div>; })}</div></div><div className="rounded-2xl border border-border bg-card p-5"><h3 className="font-semibold text-foreground">Balance snapshot</h3><p className="mt-1 text-xs text-muted-foreground">Captured when this report was generated.</p><div className="mt-5 space-y-3">{[["Pending withdrawal", "pending_withdrawal_amount_rm"], ["Pending earnings", "pending_earnings_amount_rm"], ["Reserved", "reserved_amount_rm"], ["Available", "available_amount_rm"]].map(([label, key]) => <div key={key} className="flex items-center justify-between gap-3 border-b border-border pb-3"><span className="text-xs text-muted-foreground">{label}</span><span className="font-mono text-sm font-semibold text-foreground">RM {amount(report.summary[key])}</span></div>)}</div></div></div>
      <div className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-semibold text-foreground">Financial details</h3><p className="mt-1 text-xs text-muted-foreground">All amounts are shown in Malaysian ringgit.</p></div><p className="text-xs text-muted-foreground">Report ID: {report.report_id}</p></div><div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{amountMetrics.map(([key, label]) => <div key={key} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 font-mono text-lg font-bold text-foreground">RM {amount(report.summary[key])}</p></div>)}</div></div>
      <div className="rounded-2xl border border-border bg-card p-5"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-semibold text-foreground">Detail by user, date and source</h3><p className="mt-1 text-xs text-muted-foreground">{filteredDetails.length} of {details.length} detail rows</p></div><div className="flex flex-wrap gap-2"><div className="relative"><Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search user or source" className="h-10 w-56 rounded-xl border border-border bg-background pl-8 pr-3 text-xs" /></div><select aria-label="Filter by payout source" value={source} onChange={(event) => setSource(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-xs"><option value="">All sources</option>{sources.map((value) => <option key={value} value={value}>{value}</option>)}</select></div></div>{filteredDetails.length === 0 ? <p className="py-10 text-center text-sm text-muted-foreground">No payout detail matches the current filters.</p> : <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[720px] text-sm"><thead><tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground"><th className="py-3 pr-3">Date</th><th className="py-3 pr-3">User</th><th className="py-3 pr-3">Source</th><th className="py-3 pr-3">Requests</th><th className="py-3 pr-3">Amount</th><th className="py-3">Fees</th></tr></thead><tbody className="divide-y divide-border">{filteredDetails.map((detail) => <tr key={`${detail.date}-${detail.user_id}-${detail.source}`}><td className="py-3 pr-3 text-muted-foreground">{dateLabel(detail.date)}</td><td className="py-3 pr-3">{detail.user_email}</td><td className="py-3 pr-3">{detail.source}</td><td className="py-3 pr-3">{detail.request_count}</td><td className="py-3 pr-3 font-mono">RM {amount(detail.amount_rm)}</td><td className="py-3 font-mono">RM {amount(detail.payout_fees_rm)}</td></tr>)}</tbody></table></div>}</div>
    </section>}
  </main>;
}
