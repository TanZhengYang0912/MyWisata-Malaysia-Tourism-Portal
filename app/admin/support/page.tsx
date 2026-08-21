"use client";

// P4 — Member 4: extended per CLAUDE.md Step 9, then CLAUDE-FIXES.md Fix 2
// (reply thread, working Resolve button, notification-deep-link support via
// ?ticket=). Reads from the new /api/admin/tickets* + /api/support/tickets/*
// routes rather than identity.ts::getSupportTickets() (that function's
// `category` field is stale — see Step 8's note).

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, FileText, MessageSquare, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { TicketThread, type ReplyMessage, type TranscriptMessage } from "@/components/shared/ticket-thread";
import { ReportChatButton } from "@/components/shared/report-chat-button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { ModerationFlagsPanel } from "@/components/admin/moderation-flags-panel";
import { useTranslation } from "react-i18next";
import { useSpeechInput, resolveRecognitionLangFromLocale, type SpeechInputErrorKind } from "@/hooks/use-speech-input";

// CLAUDE-VOICE-INPUT.md, mounted on the admin ticket reply composer too.
const SPEECH_ERROR_TEXT: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "Microphone access needed",
  "no-speech": "Didn't catch that — try again",
  network: "Voice input needs a connection",
  unknown: "Voice input isn't available right now",
};

interface AdminTicket {
  id: string;
  userId: string | null;
  userName: string;
  sessionId: string | null;
  subject: string;
  body: string;
  category: string;
  classificationMethod: "ai" | "keyword" | "manual" | null;
  status: "open" | "in_progress" | "resolved" | "closed";
  assignedTo: string | null;
  createdAt: string;
  resolvedAt: string | null;
  lastActivityAt: string;
  unread: boolean;
  unanswered: boolean;
  firstAdminReplyAt: string | null;
}

interface QueueStats {
  open: number;
  inProgress: number;
  resolved: number;
  unanswered: number;
  avgFirstResponseHours: number | null;
}

type SortKey = "default" | "created" | "lastActivity" | "status" | "category" | "unread";

const SORT_LABEL: Record<SortKey, string> = {
  default: "ui.support.sort.oldestUnanswered",
  created: "ui.support.sort.dateCreated",
  lastActivity: "ui.support.sort.lastActivity",
  status: "ui.support.sort.status",
  category: "ui.support.sort.category",
  unread: "ui.support.sort.unreadFirst",
};

interface TicketDetail {
  id: string;
  userId: string | null;
  subject: string;
  body: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  transcript: TranscriptMessage[];
  replies: ReplyMessage[];
}

const CATEGORIES = ["booking", "payment", "vendor", "withdrawal", "affiliate", "general"] as const;
const STATUSES = ["open", "in_progress", "resolved"] as const;
const TICKETS_PER_PAGE = 10;

const STATUS_LABEL: Record<string, string> = {
  open: "ui.support.status.open",
  in_progress: "ui.support.status.inProgress",
  resolved: "ui.support.status.resolved",
  closed: "ui.support.status.closed",
};

function AdminSupportContent() {
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const { t, i18n } = useTranslation("admin");
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedToMeFilter, setAssignedToMeFilter] = useState(false);
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [ticketPage, setTicketPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const speech = useSpeechInput({ lang: resolveRecognitionLangFromLocale(i18n.resolvedLanguage), onTranscriptChange: setReply });
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  async function loadTickets() {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (assignedToMeFilter) params.set("assignedToMe", "true");
    if (unreadOnlyFilter) params.set("unreadOnly", "true");
    try {
      const res = await fetch(`/api/admin/tickets?${params.toString()}`);
      const result = (await res.json()) as { data: { tickets: AdminTicket[]; stats: QueueStats } | null };
      setTickets(res.ok && result.data ? result.data.tickets : []);
      setStats(res.ok && result.data ? result.data.stats : null);
    } catch {
      setTickets([]);
      setStats(null);
    }
  }

  useEffect(() => {
    (async () => {
      await loadTickets();
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter, assignedToMeFilter, unreadOnlyFilter]);

  // Default queue ordering: unanswered tickets first (oldest waiting first
  // within that group) — "that's the real work queue" (CLAUDE-FIXES-2.md
  // item 3). Every other sort option is a plain single-key comparator.
  const sortedTickets = tickets
    ? [...tickets].sort((a, b) => {
        if (sortKey === "default") {
          if (a.unanswered !== b.unanswered) return a.unanswered ? -1 : 1;
          return a.createdAt < b.createdAt ? -1 : 1;
        }
        if (sortKey === "created") return a.createdAt < b.createdAt ? 1 : -1;
        if (sortKey === "lastActivity") return a.lastActivityAt < b.lastActivityAt ? 1 : -1;
        if (sortKey === "status") return a.status.localeCompare(b.status);
        if (sortKey === "category") return a.category.localeCompare(b.category);
        // unread
        if (a.unread !== b.unread) return a.unread ? -1 : 1;
        return a.createdAt < b.createdAt ? 1 : -1;
      })
    : [];
  const totalTicketPages = Math.max(1, Math.ceil(sortedTickets.length / TICKETS_PER_PAGE));
  const visibleTickets = sortedTickets.slice(
    (ticketPage - 1) * TICKETS_PER_PAGE,
    ticketPage * TICKETS_PER_PAGE,
  );

  async function loadDetail(id: string) {
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const result = (await res.json()) as { data: TicketDetail | null };
      setDetail(res.ok && result.data ? result.data : null);
    } catch {
      setDetail(null);
    }
  }

  function openTicket(id: string) {
    setOpenTicketId(id);
  }

  // Notification deep-link: /admin/support?ticket=<id> opens straight to
  // that ticket's dialog (CLAUDE-FIXES.md Fix 2: "deep-link each
  // notification"). Genuinely synchronizing local state to an external
  // source (the URL) that can change over the component's lifetime — the
  // textbook case for an effect, not something an IIFE can defer past since
  // there's no async operation here at all.
  useEffect(() => {
    const ticketId = searchParams.get("ticket");
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (ticketId) setOpenTicketId(ticketId);
  }, [searchParams]);

  // Fetches whenever the open ticket changes, regardless of whether it was
  // opened by a click or by the deep-link effect above — this is the single
  // place that triggers the actual data load, matching the repo's IIFE
  // pattern for effect-driven async fetches (see CLAUDE.md's coding
  // standards note on react-hooks/set-state-in-effect).
  useEffect(() => {
    if (!openTicketId) return;
    (async () => {
      await loadDetail(openTicketId);
      // Marks read on actually opening the dialog (CLAUDE-FIXES-2.md item 1).
      await fetch(`/api/support/tickets/${openTicketId}/read`, { method: "PATCH" });
      setTickets((prev) => prev?.map((t) => (t.id === openTicketId ? { ...t, unread: false } : t)) ?? null);
    })();
  }, [openTicketId]);

  async function updateStatus(id: string, status: string) {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/admin/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("ui.support.errors.updateStatus")); return; }
      setTickets((prev) => prev?.map((t) => (t.id === id ? { ...t, status: status as AdminTicket["status"] } : t)) ?? null);
      if (detail?.id === id) setDetail((d) => (d ? { ...d, status: status as TicketDetail["status"] } : d));
      showFeedback("success", t("ui.support.ticketMarked", { status: t(STATUS_LABEL[status] ?? "ui.support.status.unknown") }));
    } catch {
      showFeedback("error", t("ui.support.errors.updateStatusTryAgain"));
    } finally {
      setUpdatingId(null);
    }
  }

  // Manual category override — "AI classification is a helper, not an
  // authority" (CLAUDE-FIXES-2.md item 6).
  async function updateCategory(id: string, category: string) {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      const response = await fetch(`/api/admin/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category }),
      });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("ui.support.errors.updateCategory")); return; }
      setTickets((prev) => prev?.map((t) => (t.id === id ? { ...t, category, classificationMethod: "manual" } : t)) ?? null);
      showFeedback("success", t("ui.support.categoryUpdated"));
    } catch {
      showFeedback("error", t("ui.support.errors.updateCategoryTryAgain"));
    } finally {
      setUpdatingId(null);
    }
  }

  async function applyBatch(action: "resolved") {
    if (batchBusy) return;
    const selected = visibleTickets.filter((ticket) => selectedIds.has(ticket.id) && ticket.status !== "resolved");
    if (!selected.length) return;
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((ticket) => fetch(`/api/admin/tickets/${ticket.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: action }),
      })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? t("ui.support.errors.batchUpdate"));
      }
      setTickets((previous) => previous?.map((ticket) => selected.some((item) => item.id === ticket.id) ? { ...ticket, status: "resolved" } : ticket) ?? null);
      setSelectedIds(new Set());
      showFeedback("success", t("ui.support.batchResolved", { count: selected.length }));
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("ui.support.errors.batchUpdateFailed"));
    } finally {
      setBatchBusy(false);
    }
  }

  async function sendReply() {
    if (pendingFile) return sendAttachment();
    const text = reply.trim();
    if (!text || sending || !openTicketId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${openTicketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("ui.support.errors.sendReply")); return; }
      setReply("");
      showFeedback("success", t("ui.support.replySent"));
      await loadDetail(openTicketId);
      await loadTickets();
    } catch {
      showFeedback("error", t("ui.support.errors.sendReplyTryAgain"));
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setPendingFile(file);
  }

  async function sendAttachment() {
    if (!pendingFile || uploading || !openTicketId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      if (reply.trim()) formData.append("caption", reply.trim());
      const res = await fetch(`/api/support/tickets/${openTicketId}/attachments`, { method: "POST", body: formData });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("ui.support.errors.sendReply")); return; }
      setReply("");
      setPendingFile(null);
      showFeedback("success", t("ui.support.replySent"));
      await loadDetail(openTicketId);
      await loadTickets();
    } catch {
      showFeedback("error", t("ui.support.errors.sendReplyTryAgain"));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="min-h-full bg-background px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl mb-4">{t("ui.support.title")}</h1>

      <ModerationFlagsPanel />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: t("ui.support.status.open"), value: stats.open, alert: false },
            { label: t("ui.support.status.inProgress"), value: stats.inProgress, alert: false },
            { label: t("ui.support.status.resolved"), value: stats.resolved, alert: false },
            { label: t("ui.support.unanswered"), value: stats.unanswered, alert: stats.unanswered > 0 },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-sm font-semibold text-muted-foreground">{card.label}</p>
              <p className={`mt-4 text-3xl font-bold tracking-[-0.05em] ${card.alert ? "text-destructive" : "text-foreground"}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}
      {stats?.avgFirstResponseHours !== null && stats?.avgFirstResponseHours !== undefined && (
        <p className="text-xs text-muted-foreground mb-4">
          {t("ui.support.averageFirstResponse")}: {stats.avgFirstResponseHours < 1
            ? t("ui.support.minutes", { count: Math.round(stats.avgFirstResponseHours * 60) })
            : t("ui.support.hours", { count: stats.avgFirstResponseHours.toFixed(1) })}
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={assignedToMeFilter} onChange={(e) => { setAssignedToMeFilter(e.target.checked); setTicketPage(1); }} />
            {t("ui.support.assignedToMe")}
          </label>
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={unreadOnlyFilter} onChange={(e) => { setUnreadOnlyFilter(e.target.checked); setTicketPage(1); }} />
            {t("ui.support.unreadOnly")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value as SortKey); setTicketPage(1); }}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>{t(SORT_LABEL[k])}</option>
            ))}
          </select>
          <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setTicketPage(1); }}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder={t("ui.support.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.support.allCategories")}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setTicketPage(1); }}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder={t("ui.support.statusLabel")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.support.allStatuses")}</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{t(STATUS_LABEL[s])}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tickets === null ? (
        <p className="text-sm text-muted-foreground">{t("ui.states.loadingEllipsis")}</p>
      ) : tickets.length === 0 ? (
        <EmptyState title={t("ui.support.empty")} />
      ) : (
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <div className="flex items-center gap-2 border-b border-border px-6 py-3 text-xs"><input type="checkbox" aria-label={t("ui.support.selectAllVisible")} checked={visibleTickets.length > 0 && visibleTickets.every((ticket) => selectedIds.has(ticket.id))} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); visibleTickets.forEach((ticket) => event.target.checked ? next.add(ticket.id) : next.delete(ticket.id)); return next; })} /><span className="text-muted-foreground">{t("ui.batch.selectAllOnPage")}</span></div>
          <AdminBatchActionBar selectedCount={visibleTickets.filter((ticket) => selectedIds.has(ticket.id)).length} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as "resolved")} actions={[{ value: "resolved", label: t("ui.support.markResolved") }]} busy={batchBusy} />
          <div className="divide-y divide-border">
            {visibleTickets.map((ticket) => (
              <div key={ticket.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <input type="checkbox" aria-label={t("ui.support.selectTicket", { subject: ticket.subject })} checked={selectedIds.has(ticket.id)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(ticket.id) : next.delete(ticket.id); return next; })} />
                <button onClick={() => openTicket(ticket.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-muted-foreground shrink-0" /> {ticket.subject}
                    {ticket.unread && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.category}
                    {ticket.classificationMethod && (
                      <span className="text-[0.5625rem] uppercase tracking-wide opacity-70"> ({ticket.classificationMethod})</span>
                    )}
                    {" "}{t("ui.support.fromUser", { user: ticket.userName })} · {new Date(ticket.createdAt).toLocaleDateString()}
                    {ticket.unanswered && <span className="text-destructive font-medium"> · {t("ui.support.unansweredLower")}</span>}
                  </p>
                </button>
                <select
                  value={ticket.category}
                  disabled={updatingId === ticket.id}
                  onChange={(e) => updateCategory(ticket.id, e.target.value)}
                  className="text-xs rounded-full px-3 py-1.5 border border-border bg-background text-foreground shrink-0"
                  title={t("ui.support.overrideCategory")}
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={ticket.status}
                  disabled={updatingId === ticket.id}
                  onChange={(e) => updateStatus(ticket.id, e.target.value)}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 border border-border bg-background text-foreground shrink-0"
                >
                  {STATUSES.map((s) => (
                  <option key={s} value={s}>{t(STATUS_LABEL[s])}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {sortedTickets.length > 0 && (
            <nav aria-label={t("ui.support.pagination")} className="flex flex-col gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>{t("ui.support.range", { first: (ticketPage - 1) * TICKETS_PER_PAGE + 1, last: Math.min(ticketPage * TICKETS_PER_PAGE, sortedTickets.length), total: sortedTickets.length })}</span>
              {totalTicketPages > 1 && <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label={t("ui.pagination.previousPage")}
                  onClick={() => setTicketPage((page) => Math.max(1, page - 1))}
                  disabled={ticketPage === 1}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} /> {t("ui.pagination.previous")}
                </button>
                <span className="min-w-20 text-center font-semibold text-foreground">{t("ui.pagination.pageOf", { page: ticketPage, total: totalTicketPages })}</span>
                <button
                  type="button"
                  aria-label={t("ui.pagination.nextPage")}
                  onClick={() => setTicketPage((page) => Math.min(totalTicketPages, page + 1))}
                  disabled={ticketPage === totalTicketPages}
                  className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2.5 font-semibold text-foreground transition hover:border-primary/30 hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {t("ui.pagination.next")} <ChevronRight size={14} />
                </button>
              </div>}
            </nav>
          )}
        </div>
      )}

      <Dialog
        open={!!openTicketId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenTicketId(null);
            setDetail(null);
            setReply("");
            setPendingFile(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle>{detail?.subject}</DialogTitle>
              <div className="flex items-center gap-2">
                {detail && openTicketId && <ReportChatButton chatType="user_admin" threadId={openTicketId} />}
                {detail && detail.status !== "resolved" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={updatingId === openTicketId}
                    onClick={() => openTicketId && updateStatus(openTicketId, "resolved")}
                  >
                    {t("ui.support.markResolved")}
                  </Button>
                )}
              </div>
            </div>
          </DialogHeader>

          {!detail || detail.id !== openTicketId || !currentUser ? (
            <p className="text-sm text-muted-foreground">{t("ui.states.loadingEllipsis")}</p>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto">
                <TicketThread
                  ticketId={openTicketId ?? undefined}
                  currentUserId={currentUser.id}
                  ticketOwnerId={detail.userId}
                  ticketBody={detail.body}
                  ticketCreatedAt={detail.createdAt}
                  transcript={detail.transcript}
                  replies={detail.replies}
                />
              </div>

              <div className="pt-2 border-t border-border">
                {speech.error && <p className="mb-1.5 text-xs text-destructive">{SPEECH_ERROR_TEXT[speech.error]}</p>}
                {pendingFile && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs">
                    <FileText size={16} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
                    <button type="button" onClick={() => setPendingFile(null)} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("ui.support.removeAttachment")}>
                      <X size={13} />
                    </button>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={handleFileSelected} className="hidden" />
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                    aria-label={t("ui.support.attachFile")}
                  >
                    <Paperclip size={14} />
                  </button>
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") sendReply();
                    }}
                    placeholder={pendingFile ? t("ui.support.addCaption") : t("ui.support.replyPlaceholder")}
                    className="flex-1 min-w-0 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
                    disabled={sending || uploading}
                  />
                  {speech.isSupported && (
                    <button
                      type="button"
                      onClick={() => (speech.isListening ? speech.stop() : speech.start())}
                      disabled={sending || uploading}
                      aria-label={speech.isListening ? "Stop listening" : "Speak your reply"}
                      title={speech.isListening ? "Stop listening" : "Speak your reply"}
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        speech.isListening
                          ? "border-destructive bg-destructive/10 text-destructive animate-pulse"
                          : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground"
                      }`}
                    >
                      {speech.isListening ? <MicOff size={15} /> : <Mic size={15} />}
                    </button>
                  )}
                  <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={sendReply} disabled={sending || uploading || (!reply.trim() && !pendingFile)}>
                    <Send size={14} />
                  </Button>
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense>
      <AdminSupportContent />
    </Suspense>
  );
}
