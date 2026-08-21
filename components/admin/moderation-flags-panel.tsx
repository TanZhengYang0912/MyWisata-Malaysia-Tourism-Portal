"use client";

// P4 — Member 4: moderation flags panel. CLAUDE-MODERATION.md.
// A slur is a safety issue, not just etiquette — this is what makes that
// guard visible, same role as the affiliate "Fraud guards" panel on
// /admin/affiliate. Mounted on /admin/support since every flagged source
// (chatbot messages, tickets, ticket replies) lives in this module's
// support/chatbot surface.

import { useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronUp, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
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

interface ModerationFlagsPanelProps {
  onOpenTicket?: (ticketId: string) => void;
}

const SOURCE_LABEL: Record<ModerationFlag["sourceType"], string> = {
  chatbot_message: "moderation.sources.chatbotMessage",
  ticket: "moderation.sources.ticket",
  ticket_reply: "moderation.sources.ticketReply",
};

const FLAG_TYPE_LABEL: Record<string, string> = {
  slur: "moderation.flagTypes.slur",
};

function getFlagUniqKey(flag: ModerationFlag): string {
  return [
    flag.ticketId ?? "no-ticket",
    flag.sourceType,
    flag.sourceId,
    flag.flagType,
    flag.originalExcerpt ?? "",
  ].join("::");
}

function collapseDuplicateFlags(flags: ModerationFlag[]): ModerationFlag[] {
  const seen = new Set<string>();
  const collapsed: ModerationFlag[] = [];

  for (const flag of flags) {
    const key = getFlagUniqKey(flag);
    if (seen.has(key)) continue;
    seen.add(key);
    collapsed.push(flag);
  }

  return collapsed;
}

interface ModerationFlagGroup {
  key: string;
  ticketId: string | null;
  flags: ModerationFlag[];
}

function getFlagGroupKey(flag: ModerationFlag): string {
  return flag.ticketId
    ? `ticket:${flag.ticketId}`
    : `source:${flag.sourceType}:${flag.sourceId}`;
}

function groupFlags(flags: ModerationFlag[]): ModerationFlagGroup[] {
  const groups = new Map<string, ModerationFlagGroup>();

  for (const flag of flags) {
    const key = getFlagGroupKey(flag);
    const existing = groups.get(key);
    if (existing) {
      existing.flags.push(flag);
      continue;
    }
    groups.set(key, { key, ticketId: flag.ticketId, flags: [flag] });
  }

  return Array.from(groups.values());
}

export function ModerationFlagsPanel({ onOpenTicket }: ModerationFlagsPanelProps) {
  const { t, i18n } = useTranslation("admin");
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const [flags, setFlags] = useState<ModerationFlag[] | null | undefined>(undefined);
  const [showReviewed, setShowReviewed] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());

  async function load() {
    try {
      const res = await fetch("/api/admin/moderation/flags");
      const body = (await res.json()) as { data: ModerationFlag[] | null };
      setFlags(res.ok && body.data ? body.data : null);
    } catch {
      setFlags(null);
    }
  }

  useEffect(() => {
    (async () => {
      await load();
    })();
  }, []);

  async function markReviewed(id: string) {
    if (reviewingId) return;
    setReviewingId(id);
    try {
      await fetch(`/api/admin/moderation/flags/${id}`, { method: "PATCH" });
      await load();
    } finally {
      setReviewingId(null);
    }
  }

  if (flags === undefined) return null; // loading — no need to flash an empty panel
  if (flags === null || flags.length === 0) return null; // nothing has EVER been flagged — keep the page uncluttered

  // Once every flag is reviewed, keep the panel (with its toggle) mounted
  // rather than hiding it — hiding it here would take the "Show reviewed"
  // checkbox down with it, making reviewed flags permanently unreachable.
  const dedupedFlags = collapseDuplicateFlags(flags);
  const visible = showReviewed ? dedupedFlags : dedupedFlags.filter((f) => f.status === "open");
  const openCount = dedupedFlags.filter((f) => f.status === "open").length;
  const groups = groupFlags(visible);

  function toggleGroup(key: string) {
    setExpandedGroups((previous) => {
      const next = new Set(previous);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-3">
        <p className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
          <ShieldAlert size={13} /> {t("moderation.flags.title")} {openCount > 0 && `(${t("moderation.flags.openCount", { count: openCount })})`}
        </p>
        <label className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
          <input type="checkbox" checked={showReviewed} onChange={(e) => setShowReviewed(e.target.checked)} />
          {t("moderation.flags.showReviewed")}
        </label>
      </div>
      <div className="space-y-2">
        {groups.length === 0 && (
          <p className="text-sm text-muted-foreground">
            {openCount === 0 && flags.length > 0 ? t("moderation.flags.allReviewed") : t("moderation.flags.nothingToReview")}
          </p>
        )}
        {groups.map((group) => {
          const latest = group.flags[0];
          const expanded = expandedGroups.has(group.key);
          const summary = t("strictMigration.moderationFlagSummary", {
            user: latest.userName,
            source: t(SOURCE_LABEL[latest.sourceType]),
            flagType: t(FLAG_TYPE_LABEL[latest.flagType] ?? "moderation.flagTypes.unknown"),
          });

          return (
            <div key={group.key} className="overflow-hidden rounded-lg border border-border bg-background/60">
              <div className="flex items-start gap-3 px-3 py-2.5">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={expanded}
                  className="min-w-0 flex-1 text-left"
                >
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="truncate text-sm font-medium text-foreground">{summary}</span>
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground">
                      {t("moderation.flags.flagsCount", { count: group.flags.length })}
                    </span>
                  </div>
                  {latest.originalExcerpt && (
                    <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">&ldquo;{latest.originalExcerpt}&rdquo;</p>
                  )}
                  <p className="mt-0.5 text-[0.625rem] text-muted-foreground">
                    {new Date(latest.createdAt).toLocaleString(locale)}
                  </p>
                </button>
                <div className="flex shrink-0 items-center gap-2">
                  {group.ticketId && (
                    onOpenTicket ? (
                      <button
                        type="button"
                        onClick={() => onOpenTicket(group.ticketId!)}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        {t("moderation.flags.viewTicket")}
                      </button>
                    ) : (
                      <Link href={`/admin/support?ticket=${group.ticketId}`} className="text-xs font-semibold text-primary hover:underline">
                        {t("moderation.flags.viewTicket")}
                      </Link>
                    )
                  )}
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.key)}
                    aria-label={expanded ? t("moderation.flags.hideDetails") : t("moderation.flags.showDetails")}
                    className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
                  >
                    {expanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </button>
                </div>
              </div>

              {expanded && (
                <div className="space-y-2 border-t border-border px-3 py-2">
                  {group.flags.map((flag) => (
                    <div key={flag.id} className="flex items-start justify-between gap-3 border-b border-border/70 pb-2 last:border-b-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-xs text-muted-foreground">
                          {t("strictMigration.moderationFlagSummary", {
                            user: flag.userName,
                            source: t(SOURCE_LABEL[flag.sourceType]),
                            flagType: t(FLAG_TYPE_LABEL[flag.flagType] ?? "moderation.flagTypes.unknown"),
                          })}
                        </p>
                        {flag.originalExcerpt && (
                          <p className="mt-0.5 break-words text-xs text-foreground">&ldquo;{flag.originalExcerpt}&rdquo;</p>
                        )}
                        <p className="mt-0.5 text-[0.625rem] text-muted-foreground">{new Date(flag.createdAt).toLocaleString(locale)}</p>
                      </div>
                      {flag.status === "open" ? (
                        <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={reviewingId === flag.id} onClick={() => markReviewed(flag.id)}>
                          {reviewingId === flag.id ? t("moderation.flags.marking") : t("moderation.flags.markReviewed")}
                        </Button>
                      ) : (
                        <span className="shrink-0 text-[0.625rem] text-muted-foreground">{t("moderation.flags.reviewed")}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
