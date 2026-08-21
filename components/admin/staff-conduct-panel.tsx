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

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, ChevronRight, Search, UserX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/components/providers/auth";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { getMessages } from "@/backend/domains/identity";
import type { ChatMessage } from "@/backend/core/types";
import { AdminFilterBar, adminFilterControlClassName } from "@/components/admin/filter-bar";
import { AdminMetricGrid } from "@/components/admin/admin-page-shell";
import {
  filterStaffConductRecords,
  paginateStaffConductRecords,
  summarizeStaffConductRecords,
  type StaffConductMetricRecord,
  type StaffConductRecordType,
  type StaffConductReviewState,
} from "@/components/admin/staff-conduct-filtering";

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
  medium: "bg-amber-100 text-amber-700",
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

type MergedItem =
  | (StaffConductMetricRecord & { kind: "flagged_conduct"; data: ConductFlag })
  | (StaffConductMetricRecord & { kind: "reported_chat"; data: ChatReport });

const PAGE_SIZES = [15, 25, 50] as const;

export function StaffConductPanel() {
  const { t } = useTranslation("admin");
  const { currentUser } = useAuth();
  const [query, setQuery] = useState("");
  const [reviewState, setReviewState] = useState<StaffConductReviewState>("open");
  const [recordType, setRecordType] = useState<StaffConductRecordType>("all");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PAGE_SIZES)[number]>(15);

  const [flags, setFlags] = useState<ConductFlag[] | null | undefined>(undefined);
  const [reviewingFlagId, setReviewingFlagId] = useState<string | null>(null);
  const [transcriptFlag, setTranscriptFlag] = useState<ConductFlag | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);

  const [reports, setReports] = useState<ChatReport[] | null | undefined>(undefined);
  const [reviewingReportId, setReviewingReportId] = useState<string | null>(null);
  const [chatLogReport, setChatLogReport] = useState<ChatReport | null>(null);
  const [chatLogMessages, setChatLogMessages] = useState<ChatMessage[] | null>(null);

  async function loadFlags() {
    try {
      const res = await fetch("/api/admin/conduct-flags");
      const body = (await res.json()) as { data: ConductFlag[] | null };
      setFlags(res.ok && body.data ? body.data : null);
    } catch {
      setFlags(null);
    }
  }

  async function loadReports() {
    try {
      const res = await fetch("/api/admin/chat-conduct-reports");
      const body = (await res.json()) as { data: ChatReport[] | null };
      setReports(res.ok && body.data ? body.data : null);
    } catch {
      setReports(null);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadFlags(), loadReports()]);
    })();
  }, []);

  async function markFlagReviewed(id: string) {
    if (reviewingFlagId) return;
    setReviewingFlagId(id);
    try {
      await fetch(`/api/admin/conduct-flags/${id}`, { method: "PATCH" });
      await loadFlags();
    } finally {
      setReviewingFlagId(null);
    }
  }

  async function markReportReviewed(id: string) {
    if (reviewingReportId) return;
    setReviewingReportId(id);
    try {
      await fetch(`/api/admin/chat-conduct-reports/${id}`, { method: "PATCH" });
      await loadReports();
    } finally {
      setReviewingReportId(null);
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

  const flagsLoaded = flags !== undefined;
  const reportsLoaded = reports !== undefined;
  if (!flagsLoaded || !reportsLoaded) return null; // loading — no need to flash an empty panel

  const hasEverHadFlags = flags !== null && flags.length > 0;
  const hasEverHadReports = reports !== null && reports.length > 0;
  // Now its own page (moved off /admin/ai-assistant) rather than a widget
  // tucked under other content, so "nothing has ever happened" gets an
  // explicit empty state instead of silently rendering nothing.
  if (!hasEverHadFlags && !hasEverHadReports) {
    return <EmptyState icon={<UserX size={40} />} title={t("staffConduct.empty.title")} description={t("staffConduct.empty.description")} />;
  }

  const chatLogParticipants = chatLogReport
    ? chatLogReport.partyBName
      ? t("staffConduct.participantsWith", { partyA: chatLogReport.partyAName, partyB: chatLogReport.partyBName })
      : chatLogReport.partyAName
    : "";

  const mergedAll: MergedItem[] = [
    ...(flags ?? []).map((f): MergedItem => ({
      id: f.id,
      kind: "flagged_conduct",
      status: f.status,
      createdAt: f.createdAt,
      severity: f.severity,
      searchableText: [f.flaggedAdminName, f.targetUserName ?? "", f.originalText, f.source, f.sourceRefId],
      data: f,
    })),
    ...(reports ?? []).map((r): MergedItem => ({
      id: r.id,
      kind: "reported_chat",
      status: r.status,
      createdAt: r.createdAt,
      searchableText: [r.reporterName, r.partyAName, r.partyBName ?? "", r.reason ?? "", r.chatType, r.threadRef],
      data: r,
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  const metrics = summarizeStaffConductRecords(mergedAll);
  const openAllCount = metrics.needsAction;
  const filteredItems = filterStaffConductRecords(mergedAll, { query, reviewState, recordType });
  const pagedItems = paginateStaffConductRecords(filteredItems, page, pageSize);

  function updateFilter(update: () => void) {
    update();
    setPage(1);
  }

  function flagRow(f: ConductFlag, withKind: boolean) {
    return (
      <div key={`flag-${f.id}`} className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 text-sm">
        <div className="min-w-0 flex-1">
          <p className="text-foreground">
            {withKind && (
              <span className="mr-1.5 rounded-full bg-destructive/10 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase text-destructive">
                {t("staffConduct.kindLabel.flag")}
              </span>
            )}
            <span className="capitalize text-muted-foreground font-normal">
              {t("strictMigration.staffConduct.flagSummary", { admin: f.flaggedAdminName, source: t(SOURCE_LABEL[f.source]), target: f.targetUserName ?? "—" })}
            </span>{" "}
            <span className={`rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase ${SEVERITY_STYLE[f.severity]}`}>
              {t(SEVERITY_LABEL[f.severity])}
            </span>
          </p>
          {f.originalText && (
            <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">&ldquo;{f.originalText}&rdquo;</p>
          )}
          <p className="text-[0.625rem] text-muted-foreground mt-0.5">{new Date(f.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {f.source === "ticket_reply" ? (
            <Link href={`/admin/support?ticket=${f.sourceRefId}`} className="text-xs font-semibold text-primary hover:underline">
              {t("staffConduct.actions.viewLog")}
            </Link>
          ) : (
            <button type="button" onClick={() => void openTranscript(f)} className="text-xs font-semibold text-primary hover:underline">
              {t("staffConduct.actions.viewLog")}
            </button>
          )}
          {f.status === "open" ? (
            <Button size="sm" variant="outline" disabled={reviewingFlagId === f.id} onClick={() => markFlagReviewed(f.id)}>
              {reviewingFlagId === f.id ? t("staffConduct.actions.marking") : t("staffConduct.actions.markReviewed")}
            </Button>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">{t("staffConduct.actions.reviewed")}</span>
          )}
        </div>
      </div>
    );
  }

  function reportRow(r: ChatReport, withKind: boolean) {
    return (
      <div key={`report-${r.id}`} className="flex flex-wrap items-start justify-between gap-4 px-6 py-4 text-sm">
        <div className="min-w-0 flex-1">
          <p className="text-foreground">
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
          {r.reason && <p className="text-xs text-muted-foreground mt-0.5 max-w-xl">&ldquo;{r.reason}&rdquo;</p>}
          <p className="text-[0.625rem] text-muted-foreground mt-0.5">{new Date(r.createdAt).toLocaleString()}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {r.chatType === "user_admin" ? (
            <Link href={`/admin/support?ticket=${r.threadRef}`} className="text-xs font-semibold text-primary hover:underline">
              {t("staffConduct.actions.viewLog")}
            </Link>
          ) : r.chatType === "user_vendor" ? (
            <button type="button" onClick={() => void openChatLog(r)} className="text-xs font-semibold text-primary hover:underline">
              {t("staffConduct.actions.viewLog")}
            </button>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">—</span>
          )}
          {r.status === "open" ? (
            <Button size="sm" variant="outline" disabled={reviewingReportId === r.id} onClick={() => markReportReviewed(r.id)}>
              {reviewingReportId === r.id ? t("staffConduct.actions.marking") : t("staffConduct.actions.markReviewed")}
            </Button>
          ) : (
            <span className="text-[0.625rem] text-muted-foreground">{t("staffConduct.actions.reviewed")}</span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-destructive">
        <UserX size={13} /> {t("staffConduct.title")}
      </p>

      <div aria-label={t("staffConduct.metrics.ariaLabel")}>
        <AdminMetricGrid items={[
          { labelKey: "staffConduct.metrics.needsAction", value: metrics.needsAction, detailKey: "staffConduct.metrics.openRecords" },
          { labelKey: "staffConduct.metrics.flaggedConduct", value: metrics.flaggedConduct, detailKey: "staffConduct.metrics.openRecords" },
          { labelKey: "staffConduct.metrics.reportedChat", value: metrics.reportedChat, detailKey: "staffConduct.metrics.openRecords" },
          { labelKey: "staffConduct.metrics.highSeverity", value: metrics.highSeverity, detailKey: "staffConduct.metrics.openRecords" },
          { labelKey: "staffConduct.metrics.reviewed", value: metrics.reviewed, detailKey: "staffConduct.metrics.reviewedRecords" },
        ].map((metric) => ({ label: t(metric.labelKey), value: metric.value, detail: t(metric.detailKey) }))} />
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
          {pagedItems.items.length === 0 ? (
            <p className="px-6 py-10 text-sm text-muted-foreground">
              {reviewState === "open" && openAllCount === 0 ? t("staffConduct.empty.allReviewed") : t("staffConduct.empty.noMatchingRecords")}
            </p>
          ) : pagedItems.items.map((item) => (item.kind === "flagged_conduct" ? flagRow(item.data, true) : reportRow(item.data, true)))}
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <span>{t("staffConduct.filters.pageOf", { page: pagedItems.page, total: pagedItems.totalPages })}</span>
          {pagedItems.totalPages > 1 && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" aria-label={t("staffConduct.filters.previousPage")} disabled={pagedItems.page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
                <ChevronLeft size={14} />
              </Button>
              <Button size="sm" variant="outline" aria-label={t("staffConduct.filters.nextPage")} disabled={pagedItems.page >= pagedItems.totalPages} onClick={() => setPage((value) => Math.min(pagedItems.totalPages, value + 1))}>
                <ChevronRight size={14} />
              </Button>
            </div>
          )}
        </div>
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
