"use client";

import { useEffect, useMemo, useState } from "react";
import { Flag, Search } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { EmptyState } from "@/components/shared/empty-state";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AdminSegmentedFilter } from "@/components/admin/segmented-filter";
import { Textarea } from "@/components/ui/textarea";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { getMessages } from "@/backend/domains/identity";
import type { ChatMessage } from "@/backend/core/types";

interface ChatReport {
  id: string;
  thread_id: string;
  reporter_id: string;
  reason: string;
  details: string | null;
  status: "open" | "resolved" | "dismissed";
  resolution_reason: string | null;
  resolution_note: string | null;
  resolved_at: string | null;
  created_at: string;
  reporter: { full_name: string | null; email: string } | null;
  chat_threads: {
    customer_id: string;
    created_at: string;
    customer: { full_name: string | null; email: string } | null;
    outlets: { name: string } | null;
  } | null;
  reporterStats: { total: number; dismissed: number };
  sameThreadReportCount: number;
  reporterBannedUntil: string | null;
}

const REASON_LABEL: Record<string, string> = { scam: "Scam", abuse: "Abuse", spam: "Spam", other: "Other" };
const RESOLUTION_REASONS = [
  { value: "action_taken", label: "Action taken" },
  { value: "no_violation", label: "No violation found" },
  { value: "insufficient_evidence", label: "Insufficient evidence" },
  { value: "spam_abuse", label: "Reporter spam/abuse" },
];
const RESOLUTION_REASON_LABEL: Record<string, string> = Object.fromEntries(RESOLUTION_REASONS.map((r) => [r.value, r.label]));

type StatusTab = "open" | "closed";
type ReasonFilter = "all" | "scam" | "abuse" | "spam" | "other";
type ClosedStatusFilter = "all" | "resolved" | "dismissed";
type SortKey = "newest" | "oldest" | "reason";

export default function AdminChatReportsPage() {
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [reports, setReports] = useState<ChatReport[] | null>(null);
  const [statusTab, setStatusTab] = useState<StatusTab>("open");
  const [closedStatusFilter, setClosedStatusFilter] = useState<ClosedStatusFilter>("all");
  const [reasonFilter, setReasonFilter] = useState<ReasonFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [query, setQuery] = useState("");

  const [viewReport, setViewReport] = useState<ChatReport | null>(null);
  const [threadMessages, setThreadMessages] = useState<ChatMessage[] | null>(null);

  const [resolveTarget, setResolveTarget] = useState<{ report: ChatReport; action: "resolved" | "dismissed" } | null>(null);
  const [resolveReason, setResolveReason] = useState(RESOLUTION_REASONS[0].value);
  const [resolveNote, setResolveNote] = useState("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [blockingReporterId, setBlockingReporterId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const [archiveDays, setArchiveDays] = useState<number | null>(null);
  const [archiveDaysInput, setArchiveDaysInput] = useState("");
  const [savingArchiveDays, setSavingArchiveDays] = useState(false);

  useEffect(() => {
    fetch("/api/admin/chat-settings")
      .then((res) => res.json())
      .then((result) => {
        if (typeof result?.data?.archiveDays === "number") {
          setArchiveDays(result.data.archiveDays);
          setArchiveDaysInput(String(result.data.archiveDays));
        }
      })
      .catch(() => {});
  }, []);

  async function saveArchiveDays() {
    const days = Number(archiveDaysInput);
    if (!Number.isFinite(days) || days < 1 || savingArchiveDays) return;
    setSavingArchiveDays(true);
    try {
      const response = await fetch("/api/admin/chat-settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ archiveDays: days }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        showFeedback("error", payload?.error?.message ?? "Could not save setting.");
        return;
      }
      setArchiveDays(payload.data.archiveDays);
      showFeedback("success", "Archive threshold updated.");
    } catch {
      showFeedback("error", "Could not save setting. Please try again.");
    } finally {
      setSavingArchiveDays(false);
    }
  }

  async function loadReports() {
    try {
      const res = await fetch("/api/admin/chat-reports");
      const result = (await res.json()) as { data: ChatReport[] | null };
      setReports(res.ok && result.data ? result.data : []);
    } catch {
      setReports([]);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadReports();
  }, []);

  useEffect(() => {
    if (!viewReport) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThreadMessages(null);
    getMessages(viewReport.thread_id).then(setThreadMessages).catch(() => setThreadMessages([]));
  }, [viewReport]);

  const filtered = useMemo(() => {
    if (!reports) return [];
    const normalizedQuery = query.trim().toLowerCase();
    return reports
      .filter((r) => (statusTab === "open" ? r.status === "open" : r.status !== "open"))
      .filter((r) => statusTab === "open" || closedStatusFilter === "all" || r.status === closedStatusFilter)
      .filter((r) => reasonFilter === "all" || r.reason === reasonFilter)
      .filter((r) => {
        if (!normalizedQuery) return true;
        const searchable = [r.chat_threads?.outlets?.name, r.reporter?.full_name, r.reporter?.email, r.details]
          .filter(Boolean).join(" ").toLowerCase();
        return searchable.includes(normalizedQuery);
      })
      .sort((a, b) => {
        if (sortKey === "newest") return b.created_at.localeCompare(a.created_at);
        if (sortKey === "oldest") return a.created_at.localeCompare(b.created_at);
        return a.reason.localeCompare(b.reason);
      });
  }, [reports, statusTab, closedStatusFilter, reasonFilter, query, sortKey]);

  const openCount = reports?.filter((r) => r.status === "open").length ?? 0;
  const closedCount = reports ? reports.length - openCount : 0;

  function startResolve(report: ChatReport, action: "resolved" | "dismissed") {
    setResolveTarget({ report, action });
    setResolveReason(RESOLUTION_REASONS[0].value);
    setResolveNote("");
  }

  async function confirmResolve() {
    if (!resolveTarget || updatingId) return;
    const { report, action } = resolveTarget;
    setUpdatingId(report.id);
    try {
      const response = await fetch(`/api/admin/chat-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action, resolution_reason: resolveReason, resolution_note: resolveNote }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        showFeedback("error", body?.error?.message ?? "Could not update report.");
        return;
      }
      setReports((prev) => prev?.map((r) => (
        r.id === report.id ? { ...r, status: action, resolution_reason: resolveReason, resolution_note: resolveNote.trim() || null } : r
      )) ?? null);
      showFeedback("success", `Report marked ${action}.`);
      setResolveTarget(null);
      // Acting from inside the view dialog leaves it showing a now-stale "open"
      // status/actions — close it too so the admin returns to the refreshed list.
      setViewReport(null);
      setThreadMessages(null);
    } catch {
      showFeedback("error", "Could not update report. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function applyBatch(action: "resolved" | "dismissed") {
    if (batchBusy) return;
    const selected = filtered.filter((report) => selectedIds.has(report.id) && report.status === "open");
    if (!selected.length) return;
    const enteredReason = window.prompt(`Resolution reason (${RESOLUTION_REASONS.map((reason) => reason.value).join(", ")}):`, RESOLUTION_REASONS[0].value)?.trim();
    if (!enteredReason || !RESOLUTION_REASONS.some((reason) => reason.value === enteredReason)) {
      showFeedback("error", "Choose a valid resolution reason.");
      return;
    }
    const note = window.prompt("Resolution note (optional):", "")?.trim() ?? "";
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((report) => fetch(`/api/admin/chat-reports/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action, resolution_reason: enteredReason, resolution_note: note }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? "One or more reports could not be updated.");
      }
      setReports((previous) => previous?.map((report) => selected.some((item) => item.id === report.id) ? { ...report, status: action, resolution_reason: enteredReason, resolution_note: note || null } : report) ?? null);
      setSelectedIds(new Set());
      showFeedback("success", `${selected.length} reports marked ${action}.`);
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : "Batch report update failed.");
    } finally {
      setBatchBusy(false);
    }
  }

  // A ban applies to the reporter across every report they've filed, not just
  // the one open in the dialog — update every matching row in the list plus
  // whichever report (if any) is currently open.
  function applyBanUpdate(reporterId: string, bannedUntil: string | null) {
    setReports((prev) => prev?.map((r) => (r.reporter_id === reporterId ? { ...r, reporterBannedUntil: bannedUntil } : r)) ?? null);
    setViewReport((prev) => (prev && prev.reporter_id === reporterId ? { ...prev, reporterBannedUntil: bannedUntil } : prev));
  }

  async function blockReporter(reporterId: string, days: number) {
    if (blockingReporterId) return;
    setBlockingReporterId(reporterId);
    try {
      const response = await fetch(`/api/admin/report-bans/${reporterId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        showFeedback("error", payload?.error?.message ?? "Could not block reporter.");
        return;
      }
      applyBanUpdate(reporterId, payload.data.banned_until);
      showFeedback("success", `Reporter blocked from reporting for ${days} days.`);
    } catch {
      showFeedback("error", "Could not block reporter. Please try again.");
    } finally {
      setBlockingReporterId(null);
    }
  }

  async function unblockReporter(reporterId: string) {
    if (blockingReporterId) return;
    setBlockingReporterId(reporterId);
    try {
      const response = await fetch(`/api/admin/report-bans/${reporterId}`, { method: "DELETE" });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        showFeedback("error", body?.error?.message ?? "Could not unblock reporter.");
        return;
      }
      applyBanUpdate(reporterId, null);
      showFeedback("success", "Reporter unblocked.");
    } catch {
      showFeedback("error", "Could not unblock reporter. Please try again.");
    } finally {
      setBlockingReporterId(null);
    }
  }

  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl mb-4 flex items-center gap-2"><Flag size={18} /> Chat Reports</h1>

      {archiveDays !== null && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl bg-card px-4 py-3 text-xs" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <span className="text-muted-foreground">Auto-archive open chats after</span>
          <input
            type="number"
            min={1}
            max={3650}
            value={archiveDaysInput}
            onChange={(e) => setArchiveDaysInput(e.target.value)}
            className="h-7 w-16 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          />
          <span className="text-muted-foreground">days of inactivity</span>
          <Button size="sm" variant="outline" disabled={savingArchiveDays || Number(archiveDaysInput) === archiveDays} onClick={saveArchiveDays}>
            {savingArchiveDays ? "Saving…" : "Save"}
          </Button>
        </div>
      )}

      <div className="mb-4">
        <AdminSegmentedFilter
          value={statusTab}
          ariaLabel="Chat report status"
          items={[{ value: "open", label: "Pending", count: openCount }, { value: "closed", label: "Resolved", count: closedCount }]}
          onChange={(value) => setStatusTab(value as StatusTab)}
        />
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="relative w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search outlet, reporter, details…"
            className="h-8 w-full rounded-lg border border-border pl-8 pr-2 text-xs bg-background text-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="reason">Reason</option>
          </select>
          {statusTab === "closed" && (
            <Select value={closedStatusFilter} onValueChange={(v) => setClosedStatusFilter(v as ClosedStatusFilter)}>
              <SelectTrigger className="w-32">
                <SelectValue placeholder="Outcome" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Resolved + dismissed</SelectItem>
                <SelectItem value="resolved">Resolved only</SelectItem>
                <SelectItem value="dismissed">Dismissed only</SelectItem>
              </SelectContent>
            </Select>
          )}
          <Select value={reasonFilter} onValueChange={(v) => setReasonFilter(v as ReasonFilter)}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Reason" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All reasons</SelectItem>
              {Object.entries(REASON_LABEL).map(([value, label]) => (
                <SelectItem key={value} value={value}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {reports === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <EmptyState title={statusTab === "open" ? "No pending reports" : "No resolved reports"} description="Reported conversations will show up here." />
      ) : (
        <div className="rounded-2xl overflow-hidden border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          {statusTab === "open" && <><div className="flex items-center gap-2 border-b border-border px-6 py-3 text-xs"><input type="checkbox" aria-label="Select all visible chat reports" checked={filtered.length > 0 && filtered.every((report) => selectedIds.has(report.id))} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); filtered.forEach((report) => event.target.checked ? next.add(report.id) : next.delete(report.id)); return next; })} /><span className="text-muted-foreground">Select all visible reports</span></div><AdminBatchActionBar selectedCount={filtered.filter((report) => selectedIds.has(report.id)).length} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as "resolved" | "dismissed")} actions={[{ value: "resolved", label: "Resolve" }, { value: "dismissed", label: "Dismiss" }]} busy={batchBusy} /></>}
          <div className="divide-y divide-border">
            {filtered.map((r) => {
              const outletName = r.chat_threads?.outlets?.name ?? "Unknown outlet";
              const reporterName = r.reporter?.full_name || r.reporter?.email || "Unknown";
              const isRepeatFalseReporter = r.reporterStats.total >= 3 && r.reporterStats.dismissed / r.reporterStats.total >= 0.5;
              return (
                <div key={r.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                  {/* eslint-disable-next-line @typescript-eslint/no-unused-expressions */}
                  {r.status === "open" && <input type="checkbox" aria-label={`Select chat report ${r.id}`} checked={selectedIds.has(r.id)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(r.id) : next.delete(r.id); return next; })} />}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-2 flex-wrap">
                      {REASON_LABEL[r.reason] ?? r.reason} · {outletName}
                      <StatusBadge status={r.status} />
                      {r.sameThreadReportCount > 1 && (
                        <Badge variant="outline" className="text-[10px]">{r.sameThreadReportCount} reports on this thread</Badge>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      Reported by {reporterName} · {new Date(r.created_at).toLocaleDateString()}
                      {isRepeatFalseReporter && (
                        <span className="ml-1.5 text-destructive font-medium">
                          · {r.reporterStats.dismissed}/{r.reporterStats.total} of their reports dismissed
                        </span>
                      )}
                    </p>
                    {r.details && <p className="text-xs text-muted-foreground mt-1 italic">&ldquo;{r.details}&rdquo;</p>}
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setViewReport(r)}>View</Button>
                  {r.status === "open" && (
                    <>
                      <Button size="sm" variant="outline" disabled={updatingId === r.id} onClick={() => startResolve(r, "dismissed")}>Dismiss</Button>
                      <Button size="sm" disabled={updatingId === r.id} onClick={() => startResolve(r, "resolved")}>Resolve</Button>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={!!viewReport} onOpenChange={(open) => { if (!open) { setViewReport(null); setThreadMessages(null); } }}>
        <DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-lg">
          <DialogHeader className="shrink-0">
            <DialogTitle>{viewReport?.chat_threads?.outlets?.name ?? "Report details"}</DialogTitle>
          </DialogHeader>
          {viewReport && (
            <div className="flex min-h-0 flex-1 flex-col gap-3 text-sm">
              <div className="shrink-0 space-y-3">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div><p className="text-muted-foreground">Reason</p><p className="font-semibold text-foreground">{REASON_LABEL[viewReport.reason] ?? viewReport.reason}</p></div>
                  <div><p className="text-muted-foreground">Status</p><StatusBadge status={viewReport.status} /></div>
                  <div>
                    <p className="text-muted-foreground">Reported by</p>
                    <p className="font-semibold text-foreground">
                      {viewReport.reporter?.full_name || viewReport.reporter?.email}{" "}
                      <span className="font-normal text-muted-foreground">
                        ({viewReport.reporter_id === viewReport.chat_threads?.customer_id ? "customer" : "vendor"})
                      </span>
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Participants</p>
                    <p className="font-semibold text-foreground">
                      {viewReport.chat_threads?.customer?.full_name || viewReport.chat_threads?.customer?.email || "Customer"}
                      {" ↔ "}
                      {viewReport.chat_threads?.outlets?.name ?? "Outlet"}
                    </p>
                  </div>
                  <div><p className="text-muted-foreground">Conversation started</p><p className="text-foreground">{viewReport.chat_threads?.created_at ? new Date(viewReport.chat_threads.created_at).toLocaleDateString() : "—"}</p></div>
                  <div><p className="text-muted-foreground">Reporter history</p><p className="text-foreground">{viewReport.reporterStats.total} reports, {viewReport.reporterStats.dismissed} dismissed</p></div>
                </div>
                <div className="flex items-center justify-between gap-2 rounded-lg bg-secondary p-2 text-xs">
                  {viewReport.reporterBannedUntil ? (
                    <>
                      <span className="text-foreground">Reporter blocked from reporting until {new Date(viewReport.reporterBannedUntil).toLocaleDateString()}</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={blockingReporterId === viewReport.reporter_id}
                        onClick={() => unblockReporter(viewReport.reporter_id)}
                      >
                        Unblock
                      </Button>
                    </>
                  ) : (
                    <>
                      <span className="text-muted-foreground">Block this reporter from filing new reports</span>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={blockingReporterId === viewReport.reporter_id}
                          onClick={() => blockReporter(viewReport.reporter_id, 7)}
                        >
                          7 days
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={blockingReporterId === viewReport.reporter_id}
                          onClick={() => blockReporter(viewReport.reporter_id, 30)}
                        >
                          30 days
                        </Button>
                      </div>
                    </>
                  )}
                </div>
                {viewReport.details && <p className="text-xs bg-secondary rounded-lg p-2 text-foreground">&ldquo;{viewReport.details}&rdquo;</p>}
                {viewReport.sameThreadReportCount > 1 && (
                  <p className="text-xs text-amber-700">This conversation has {viewReport.sameThreadReportCount} separate reports against it.</p>
                )}
                {viewReport.status !== "open" && (
                  <div className="rounded-lg bg-secondary p-2 text-xs">
                    <p className="font-semibold text-foreground">Resolution: {RESOLUTION_REASON_LABEL[viewReport.resolution_reason ?? ""] ?? viewReport.resolution_reason}</p>
                    {viewReport.resolution_note && <p className="text-muted-foreground mt-1">{viewReport.resolution_note}</p>}
                  </div>
                )}
              </div>
              <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border">
                {!threadMessages || !currentUser ? (
                  <p className="p-4 text-sm text-muted-foreground">Loading conversation…</p>
                ) : (
                  <ChatThreadPanel
                    threadId={viewReport.thread_id}
                    messages={threadMessages}
                    currentUserId={currentUser.id}
                    counterpart={{ name: viewReport.chat_threads?.outlets?.name ?? "Outlet" }}
                    readOnly
                  />
                )}
              </div>
              {viewReport.status === "open" && (
                <div className="flex shrink-0 gap-2">
                  <Button variant="outline" className="flex-1" disabled={updatingId === viewReport.id} onClick={() => startResolve(viewReport, "dismissed")}>Dismiss</Button>
                  <Button className="flex-1" disabled={updatingId === viewReport.id} onClick={() => startResolve(viewReport, "resolved")}>Resolve</Button>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!resolveTarget} onOpenChange={(open) => { if (!open) setResolveTarget(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{resolveTarget?.action === "resolved" ? "Resolve report" : "Dismiss report"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Reason</label>
              <Select value={resolveReason} onValueChange={setResolveReason}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {RESOLUTION_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">Note (optional)</label>
              <Textarea value={resolveNote} onChange={(e) => setResolveNote(e.target.value)} rows={3} placeholder="Add context for this decision…" />
            </div>
            <Button className="w-full" disabled={!!updatingId} onClick={confirmResolve}>
              {updatingId ? "Saving…" : `Confirm ${resolveTarget?.action === "resolved" ? "resolve" : "dismiss"}`}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
