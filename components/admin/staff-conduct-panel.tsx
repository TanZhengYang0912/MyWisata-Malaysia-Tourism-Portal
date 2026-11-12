"use client";

// P4 — Member 4: staff conduct review panel. CLAUDE-ADMIN-CONDUCT.md +
// CLAUDE-SUPPORT-MUTE-REPORT.md Feature 4.
// Super-admin-only — mounted on /admin/ai-assistant, which already gates the
// whole page on super_admin client-side; this panel's own API calls
// independently re-check server-side. Modeled directly on
// components/admin/moderation-flags-panel.tsx (same "render nothing until
// something has ever happened" and "keep the panel mounted with a
// Show reviewed toggle" patterns).
//
// Two categories, two tabs, two independent datasets (kept as separate
// tables — see the chat_conduct_reports migration comment for why):
//   Flagged Conduct — system-detected admin profanity/slurs (unchanged from
//                     the original single-category panel, renamed here).
//   Reported Chat   — human-submitted reports (Feature 3, not built yet in
//                     this session — this tab starts empty and stays mounted).

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { RefreshCw, Search, UserX } from "lucide-react";
import Link from "next/link";
import { Pagination } from "@/components/shared/pagination";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/components/providers/auth";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { getMessages } from "@/backend/domains/identity";
import type { ChatMessage } from "@/backend/core/types";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid } from "@/components/admin/admin-page-shell";
import type { ConductQueueResponse } from "@/lib/moderation/conduct-queue";
import type { StaffConductRecordType, StaffConductReviewState } from "@/components/admin/staff-conduct-filtering";

interface ConductFlag {
  id: string;
  flaggedAdminName: string;
  targetUserId: string | null;
  targetUserName: string | null;
  source: "ticket_reply" | "admin_ai";
  sourceRefId: string;
  originalText: string;
  severity: "medium" | "high";
  status: "open" | "reviewed";
  createdAt: string;
}

interface ChatReport {
  id: string;
  reporterName: string;
  partyAName: string;
  partyBName: string | null;
  chatType: "user_vendor" | "user_admin" | "vendor_admin";
  threadRef: string;
  reason: string | null;
  status: "open" | "reviewed";
  createdAt: string;
}

interface TranscriptMessage {
  role: string;
  text: string;
}

const SOURCE_LABEL: Record<ConductFlag["source"], string> = {
  ticket_reply: "staffConduct.sources.ticketReply",
  admin_ai: "staffConduct.sources.aiAssistant",
};

const SEVERITY_STYLE: Record<ConductFlag["severity"], string> = {
  medium: "bg-amber-100 dark:bg-amber-500/15 text-amber-700 dark:text-amber-200",
  high: "bg-destructive/15 text-destructive",
};

const CHAT_TYPE_LABEL: Record<ChatReport["chatType"], string> = {
  user_vendor: "staffConduct.chatTypes.userVendor",
  user_admin: "staffConduct.chatTypes.userAdmin",
  vendor_admin: "staffConduct.chatTypes.vendorAdmin",
};

const SEVERITY_LABEL: Record<ConductFlag["severity"], string> = {
  medium: "staffConduct.severity.medium",
  high: "staffConduct.severity.high",
};

const PAGE_SIZES = [15, 25, 50] as const;

export function StaffConductPanel() {
  const { t } = useTranslation("admin");
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [reviewState, setReviewState] = useState<StaffConductReviewState>("open");
  const [recordType, setRecordType] = useState<StaffConductRecordType>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(15);
  const [queue, setQueue] = useState<ConductQueueResponse | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [retryKey, setRetryKey] = useState(0);
  const requestSequence = useRef(0);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<{ id: string; code: "unauthorized" | "notFound" | "failed" } | null>(null);
  const [reviewNotice, setReviewNotice] = useState(false);
  const [transcriptFlag, setTranscriptFlag] = useState<ConductFlag | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);

  const [chatLogReport, setChatLogReport] = useState<ChatReport | null>(null);
  const [chatLogMessages, setChatLogMessages] = useState<ChatMessage[] | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const sequence = ++requestSequence.current;
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      query,
      reviewState,
      recordType,
    });
    const timeout = setTimeout(async () => {
      if (sequence !== requestSequence.current) return;
      setLoading(true);
      setLoadError(false);
      try {
        const response = await fetch(`/api/admin/conduct-queue?${params}`, { signal: controller.signal, cache: "no-store" });
        const body = await response.json() as { data?: ConductQueueResponse | null };
        if (!response.ok || !body.data) throw new Error("queue_unavailable");
        if (sequence !== requestSequence.current) return;
        setQueue(body.data);
      } catch {
        if (controller.signal.aborted || sequence !== requestSequence.current) return;
        setLoadError(true);
      } finally {
        if (!controller.signal.aborted && sequence === requestSequence.current) setLoading(false);
      }
    }, query.trim() ? 250 : 0);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [page, pageSize, query, recordType, retryKey, reviewState]);

  async function markReviewed(kind: "flagged_conduct" | "reported_chat", id: string) {
    if (reviewingId) return;
    setReviewingId(id);
    setReviewError(null);
    setReviewNotice(false);
    try {
      const resource = kind === "flagged_conduct" ? "conduct-flags" : "chat-conduct-reports";
      const response = await fetch(`/api/admin/${resource}/${id}`, { method: "PATCH" });
      const body = await response.json().catch(() => null) as { data?: { alreadyReviewed?: boolean }; error?: { code?: string } } | null;
      if (response.status === 401) {
        setReviewError({ id, code: "unauthorized" });
        return;
      }
      if (!response.ok || !body?.data) {
        setReviewError({ id, code: response.status === 404 ? "notFound" : "failed" });
        return;
      }
      if (body.data.alreadyReviewed) setReviewNotice(true);
      setRetryKey((key) => key + 1);
    } catch {
      setReviewError({ id, code: "failed" });
    } finally {
      setReviewingId(null);
    }
  }

  async function openTranscript(flag: ConductFlag) {
    setTranscriptFlag(flag);
    setTranscript(null);
    try {
      const res = await fetch(`/api/admin/conduct-flags/${flag.id}/transcript`);
      const body = (await res.json()) as { data: { messages: TranscriptMessage[] } | null };
      setTranscript(res.ok && body.data ? body.data.messages : []);
    } catch {
      setTranscript([]);
    }
  }

  async function openChatLog(report: ChatReport) {
    setChatLogReport(report);
    setChatLogMessages(null);
    try {
      setChatLogMessages(await getMessages(report.threadRef));
    } catch {
      setChatLogMessages([]);
    }
  }

  if (!queue) {
    return (
      <div className="space-y-3">
        {loading ? (
          <p role="status" className="text-sm text-muted-foreground">{t("staffConduct.states.loading")}</p>
        ) : (
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <span>{t("staffConduct.errors.load")}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => setRetryKey((key) => key + 1)}>
              <RefreshCw size={14} /> {t("staffConduct.actions.retry")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  const metrics = queue.metrics;
  const openAllCount = metrics.needsAction;
  if (!loadError && metrics.needsAction + metrics.reviewed === 0) {
    return <EmptyState icon={<UserX size={40} />} title={t("staffConduct.empty.title")} description={t("staffConduct.empty.description")} />;
  }

  const chatLogParticipants = chatLogReport
    ? chatLogReport.partyBName
      ? t("staffConduct.participantsWith", { partyA: chatLogReport.partyAName, partyB: chatLogReport.partyBName })
      : chatLogReport.partyAName
    : "";

  function reviewRecovery(id: string) {
    if (!reviewError || reviewError.id !== id) return null;
    const messageKey = reviewError.code === "unauthorized"
      ? "reviewSignIn"
      : reviewError.code === "notFound"
        ? "reviewNotFound"
        : "reviewFailed";
    return (
      <div role="alert" className="mt-2 max-w-xs text-xs text-destructive">
        <p>{t(`staffConduct.errors.${messageKey}`)}</p>
        {reviewError.code === "unauthorized" && (
          <Link href="/login?next=%2Fadmin%2Fstaff-conduct" target="_blank" rel="noreferrer" className="mt-1 inline-block text-primary underline">
            {t("staffConduct.actions.signIn")}
          </Link>
        )}
      </div>
    );
  }

  function updateFilter(update: () => void) {
    update();
    setPage(1);
  }

  function flagRow(f: ConductFlag, withKind: boolean) {
    return (
      <div key={`flag-${f.id}`} className="flex flex-col items-stretch gap-3 px-4 py-4 text-sm lg:flex-row lg:items-start lg:justify-between lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="break-words text-foreground">
            {withKind && (
              <span className="mr-1.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase text-destructive">
                {t("staffConduct.kindLabel.flag")}
              </span>
            )}
            <span className="break-words capitalize text-muted-foreground font-normal">
              {t("strictMigration.staffConduct.flagSummary", { admin: f.flaggedAdminName, source: t(SOURCE_LABEL[f.source]), target: f.targetUserName ?? "—" })}
            </span>{" "}
            <span className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase ${SEVERITY_STYLE[f.severity]}`}>
              {t(SEVERITY_LABEL[f.severity])}
            </span>
          </p>
          {f.originalText && (
            <p className="mt-0.5 max-w-xl break-words text-xs text-muted-foreground">&ldquo;{f.originalText}&rdquo;</p>
          )}
          <p className="text-[0.625rem] text-muted-foreground mt-0.5">{new Date(f.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
          {f.source === "ticket_reply" ? (
            <Link href={`/admin/support?ticket=${f.sourceRefId}`} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8">
              {t("staffConduct.actions.viewLog")}
            </Link>
          ) : (
            <button type="button" onClick={() => void openTranscript(f)} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8">
              {t("staffConduct.actions.viewLog")}
            </button>
          )}
          {f.status === "open" ? (
            <Button size="sm" variant="outline" className="min-h-11 lg:min-h-8" disabled={reviewingId !== null} onClick={() => void markReviewed("flagged_conduct", f.id)}>
              {reviewingId === f.id ? t("staffConduct.actions.marking") : t("staffConduct.actions.markReviewed")}
            </Button>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">{t("staffConduct.actions.reviewed")}</span>
          )}
          {reviewRecovery(f.id)}
        </div>
      </div>
    );
  }

  function reportRow(r: ChatReport, withKind: boolean) {
    return (
      <div key={`report-${r.id}`} className="flex flex-col items-stretch gap-3 px-4 py-4 text-sm lg:flex-row lg:items-start lg:justify-between lg:px-6">
        <div className="min-w-0 flex-1">
          <p className="break-words text-foreground">
            {withKind && (
              <span className="mr-1.5 rounded-full bg-accent/25 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase text-amber-700 dark:text-amber-400">
                {t("staffConduct.kindLabel.report")}
              </span>
            )}
            <span className="font-semibold">{r.reporterName}</span>{" "}
            <span className="text-muted-foreground font-normal">{t("staffConduct.reported")}</span>{" "}
            <span className="font-semibold">{r.partyAName}</span>
            {r.partyBName && (
              <>
                {" "}<span className="text-muted-foreground font-normal">{t("staffConduct.and")}</span>{" "}
                <span className="font-semibold">{r.partyBName}</span>
              </>
            )}{" "}
            <span className="capitalize text-muted-foreground font-normal">· {t(CHAT_TYPE_LABEL[r.chatType])}</span>
          </p>
          {r.reason && <p className="mt-0.5 max-w-xl break-words text-xs text-muted-foreground">&ldquo;{r.reason}&rdquo;</p>}
          <p className="text-[0.625rem] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 lg:w-auto lg:shrink-0">
          {r.chatType === "user_admin" ? (
            <Link href={`/admin/support?ticket=${r.threadRef}`} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8">
              {t("staffConduct.actions.viewLog")}
            </Link>
          ) : r.chatType === "user_vendor" ? (
            <button type="button" onClick={() => void openChatLog(r)} className="inline-flex min-h-11 items-center rounded-md px-2 text-xs font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:min-h-8">
              {t("staffConduct.actions.viewLog")}
            </button>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">—</span>
          )}
          {r.status === "open" ? (
            <Button size="sm" variant="outline" className="min-h-11 lg:min-h-8" disabled={reviewingId !== null} onClick={() => void markReviewed("reported_chat", r.id)}>
              {reviewingId === r.id ? t("staffConduct.actions.marking") : t("staffConduct.actions.markReviewed")}
            </Button>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">{t("staffConduct.actions.reviewed")}</span>
          )}
          {reviewRecovery(r.id)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {loading && <p role="status" className="text-xs text-muted-foreground">{t("staffConduct.states.updating")}</p>}
      {loadError && (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <span>{t("staffConduct.errors.staleLoad")}</span>
          <Button type="button" size="sm" variant="outline" onClick={() => setRetryKey((key) => key + 1)}>
            <RefreshCw size={14} /> {t("staffConduct.actions.retry")}
          </Button>
        </div>
      )}
      {reviewNotice && <p role="status" className="text-sm text-muted-foreground">{t("staffConduct.errors.alreadyReviewed")}</p>}
      <div aria-label={t("staffConduct.metrics.ariaLabel")}>
        <AdminMetricGrid items={[
          { label: t("staffConduct.metrics.needsAction"), value: metrics.needsAction },
          { label: t("staffConduct.metrics.flaggedConduct"), value: metrics.flaggedConduct },
          { label: t("staffConduct.metrics.reportedChat"), value: metrics.reportedChat },
          { label: t("staffConduct.metrics.highSeverity"), value: metrics.highSeverity },
        ]} />
      </div>

      <AdminFilterBar>
        <div className="relative min-w-[220px] flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => updateFilter(() => setQuery(event.target.value))}
            placeholder={t("staffConduct.filters.search")}
            aria-label={t("staffConduct.filters.search")}
            className={`${adminFilterControlClassName} w-full pl-9`}
          />
        </div>
        <select
          value={reviewState}
          onChange={(event) => updateFilter(() => setReviewState(event.target.value as StaffConductReviewState))}
          aria-label={t("staffConduct.filters.reviewState")}
          className={adminFilterControlClassName}
        >
          <option value="open">{t("staffConduct.filters.needsReview")}</option>
          <option value="reviewed">{t("staffConduct.filters.reviewed")}</option>
          <option value="all">{t("staffConduct.filters.allStatuses")}</option>
        </select>
        <select
          value={recordType}
          onChange={(event) => updateFilter(() => setRecordType(event.target.value as StaffConductRecordType))}
          aria-label={t("staffConduct.filters.recordType")}
          className={adminFilterControlClassName}
        >
          <option value="all">{t("staffConduct.filters.allRecordTypes")}</option>
          <option value="flagged_conduct">{t("staffConduct.tabs.flaggedConduct")}</option>
          <option value="reported_chat">{t("staffConduct.tabs.reportedChat")}</option>
        </select>
        <select
          value={pageSize}
          onChange={(event) => updateFilter(() => setPageSize(Number(event.target.value) as (typeof PAGE_SIZES)[number]))}
          aria-label={t("staffConduct.filters.perPageAriaLabel")}
          className={adminFilterControlClassName}
        >
          {PAGE_SIZES.map((size) => <option key={size} value={size}>{t("staffConduct.filters.perPage", { count: size })}</option>)}
        </select>
      </AdminFilterBar>

      <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="divide-y divide-border">
          {queue.items.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground">
              {reviewState === "open" && openAllCount === 0 ? t("staffConduct.empty.allReviewed") : t("staffConduct.empty.noMatchingRecords")}
            </p>
          ) : queue.items.map((item) => (item.kind === "flagged_conduct" ? flagRow(item.data, true) : reportRow(item.data, true)))}
        </div>
        <Pagination currentPage={queue.page} totalPages={queue.totalPages} totalItems={queue.total} pageSize={queue.pageSize} onPageChange={setPage} disabled={loading} className="mt-0 border-t border-border px-5 py-3" />
      </div>

      <Dialog open={!!transcriptFlag} onOpenChange={(open) => { if (!open) { setTranscriptFlag(null); setTranscript(null); } }}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("staffConduct.dialogs.aiSession", { name: transcriptFlag?.flaggedAdminName ?? "" })}</DialogTitle>
          </DialogHeader>
          {transcript === null ? (
            <p className="text-sm text-muted-foreground">{t("staffConduct.dialogs.loading")}</p>
          ) : transcript.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("staffConduct.dialogs.noMessages")}</p>
          ) : (
            <div className="space-y-2">
              {transcript.map((m, i) => (
                <div key={i} className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted text-foreground"}`}>
                  {m.text}
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!chatLogReport} onOpenChange={(open) => { if (!open) { setChatLogReport(null); setChatLogMessages(null); } }}>
        <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{t("staffConduct.dialogs.reportedChat", { participants: chatLogParticipants })}</DialogTitle>
          </DialogHeader>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border">
            {!chatLogMessages || !currentUser ? (
              <p className="p-4 text-sm text-muted-foreground">{t("staffConduct.dialogs.loadingConversation")}</p>
            ) : (
              <ChatThreadPanel
                threadId={chatLogReport!.threadRef}
                messages={chatLogMessages}
                currentUserId={currentUser.id}
                counterpart={{ name: chatLogReport?.partyBName ?? t("staffConduct.fallback.chat") }}
                readOnly
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
