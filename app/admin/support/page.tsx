"use client";

// P4 — Member 4: extended per CLAUDE.md Step 9, then CLAUDE-FIXES.md Fix 2
// (reply thread, working Resolve button, notification-deep-link support via
// ?ticket=). Reads from the new /api/admin/tickets* + /api/support/tickets/*
// routes rather than identity.ts::getSupportTickets() (that function's
// `category` field is stale — see Step 8's note).

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MessageSquare, Send } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { TicketThread, type ReplyMessage, type TranscriptMessage } from "@/components/shared/ticket-thread";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { ModerationFlagsPanel } from "@/components/admin/moderation-flags-panel";

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
  default: "Oldest unanswered first",
  created: "Date created",
  lastActivity: "Last activity",
  status: "Status",
  category: "Category",
  unread: "Unread first",
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

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

function AdminSupportContent() {
  const searchParams = useSearchParams();
  const { currentUser } = useAuth();
  const { showFeedback } = useActionFeedback();
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [stats, setStats] = useState<QueueStats | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [assignedToMeFilter, setAssignedToMeFilter] = useState(false);
  const [unreadOnlyFilter, setUnreadOnlyFilter] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("default");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

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
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? "Could not update ticket status."); return; }
      setTickets((prev) => prev?.map((t) => (t.id === id ? { ...t, status: status as AdminTicket["status"] } : t)) ?? null);
      if (detail?.id === id) setDetail((d) => (d ? { ...d, status: status as TicketDetail["status"] } : d));
      showFeedback("success", `Ticket marked ${status.replace("_", " ")}.`);
    } catch {
      showFeedback("error", "Could not update ticket status. Please try again.");
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
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? "Could not update ticket category."); return; }
      setTickets((prev) => prev?.map((t) => (t.id === id ? { ...t, category, classificationMethod: "manual" } : t)) ?? null);
      showFeedback("success", "Ticket category updated.");
    } catch {
      showFeedback("error", "Could not update ticket category. Please try again.");
    } finally {
      setUpdatingId(null);
    }
  }

  async function sendReply() {
    const text = reply.trim();
    if (!text || sending || !openTicketId) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/tickets/${openTicketId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) { const body = await res.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? "Could not send reply."); return; }
      setReply("");
      showFeedback("success", "Support reply sent.");
      await loadDetail(openTicketId);
      await loadTickets();
    } catch {
      showFeedback("error", "Could not send reply. Please try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-6 sm:p-8">
      <h1 className="font-bold text-lg text-foreground mb-4">Support Tickets</h1>

      <ModerationFlagsPanel />

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          {[
            { label: "Open", value: stats.open, alert: false },
            { label: "In Progress", value: stats.inProgress, alert: false },
            { label: "Resolved", value: stats.resolved, alert: false },
            { label: "Unanswered", value: stats.unanswered, alert: stats.unanswered > 0 },
          ].map((card) => (
            <div key={card.label} className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
              <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">{card.label}</p>
              <p className={`text-xl font-bold ${card.alert ? "text-destructive" : "text-foreground"}`}>{card.value}</p>
            </div>
          ))}
        </div>
      )}
      {stats?.avgFirstResponseHours !== null && stats?.avgFirstResponseHours !== undefined && (
        <p className="text-xs text-muted-foreground mb-4">
          Average first response: {stats.avgFirstResponseHours < 1
            ? `${Math.round(stats.avgFirstResponseHours * 60)} min`
            : `${stats.avgFirstResponseHours.toFixed(1)} hr`}
        </p>
      )}

      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <div className="flex items-center gap-3 text-xs">
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={assignedToMeFilter} onChange={(e) => setAssignedToMeFilter(e.target.checked)} />
            Assigned to me
          </label>
          <label className="flex items-center gap-1.5 text-foreground">
            <input type="checkbox" checked={unreadOnlyFilter} onChange={(e) => setUnreadOnlyFilter(e.target.checked)} />
            Unread only
          </label>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="h-8 rounded-lg border border-border px-2 text-xs bg-background text-foreground"
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>{SORT_LABEL[k]}</option>
            ))}
          </select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Category" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {CATEGORIES.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {tickets === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : tickets.length === 0 ? (
        <EmptyState title="No support tickets" />
      ) : (
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <div className="divide-y divide-border">
            {sortedTickets.map((t) => (
              <div key={t.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <button onClick={() => openTicket(t.id)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-muted-foreground shrink-0" /> {t.subject}
                    {t.unread && <span className="w-2 h-2 rounded-full bg-destructive shrink-0" />}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.category}
                    {t.classificationMethod && (
                      <span className="text-[9px] uppercase tracking-wide opacity-70"> ({t.classificationMethod})</span>
                    )}
                    {" "}· from {t.userName} · {new Date(t.createdAt).toLocaleDateString()}
                    {t.unanswered && <span className="text-destructive font-medium"> · unanswered</span>}
                  </p>
                </button>
                <select
                  value={t.category}
                  disabled={updatingId === t.id}
                  onChange={(e) => updateCategory(t.id, e.target.value)}
                  className="text-xs rounded-full px-3 py-1.5 border border-border bg-background text-foreground shrink-0"
                  title="Override category"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <select
                  value={t.status}
                  disabled={updatingId === t.id}
                  onChange={(e) => updateStatus(t.id, e.target.value)}
                  className="text-xs font-semibold rounded-full px-3 py-1.5 border border-border bg-background text-foreground shrink-0"
                >
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>{STATUS_LABEL[s]}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      <Dialog
        open={!!openTicketId}
        onOpenChange={(open) => {
          if (!open) {
            setOpenTicketId(null);
            setDetail(null);
            setReply("");
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between gap-3 pr-6">
              <DialogTitle>{detail?.subject}</DialogTitle>
              {detail && detail.status !== "resolved" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={updatingId === openTicketId}
                  onClick={() => openTicketId && updateStatus(openTicketId, "resolved")}
                >
                  Mark Resolved
                </Button>
              )}
            </div>
          </DialogHeader>

          {!detail || detail.id !== openTicketId || !currentUser ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="max-h-80 overflow-y-auto">
                <TicketThread
                  currentUserId={currentUser.id}
                  ticketOwnerId={detail.userId}
                  ticketBody={detail.body}
                  ticketCreatedAt={detail.createdAt}
                  transcript={detail.transcript}
                  replies={detail.replies}
                />
              </div>

              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <input
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") sendReply();
                  }}
                  placeholder="Reply to this ticket…"
                  className="flex-1 h-9 rounded-full border border-border px-3 text-sm bg-background text-foreground"
                  disabled={sending}
                />
                <Button size="icon" className="h-9 w-9 rounded-full shrink-0" onClick={sendReply} disabled={sending || !reply.trim()}>
                  <Send size={14} />
                </Button>
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
