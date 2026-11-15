"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pagination } from "@/components/shared/pagination";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

interface ModerationFlag {
  id: string;
  sourceType: "chatbot_message" | "ticket" | "ticket_reply";
  sourceId: string;
  ticketId: string | null;
  userId: string | null;
  userName: string;
  flagType: string;
  severity: "low" | "medium" | "high";
  originalExcerpt: string | null;
  status: "open" | "reviewed";
  createdAt: string;
  reviewedAt: string | null;
}

interface ModerationFlagGroup {
  key: string;
  ticketId: string | null;
  latestFlag: ModerationFlag;
  distinctFlagCount: number;
  openFlagCount: number;
}

interface ModerationFlagsPanelProps {
  onOpenTicket?: (ticketId: string) => void;
}

interface GroupDetails {
  flags: ModerationFlag[];
  total: number;
  page: number;
  loading: boolean;
  error: boolean;
}

const SOURCE_LABEL: Record<ModerationFlag["sourceType"], string> = {
  chatbot_message: "moderation.sources.chatbotMessage",
  ticket: "moderation.sources.ticket",
  ticket_reply: "moderation.sources.ticketReply",
};

const FLAG_TYPE_LABEL: Record<string, string> = { slur: "moderation.flagTypes.slur" };
const DETAIL_PAGE_SIZE = 25;

export function ModerationFlagsPanel({ onOpenTicket }: ModerationFlagsPanelProps) {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [groups, setGroups] = useState<ModerationFlagGroup[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState(false);
  const [showReviewed, setShowReviewed] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [totalGroups, setTotalGroups] = useState(0);
  const [totalFlagCount, setTotalFlagCount] = useState(0);
  const [openFlagCount, setOpenFlagCount] = useState(0);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, GroupDetails>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  async function load() {
    setGroups(null);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), showReviewed: String(showReviewed) });
      const response = await fetch(`/api/admin/moderation/flags?${params}`, { cache: "no-store" });
      const body = await response.json() as { data?: { groups?: ModerationFlagGroup[]; totalGroups?: number; totalFlagCount?: number; openFlagCount?: number } };
      if (!response.ok || !Array.isArray(body.data?.groups) || typeof body.data.totalGroups !== "number" || typeof body.data.totalFlagCount !== "number" || typeof body.data.openFlagCount !== "number") throw new Error("load_failed");
      setGroups(body.data.groups);
      setTotalGroups(body.data.totalGroups);
      setTotalFlagCount(body.data.totalFlagCount);
      setOpenFlagCount(body.data.openFlagCount);
      setLoadError(false);
    } catch {
      setGroups([]);
      setLoadError(true);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
    setExpandedGroups(new Set());
    setDetails({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showReviewed, page, pageSize]);

  async function loadGroupDetails(groupKey: string, detailPage: number) {
    setDetails((previous) => ({
      ...previous,
      [groupKey]: { flags: previous[groupKey]?.flags ?? [], total: previous[groupKey]?.total ?? 0, page: detailPage, loading: true, error: false },
    }));
    try {
      const params = new URLSearchParams({ page: String(detailPage), pageSize: String(DETAIL_PAGE_SIZE), showReviewed: "true", groupKey });
      const response = await fetch(`/api/admin/moderation/flags?${params}`, { cache: "no-store" });
      const body = await response.json() as { data?: { flags?: ModerationFlag[]; totalFlags?: number } };
      if (!response.ok || !Array.isArray(body.data?.flags) || typeof body.data.totalFlags !== "number") throw new Error("details_failed");
      setDetails((previous) => ({ ...previous, [groupKey]: { flags: body.data!.flags!, total: body.data!.totalFlags!, page: detailPage, loading: false, error: false } }));
    } catch {
      setDetails((previous) => ({ ...previous, [groupKey]: { flags: previous[groupKey]?.flags ?? [], total: previous[groupKey]?.total ?? 0, page: detailPage, loading: false, error: true } }));
    }
  }

  function toggleGroup(groupKey: string) {
    const isExpanded = expandedGroups.has(groupKey);
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (isExpanded) next.delete(groupKey);
      else next.add(groupKey);
      return next;
    });
    if (!isExpanded && !details[groupKey]) void loadGroupDetails(groupKey, 1);
  }

  async function markReviewed(id: string, groupKey: string) {
    if (reviewingId) return;
    setReviewingId(id);
    setActionError(false);
    try {
      const response = await fetch(`/api/admin/moderation/flags/${id}`, { method: "PATCH" });
      const body = await response.json().catch(() => ({})) as { data?: { reviewed?: boolean }; error?: { message?: string } };
      if (!response.ok || body.data?.reviewed !== true) throw new Error(body.error?.message ?? "review_failed");
      setDetails((previous) => {
        const next = { ...previous };
        delete next[groupKey];
        return next;
      });
      await load();
      setExpandedGroups((previous) => { const next = new Set(previous); next.delete(groupKey); return next; });
    } catch {
      setActionError(true);
    } finally {
      setReviewingId(null);
    }
  }

  if (groups === null) return null;
  if (loadError) return (
    <div role="alert" className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
      <span>{t("moderation.flags.loadFailed")}</span>
      <Button type="button" size="sm" variant="outline" onClick={() => void load()}>{t("ui.support.retry")}</Button>
    </div>
  );
  if (totalFlagCount === 0) return null;

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-3">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ShieldAlert size={13} /> {t("moderation.flags.title")} {openFlagCount > 0 && `(${t("moderation.flags.openCount", { count: openFlagCount })})`}
        </p>
        <div className="flex items-center gap-3">
          <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={showReviewed} onChange={(event) => { setShowReviewed(event.target.checked); setPage(1); }} />
            {t("moderation.flags.showReviewed")}
          </label>
          <select aria-label={t("moderationWords.pageSize")} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 10 | 25 | 50); setPage(1); }} className="h-9 rounded-lg border border-border bg-background px-2 text-xs text-foreground">
            {[10, 25, 50].map((size) => <option key={size} value={size}>{size}</option>)}
          </select>
        </div>
      </div>
      {actionError && <p role="alert" className="mb-2 rounded-lg bg-destructive/5 p-2 text-xs text-destructive">{t("moderation.flags.reviewFailed")}</p>}
      <div className="space-y-2">
        {groups.length === 0 ? <p className="text-sm text-muted-foreground">{t("moderation.flags.allReviewed")}</p> : groups.map((group) => {
          const latest = group.latestFlag;
          const expanded = expandedGroups.has(group.key);
          const detail = details[group.key];
          const summary = t("strictMigration.moderationFlagSummary", {
            user: latest.userName,
            source: t(SOURCE_LABEL[latest.sourceType]),
            flagType: t(FLAG_TYPE_LABEL[latest.flagType] ?? "moderation.flagTypes.unknown"),
          });
          return (
            <div key={group.key} className="overflow-hidden rounded-lg border border-border bg-background/60">
              <div className="flex items-start gap-3 px-3 py-2.5">
                <button type="button" onClick={() => toggleGroup(group.key)} aria-expanded={expanded} className="min-w-0 flex-1 text-left">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-foreground">{summary}</span>
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{t("moderation.flags.flagsCount", { count: group.distinctFlagCount })}</span>
                  </div>
                  {latest.originalExcerpt && <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">&ldquo;{latest.originalExcerpt}&rdquo;</p>}
                  <p className="mt-0.5 text-[0.625rem] text-muted-foreground">{new Date(latest.createdAt).toLocaleString(locale)}</p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {group.ticketId && (onOpenTicket ? <button type="button" onClick={() => onOpenTicket(group.ticketId!)} className="text-xs font-semibold text-primary hover:underline">{t("moderation.flags.viewTicket")}</button> : <Link href={`/admin/support?ticket=${group.ticketId}`} className="text-xs font-semibold text-primary hover:underline">{t("moderation.flags.viewTicket")}</Link>)}
                  <button type="button" onClick={() => toggleGroup(group.key)} aria-label={expanded ? t("moderation.flags.hideDetails") : t("moderation.flags.showDetails")} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground">{expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
                </div>
              </div>
              {expanded && <div className="space-y-2 border-t border-border px-3 py-2">
                {detail?.loading && <p className="text-xs text-muted-foreground">{t("moderationWords.loading")}</p>}
                {detail?.error && <div role="alert" className="flex items-center justify-between gap-2 text-xs text-destructive"><span>{t("moderation.flags.loadFailed")}</span><Button size="sm" variant="outline" onClick={() => void loadGroupDetails(group.key, detail.page)}>{t("ui.support.retry")}</Button></div>}
                {detail?.flags.map((flag) => <div key={flag.id} className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 last:border-b-0 last:pb-0">
                  <div className="min-w-0">
                    <p className="text-xs text-muted-foreground">{t("strictMigration.moderationFlagSummary", { user: flag.userName, source: t(SOURCE_LABEL[flag.sourceType]), flagType: t(FLAG_TYPE_LABEL[flag.flagType] ?? "moderation.flagTypes.unknown") })}</p>
                    {flag.originalExcerpt && <p className="mt-0.5 break-words text-xs text-foreground">&ldquo;{flag.originalExcerpt}&rdquo;</p>}
                    <p className="mt-0.5 text-[0.625rem] text-muted-foreground">{new Date(flag.createdAt).toLocaleString(locale)}</p>
                  </div>
                  {flag.status === "open" ? <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={reviewingId === flag.id} onClick={() => void markReviewed(flag.id, group.key)}>{reviewingId === flag.id ? t("moderation.flags.marking") : t("moderation.flags.markReviewed")}</Button> : <span className="shrink-0 text-[0.625rem] text-muted-foreground">{t("moderation.flags.reviewed")}</span>}
                </div>)}
                {detail && detail.total > DETAIL_PAGE_SIZE && <Pagination currentPage={detail.page} totalPages={Math.ceil(detail.total / DETAIL_PAGE_SIZE)} totalItems={detail.total} pageSize={DETAIL_PAGE_SIZE} onPageChange={(nextPage) => void loadGroupDetails(group.key, nextPage)} />}
              </div>}
            </div>
          );
        })}
      </div>
      {totalGroups > 0 && <Pagination currentPage={page} totalPages={Math.ceil(totalGroups / pageSize)} totalItems={totalGroups} pageSize={pageSize} onPageChange={setPage} />}
    </div>
  );
}
