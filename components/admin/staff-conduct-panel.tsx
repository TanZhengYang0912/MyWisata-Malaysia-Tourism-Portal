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
import { UserX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared/empty-state";
import { useAuth } from "@/components/providers/auth";
import { ChatThreadPanel } from "@/components/customer/chat-thread-panel";
import { getMessages } from "@/backend/domains/identity";
import type { ChatMessage } from "@/backend/core/types";

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

type Tab = "flagged_conduct" | "reported_chat";

export function StaffConductPanel() {
  const { t } = useTranslation("admin");
  const { currentUser } = useAuth();
  const [tab, setTab] = useState<Tab>("flagged_conduct");

  const [flags, setFlags] = useState<ConductFlag[] | null | undefined>(undefined);
  const [showReviewedFlags, setShowReviewedFlags] = useState(false);
  const [reviewingFlagId, setReviewingFlagId] = useState<string | null>(null);
  const [transcriptFlag, setTranscriptFlag] = useState<ConductFlag | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);

  const [reports, setReports] = useState<ChatReport[] | null | undefined>(undefined);
  const [showReviewedReports, setShowReviewedReports] = useState(false);
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

  const visibleFlags = flags && (showReviewedFlags ? flags : flags.filter((f) => f.status === "open"));
  const openFlagCount = flags ? flags.filter((f) => f.status === "open").length : 0;

  const visibleReports = reports && (showReviewedReports ? reports : reports.filter((r) => r.status === "open"));
  const openReportCount = reports ? reports.filter((r) => r.status === "open").length : 0;
  const chatLogParticipants = chatLogReport
    ? chatLogReport.partyBName
      ? t("staffConduct.participantsWith", { partyA: chatLogReport.partyAName, partyB: chatLogReport.partyBName })
      : chatLogReport.partyAName
    : "";

  return (
    <div className="rounded-xl bg-card p-4 border border-destructive/20" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
      <div className="mb-3 flex items-center justify-between">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-destructive">
          <UserX size={13} /> {t("staffConduct.title")}
        </p>
        <div className="flex gap-1 rounded-lg bg-secondary p-0.5">
          <button
            type="button"
            onClick={() => setTab("flagged_conduct")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${tab === "flagged_conduct" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {t("staffConduct.tabs.flaggedConduct")}{openFlagCount > 0 && ` (${openFlagCount})`}
          </button>
          <button
            type="button"
            onClick={() => setTab("reported_chat")}
            className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${tab === "reported_chat" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"}`}
          >
            {t("staffConduct.tabs.reportedChat")}{openReportCount > 0 && ` (${openReportCount})`}
          </button>
        </div>
      </div>

      {tab === "flagged_conduct" && (
        <div>
          <div className="mb-2 flex justify-end">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={showReviewedFlags} onChange={(e) => setShowReviewedFlags(e.target.checked)} />
              {t("staffConduct.filters.showReviewed")}
            </label>
          </div>
          <div className="space-y-2">
            {(!visibleFlags || visibleFlags.length === 0) && (
              <p className="text-sm text-muted-foreground">
                {flags && openFlagCount === 0 && flags.length > 0 ? t("staffConduct.empty.allFlagsReviewed") : t("staffConduct.empty.nothingToReview")}
              </p>
            )}
            {visibleFlags?.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div>
                  <p className="text-foreground">
                    <span className="font-semibold">{f.flaggedAdminName}</span>{" "}
                    <span className="capitalize text-muted-foreground font-normal">
                      · {t(SOURCE_LABEL[f.source])} · {t("staffConduct.targetPrefix")} {f.targetUserName ?? "—"}
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
            ))}
          </div>
        </div>
      )}

      {tab === "reported_chat" && (
        <div>
          <div className="mb-2 flex justify-end">
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <input type="checkbox" checked={showReviewedReports} onChange={(e) => setShowReviewedReports(e.target.checked)} />
              {t("staffConduct.filters.showReviewed")}
            </label>
          </div>
          <div className="space-y-2">
            {(!visibleReports || visibleReports.length === 0) && (
              <p className="text-sm text-muted-foreground">
                {reports && openReportCount === 0 && reports.length > 0 ? t("staffConduct.empty.allReportsReviewed") : t("staffConduct.empty.noReportedChats")}
              </p>
            )}
            {visibleReports?.map((r) => (
              <div key={r.id} className="flex items-start justify-between gap-3 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div>
                  <p className="text-foreground">
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
            ))}
          </div>
        </div>
      )}

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
