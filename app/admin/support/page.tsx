"use client";

// P4 — Member 4: extended per CLAUDE.md Step 9, then CLAUDE-FIXES.md Fix 2
// (reply thread, working Resolve button, notification-deep-link support via
// ?ticket=). Reads from the new /api/admin/tickets* + /api/support/tickets/*
// routes rather than identity.ts::getSupportTickets() (that function's
// `category` field is stale — see Step 8's note).

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FileText, MessageSquare, Mic, MicOff, Paperclip, Send, X } from "lucide-react";
import { Pagination } from "@/components/shared/pagination";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { AdminMobileRecordCard } from "@/components/admin/admin-mobile-record-card";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { TicketThread, type ReplyMessage } from "@/components/shared/ticket-thread";
import { ReportChatButton } from "@/components/shared/report-chat-button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { ModerationFlagsPanel } from "@/components/admin/moderation-flags-panel";
import { useTranslation } from "react-i18next";
import { useSpeechInput, resolveRecognitionLangFromLocale, type SpeechInputErrorKind } from "@/hooks/use-speech-input";
import { TICKET_CATEGORIES } from "@/lib/chatbot/classify";
import { teamForCategory } from "@/lib/support/team-routing";
import { supportError } from "@/lib/support/errors";

// CLAUDE-VOICE-INPUT.md, mounted on the admin ticket reply composer too.
const SPEECH_ERROR_TEXT: Record<SpeechInputErrorKind, string> = {
  "permission-denied": "Microphone access needed",
  "no-speech": "Didn't catch that — try again",
  network: "Voice input needs a connection",
  unknown: "Voice input isn't available right now",
};

interface AdminTicket {
  id: string;
  userName: string | null;
  subject: string;
  category: string;
  classificationMethod: "ai" | "keyword" | "manual" | null;
  team: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  lastActivityAt: string;
  unread: boolean;
  unanswered: boolean;
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
  viewerIsOwner: boolean;
  subject: string;
  body: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  replies: ReplyMessage[];
  repliesCursor: { createdAt: string; id: string } | null;
}

const CATEGORIES = TICKET_CATEGORIES;
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
  const { t: tCommon } = useTranslation("common");
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalTicketPages, setTotalTicketPages] = useState(1);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedToMeFilter, setAssignedToMeFilter] = useState(false);
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [ticketPage, setTicketPage] = useState(1);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loadingEarlierRepliesFor, setLoadingEarlierRepliesFor] = useState<string | null>(null);
  const [earlierRepliesErrorFor, setEarlierRepliesErrorFor] = useState<string | null>(null);
  const earlierRepliesRequestFor = useRef<string | null>(null);
  const earlierRepliesController = useRef<AbortController | null>(null);
  const [reply, setReply] = useState("");
  const [replyOperationId, setReplyOperationId] = useState<string | null>(null);
  const speech = useSpeechInput({ lang: resolveRecognitionLangFromLocale(i18n.resolvedLanguage), onTranscriptChange: setReply });
  const [sending, setSending] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [attachmentOperationId, setAttachmentOperationId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  const loadTickets = useCallback(async (signal?: AbortSignal) => {
    const params = new URLSearchParams({ page: String(ticketPage), search: debouncedSearch, sort: sortKey });
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    if (assignedToMeFilter) params.set("assignedToMe", "true");
    if (unreadOnlyFilter) params.set("unreadOnly", "true");
    try {
      const res = await fetch(`/api/admin/tickets?${params.toString()}`, { cache: "no-store", signal });
      const result = (await res.json().catch(() => ({}))) as { data?: { tickets: AdminTicket[]; stats: QueueStats; total: number; totalPages: number; page: number } | null; error?: { message?: string } };
      if (!res.ok || !result.data) throw new Error(result.error?.message ?? t("ui.support.errors.loadTickets"));
      setTickets(result.data.tickets);
      setStats(result.data.stats);
      setTotalTickets(result.data.total);
      setTotalTicketPages(result.data.totalPages);
      setQueueError(null);
      if (result.data.page !== ticketPage) setTicketPage(result.data.page);
    } catch (error) {
      if (signal?.aborted) return;
      setQueueError(error instanceof Error ? error.message : t("ui.support.errors.loadTickets"));
    }
  }, [assignedToMeFilter, categoryFilter, debouncedSearch, sortKey, statusFilter, t, ticketPage, unreadOnlyFilter]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(searchQuery.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      await loadTickets(controller.signal);
    })();
    return () => controller.abort();
  }, [loadTickets]);

  const visibleTickets = tickets ?? [];

  async function loadDetail(id: string): Promise<TicketDetail | null> {
    earlierRepliesController.current?.abort();
    earlierRepliesController.current = null;
    earlierRepliesRequestFor.current = null;
    setLoadingEarlierRepliesFor(null);
    try {
      const res = await fetch(`/api/support/tickets/${id}`);
      const result = (await res.json()) as { data: TicketDetail | null };
      const loadedDetail = res.ok && result.data ? result.data : null;
      setDetail(loadedDetail);
      return loadedDetail;
    } catch {
      setDetail(null);
      return null;
    }
  }

  async function loadEarlierReplies(ticketId: string) {
    if (detail?.id !== ticketId || !detail.repliesCursor || loadingEarlierRepliesFor === ticketId || earlierRepliesRequestFor.current === ticketId) return;
    const cursor = detail.repliesCursor;
    earlierRepliesRequestFor.current = ticketId;
    const controller = new AbortController();
    earlierRepliesController.current = controller;
    setLoadingEarlierRepliesFor(ticketId);
    setEarlierRepliesErrorFor(null);
    try {
      const params = new URLSearchParams({ beforeCreatedAt: cursor.createdAt, beforeId: cursor.id });
      const response = await fetch(`/api/support/tickets/${ticketId}/replies?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      const result = await response.json().catch(() => ({})) as { data?: { replies?: ReplyMessage[]; nextCursor?: TicketDetail["repliesCursor"] } };
      if (!response.ok || !result.data || !Array.isArray(result.data.replies)) throw new Error("support_replies_unavailable");
      const olderReplies = result.data.replies;
      const nextCursor = result.data.nextCursor ?? null;
      setDetail((current) => current?.id === ticketId
        && current.repliesCursor?.createdAt === cursor.createdAt
        && current.repliesCursor?.id === cursor.id ? {
        ...current,
        replies: [...olderReplies, ...current.replies],
        repliesCursor: nextCursor,
      } : current);
    } catch {
      if (!controller.signal.aborted) setEarlierRepliesErrorFor(ticketId);
    } finally {
      if (earlierRepliesController.current === controller) {
        earlierRepliesController.current = null;
        if (earlierRepliesRequestFor.current === ticketId) earlierRepliesRequestFor.current = null;
        setLoadingEarlierRepliesFor((current) => current === ticketId ? null : current);
      }
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
      const loadedDetail = await loadDetail(openTicketId);
      if (!loadedDetail) return;
      const lastDisplayedReply = [...loadedDetail.replies].reverse().find((reply) => reply.sender_role === "customer");
      if (lastDisplayedReply) {
        const readResponse = await fetch(`/api/support/tickets/${openTicketId}/read`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ surface: "admin", lastDisplayedReplyId: lastDisplayedReply.id }),
        });
        if (readResponse.ok) setTickets((prev) => prev?.map((t) => (t.id === openTicketId ? { ...t, unread: false } : t)) ?? null);
      }
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
      await loadTickets();
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
      setTickets((prev) => prev?.map((t) => (t.id === id ? { ...t, category, classificationMethod: "manual", team: teamForCategory(category) } : t)) ?? null);
      await loadTickets();
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
      await loadTickets();
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
    const operationId = replyOperationId ?? crypto.randomUUID();
    setReplyOperationId(operationId);
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${openTicketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text, operationId }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        showFeedback("error", body.error?.code ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`) : t("ui.support.errors.sendReply"));
        return;
      }
      setReply("");
      setReplyOperationId(null);
      showFeedback("success", t("ui.support.replySent"));
      await loadDetail(openTicketId);
      await loadTickets();
    } catch {
      showFeedback("error", tCommon("chatbot.supportErrors.checking"));
    } finally {
      setSending(false);
    }
  }

  function handleFileSelected(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || uploading) return;
    setPendingFile(file);
    setAttachmentOperationId(crypto.randomUUID());
  }

  async function sendAttachment() {
    if (!pendingFile || uploading || !openTicketId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", pendingFile);
      const operationId = attachmentOperationId ?? crypto.randomUUID();
      setAttachmentOperationId(operationId);
      formData.append("operationId", operationId);
      if (reply.trim()) formData.append("caption", reply.trim());
      const res = await fetch(`/api/support/tickets/${openTicketId}/attachments`, { method: "POST", body: formData });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: { code?: string } };
        if (body.error?.code === "UPLOAD_FAILED" || body.error?.code === "ATTACHMENT_RESELECT_REQUIRED") setAttachmentOperationId(null);
        showFeedback("error", body.error?.code ? tCommon(`chatbot.supportErrors.${supportError(body.error.code).key}`) : t("ui.support.errors.sendReply"));
        return;
      }
      setReply("");
      setPendingFile(null);
      setAttachmentOperationId(null);
      showFeedback("success", t("ui.support.replySent"));
      await loadDetail(openTicketId);
      await loadTickets();
    } catch {
      showFeedback("error", tCommon("chatbot.supportErrors.checking"));
    } finally {
      setUploading(false);
    }
  }

  return (
      <AdminPageShell>
      <AdminPageHeader eyebrow={<span className="flex items-center gap-2"><MessageSquare size={14} /> {t("ui.support.eyebrow")}</span>} title={t("ui.support.title")} />

      {stats && (
        <AdminMetricGrid items={[
          { label: t("ui.support.status.open"), value: stats.open },
          { label: t("ui.support.status.inProgress"), value: stats.inProgress },
          { label: t("ui.support.status.resolved"), value: stats.resolved },
          { label: t("ui.support.unanswered"), value: stats.unanswered, tone: stats.unanswered > 0 ? "text-destructive" : undefined },
        ]} />
      )}
      {stats?.avgFirstResponseHours !== null && stats?.avgFirstResponseHours !== undefined && (
        <p className="text-xs text-muted-foreground mb-4">
          {t("ui.support.averageFirstResponse")}: {stats.avgFirstResponseHours < 1
            ? t("ui.support.minutes", { count: Math.round(stats.avgFirstResponseHours * 60) })
            : t("ui.support.hours", { count: stats.avgFirstResponseHours.toFixed(1) })}
        </p>
      )}

      <AdminFilterBar className="mb-6">
        <input
          value={searchQuery}
          onChange={(event) => { setSearchQuery(event.target.value); setTicketPage(1); setSelectedIds(new Set()); }}
          placeholder={t("ui.support.searchPlaceholder")}
          aria-label={t("ui.support.searchPlaceholder")}
          className={`${adminFilterControlClassName} min-w-[220px] flex-1`}
        />
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={assignedToMeFilter} onChange={(e) => { setAssignedToMeFilter(e.target.checked); setTicketPage(1); setSelectedIds(new Set()); }} />
            {t("ui.support.assignedToMe")}
          </label>
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={unreadOnlyFilter} onChange={(e) => { setUnreadOnlyFilter(e.target.checked); setTicketPage(1); setSelectedIds(new Set()); }} />
            {t("ui.support.unreadOnly")}
          </label>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => { setSortKey(e.target.value as SortKey); setTicketPage(1); setSelectedIds(new Set()); }}
            className={adminFilterControlClassName}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>{t(SORT_LABEL[k])}</option>
            ))}
          </select>
          <Select value={categoryFilter} onValueChange={(value) => { setCategoryFilter(value); setTicketPage(1); setSelectedIds(new Set()); }}>
            <SelectTrigger className={`${adminFilterControlClassName} w-40`}>
              <SelectValue placeholder={t("ui.support.category")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("ui.support.allCategories")}</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={(value) => { setStatusFilter(value); setTicketPage(1); setSelectedIds(new Set()); }}>
            <SelectTrigger className={`${adminFilterControlClassName} w-36`}>
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
      </AdminFilterBar>

      <ModerationFlagsPanel onOpenTicket={openTicket} />

      {queueError && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          <span>{queueError}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => void loadTickets()}>{t("ui.support.retry")}</Button>
        </div>
      )}

      {tickets === null ? (
        queueError ? null : <p className="text-sm text-muted-foreground">{t("ui.states.loadingEllipsis")}</p>
      ) : tickets.length === 0 ? (
        queueError ? null : <EmptyState title={t("ui.support.empty")} />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <div className="flex items-center gap-2 border-b border-border px-6 py-3 text-xs"><input type="checkbox" aria-label={t("ui.support.selectAllVisible")} checked={visibleTickets.length > 0 && visibleTickets.every((ticket) => selectedIds.has(ticket.id))} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); visibleTickets.forEach((ticket) => event.target.checked ? next.add(ticket.id) : next.delete(ticket.id)); return next; })} /><span className="text-muted-foreground">{t("ui.batch.selectAllOnPage")}</span></div>
          <AdminBatchActionBar selectedCount={visibleTickets.filter((ticket) => selectedIds.has(ticket.id)).length} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as "resolved")} actions={[{ value: "resolved", label: t("ui.support.markResolved") }]} busy={batchBusy} />
          <div className="space-y-3 p-3 lg:hidden">
            {visibleTickets.map((ticket) => (
              <AdminMobileRecordCard
                key={ticket.id}
                header={
                  <div className="flex min-w-0 w-full items-start gap-3">
                    <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                      <input type="checkbox" aria-label={t("ui.support.selectTicket", { subject: ticket.subject })} checked={selectedIds.has(ticket.id)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); if (event.target.checked) next.add(ticket.id); else next.delete(ticket.id); return next; })} />
                    </label>
                    <button onClick={() => openTicket(ticket.id)} className="min-w-0 flex-1 text-left">
                      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm font-semibold text-foreground">
                        <MessageSquare size={13} className="shrink-0 text-muted-foreground" />
                        <span className="break-words">{ticket.subject}</span>
                        {ticket.unread && <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />}
                      </p>
                      <p className="mt-1 break-words text-sm text-muted-foreground">
                        {ticket.category}{ticket.classificationMethod && <span className="text-xs opacity-70"> · {ticket.classificationMethod}</span>}
                        {" "}{t("ui.support.fromUser", { user: ticket.userName })} · {new Date(ticket.createdAt).toLocaleDateString()}
                      </p>
                    </button>
                  </div>
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-muted-foreground" title={t("ui.support.routedToTeam")}>
                    {ticket.team}
                  </span>
                  {ticket.unanswered && <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">{t("ui.support.unanswered")}</span>}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="min-w-0 text-xs font-medium text-muted-foreground">
                    {t("ui.support.category")}
                    <select
                      aria-label={t("ui.support.overrideCategory")}
                      value={ticket.category}
                      disabled={updatingId === ticket.id}
                      onChange={(event) => updateCategory(ticket.id, event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-foreground"
                    >
                      {CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                    </select>
                  </label>
                  <label className="min-w-0 text-xs font-medium text-muted-foreground">
                    {t("ui.support.statusLabel")}
                    <select
                      aria-label={t("ui.support.statusLabel")}
                      value={ticket.status}
                      disabled={updatingId === ticket.id}
                      onChange={(event) => updateStatus(ticket.id, event.target.value)}
                      className="mt-1 min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-semibold text-foreground"
                    >
                      {STATUSES.map((status) => <option key={status} value={status}>{t(STATUS_LABEL[status])}</option>)}
                    </select>
                  </label>
                </div>
              </AdminMobileRecordCard>
            ))}
          </div>
          <div className="hidden divide-y divide-border lg:block">
            {visibleTickets.map((ticket) => (
              <div key={ticket.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <input type="checkbox" aria-label={t("ui.support.selectTicket", { subject: ticket.subject })} checked={selectedIds.has(ticket.id)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); if (event.target.checked) next.add(ticket.id); else next.delete(ticket.id); return next; })} />
                <button onClick={() => openTicket(ticket.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-muted-foreground shrink-0" /> {ticket.subject}
                    {ticket.unread && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[0.625rem] font-medium text-muted-foreground" title={t("ui.support.routedToTeam")}>
                      {ticket.team}
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ticket.category}
                    {ticket.classificationMethod && (
                      <span className="text-[0.5625rem] uppercase tracking-wide opacity-70"> ({ticket.classificationMethod})</span>
                    )}
                    {" "}{t("ui.support.fromUser", { user: ticket.userName ?? t("ui.support.unknownUser") })} · {new Date(ticket.createdAt).toLocaleDateString()}
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
          <Pagination ariaLabel={t("ui.support.pagination")} currentPage={ticketPage} totalPages={totalTicketPages} totalItems={totalTickets} pageSize={TICKETS_PER_PAGE} onPageChange={(page) => { setTicketPage(page); setSelectedIds(new Set()); }} className="mt-0 border-t border-border px-5 py-3" />
        </div>
      )}

      <Dialog
        open={!!openTicketId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenTicketId(null);
            setDetail(null);
            setReply("");
            setReplyOperationId(null);
            setPendingFile(null);
            setAttachmentOperationId(null);
          }
        }}
      >
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden overscroll-contain sm:max-w-lg">
          <DialogHeader>
            <div className="flex flex-col gap-2 pr-6 sm:flex-row sm:items-center sm:justify-between">
              <DialogTitle className="break-words">{detail?.subject}</DialogTitle>
              <div className="flex flex-wrap items-center gap-2">
                {detail && openTicketId && <ReportChatButton chatType="user_admin" threadId={openTicketId} returnPath={`/admin/support?ticket=${openTicketId}`} />}
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
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <TicketThread
                  ticketId={openTicketId ?? undefined}
                  ticketIsMine={detail.viewerIsOwner}
                  ticketBody={detail.body}
                  ticketCreatedAt={detail.createdAt}
                  replies={detail.replies}
                  hasEarlierReplies={Boolean(detail.repliesCursor)}
                  loadingEarlierReplies={loadingEarlierRepliesFor === detail.id}
                  earlierRepliesError={earlierRepliesErrorFor === detail.id}
                  onLoadEarlierReplies={() => void loadEarlierReplies(detail.id)}
                />
              </div>

              <div className="shrink-0 border-t border-border pt-2">
                {speech.error && <p className="mb-1.5 text-xs text-destructive">{SPEECH_ERROR_TEXT[speech.error]}</p>}
                {pendingFile && (
                  <div className="mb-2 flex items-center gap-3 rounded-xl border border-border bg-secondary/60 px-3 py-2 text-xs">
                    <FileText size={16} className="shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{pendingFile.name}</span>
                    <button type="button" onClick={() => { setPendingFile(null); setAttachmentOperationId(null); }} className="shrink-0 text-muted-foreground hover:text-foreground" aria-label={t("ui.support.removeAttachment")}>
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
                    onChange={(e) => {
                      setReply(e.target.value);
                      setReplyOperationId(e.target.value.trim() ? crypto.randomUUID() : null);
                    }}
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
    </AdminPageShell>
  );
}

export default function AdminSupportPage() {
  return (
    <Suspense>
      <AdminSupportContent />
    </Suspense>
  );
}
