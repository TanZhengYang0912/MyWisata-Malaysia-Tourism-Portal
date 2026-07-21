"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type ReportDetail = { user_id: string; user_email: string; date: string; source: string; request_count: number; amount_rm: number; payout_fees_rm: number };
type Report = { report_id: string; period_start: string; period_end: string; summary: Record<string, number> & { details?: ReportDetail[] } };

function currentMalaysiaMonth() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit" }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  return year && month ? `${year}-${month}` : "";
}

export default function PayoutReportsPage() {
  const [period, setPeriod] = useState(currentMalaysiaMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  async function load() {
    setLoading(true); setError("");
    try { const response = await fetch(`/api/admin/reports/payouts?period=${period}`); const body = await response.json() as { data?: Report; error?: { message?: string } }; if (!response.ok || !body.data) throw new Error(body.error?.message ?? "Unable to load payout report"); setReport(body.data); }
    catch (e) { setError(e instanceof Error ? e.message : "Unable to load payout report"); }
    finally { setLoading(false); }
  }
  function downloadCsv() {
    if (!report) return;
    const summaryRows = Object.entries(report.summary)
      .filter(([key]) => key !== "details")
      .map(([key, value]) => `summary,${key},${value}`);
    const detailRows = (report.summary.details ?? []).map((detail) => `detail,${detail.date},${detail.user_email},${detail.source},${detail.request_count},${detail.amount_rm},${detail.payout_fees_rm}`);
    const csv = ["section,date_or_metric,user_or_source,source_or_value,count,amount_rm,payout_fees_rm", ...summaryRows.map((row) => `summary,${row.split(",").slice(1).join(",")},,,,`), ...detailRows].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `payout-report-${report.period_start.slice(0, 7)}.csv`;
    link.click(); URL.revokeObjectURL(url);
  }
  useEffect(() => { void load(); }, []);
  const value = (key: string) => Number(report?.summary[key] ?? 0).toLocaleString("en-MY", { minimumFractionDigits: key.includes("amount") ? 2 : 0, maximumFractionDigits: 2 });
  return <div className="p-6 sm:p-8 max-w-5xl"><Link href="/admin/withdrawals" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-5"><ArrowLeft size={15} /> Back to withdrawals</Link><h1 className="text-xl font-bold">Monthly payout reports</h1><p className="text-sm text-muted-foreground mt-1 mb-6">All dates and totals use Asia/Kuala_Lumpur.</p><div className="rounded-2xl border border-border bg-card p-5 flex flex-wrap items-end gap-3"><label className="text-sm"><span className="block text-muted-foreground mb-1">Report month</span><input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="rounded-xl border border-border bg-background px-3 py-2.5" /></label><Button onClick={() => void load()} disabled={loading}><RefreshCw size={15} className="mr-2" /> {loading ? "Generating…" : "Generate report"}</Button>{report && <Button variant="outline" onClick={downloadCsv}><Download size={15} className="mr-2" /> Export CSV</Button>}</div>{error && <p className="mt-4 text-sm text-destructive">{error}</p>}{report && <section className="rounded-2xl border border-border bg-card p-5 mt-5"><div className="flex justify-between items-start"><div><h2 className="font-semibold">{report.period_start} to {report.period_end}</h2><p className="text-xs text-muted-foreground mt-1">Report ID: {report.report_id}</p></div></div><div className="grid sm:grid-cols-3 gap-3 mt-5">{([['total_requested','Requests'],['pending_count','Pending'],['total_completed','Completed'],['total_rejected','Rejected'],['total_failed','Failed'],['high_risk_count','High risk']] as const).map(([key, label]) => <div key={key} className="rounded-xl bg-muted/40 p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold mt-1">{value(key)}</p></div>)}</div><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">{([['amount_requested_rm','Requested RM'],['amount_approved_rm','Approved RM'],['amount_paid_rm','Paid RM'],['amount_failed_rm','Failed RM'],['amount_reserved_rm','Reserved RM'],['amount_withdrawn_rm','Withdrawn RM'],['payout_fees_rm','Payout fees RM']] as const).map(([key, label]) => <div key={key} className="rounded-xl border border-border p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-mono font-bold mt-1">RM {value(key)}</p></div>)}</div><div className="mt-6"><h3 className="font-semibold">Detail by user, Malaysia date and source</h3><div className="overflow-x-auto mt-3"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-muted-foreground border-b border-border"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">User</th><th className="py-2 pr-3">Source</th><th className="py-2 pr-3">Requests</th><th className="py-2 pr-3">Amount</th><th className="py-2">Fees</th></tr></thead><tbody>{(report.summary.details ?? []).map((detail) => <tr key={`${detail.date}-${detail.user_id}-${detail.source}`} className="border-b border-border/60"><td className="py-2 pr-3">{detail.date}</td><td className="py-2 pr-3">{detail.user_email}</td><td className="py-2 pr-3">{detail.source}</td><td className="py-2 pr-3">{detail.request_count}</td><td className="py-2 pr-3 font-mono">RM {Number(detail.amount_rm).toFixed(2)}</td><td className="py-2 font-mono">RM {Number(detail.payout_fees_rm).toFixed(2)}</td></tr>)}</tbody></table>{(report.summary.details ?? []).length === 0 && <p className="text-sm text-muted-foreground py-4">No withdrawal detail for this period.</p>}</div></div></section>}</div>;
}
