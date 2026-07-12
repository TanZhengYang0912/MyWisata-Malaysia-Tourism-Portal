"use client";

// P4 — Member 4: extended per CLAUDE.md Step 9. Reads from the new
// /api/admin/tickets* routes rather than identity.ts::getSupportTickets()
// (that function's `category` field is stale — see Step 8's note).

import { useEffect, useState } from "react";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface AdminTicket {
  id: string;
  userId: string | null;
  userName: string;
  sessionId: string | null;
  subject: string;
  body: string;
  category: string;
  status: "open" | "in_progress" | "resolved" | "closed";
  createdAt: string;
  resolvedAt: string | null;
}

interface TranscriptMessage {
  id: string;
  role: "user" | "bot";
  body: string;
  kb_matched: boolean;
  created_at: string;
}

const CATEGORIES = ["booking", "payment", "vendor", "withdrawal", "affiliate", "general"] as const;
const STATUSES = ["open", "in_progress", "resolved"] as const;

const STATUS_LABEL: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  resolved: "Resolved",
  closed: "Closed",
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<AdminTicket[] | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openTicket, setOpenTicket] = useState<AdminTicket | null>(null);
  const [transcript, setTranscript] = useState<TranscriptMessage[] | null>(null);

  async function loadTickets() {
    const params = new URLSearchParams();
    if (categoryFilter !== "all") params.set("category", categoryFilter);
    if (statusFilter !== "all") params.set("status", statusFilter);
    try {
      const res = await fetch(`/api/admin/tickets?${params.toString()}`);
      const result = (await res.json()) as { data: AdminTicket[] | null };
      setTickets(res.ok && result.data ? result.data : []);
    } catch {
      setTickets([]);
    }
  }

  useEffect(() => {
    (async () => {
      await loadTickets();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryFilter, statusFilter]);

  async function updateStatus(id: string, status: string) {
    if (updatingId) return;
    setUpdatingId(id);
    try {
      await fetch(`/api/admin/tickets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      setTickets((prev) => prev?.map((t) => (t.id === id ? { ...t, status: status as AdminTicket["status"] } : t)) ?? null);
    } finally {
      setUpdatingId(null);
    }
  }

  async function openTranscript(ticket: AdminTicket) {
    setOpenTicket(ticket);
    setTranscript(null);
    try {
      const res = await fetch(`/api/admin/tickets/${ticket.id}/transcript`);
      const result = (await res.json()) as { data: TranscriptMessage[] | null };
      setTranscript(res.ok && result.data ? result.data : []);
    } catch {
      setTranscript([]);
    }
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-bold text-lg text-foreground">Support Tickets</h1>
        <div className="flex items-center gap-2">
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
        <div className="rounded-2xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <div className="divide-y divide-border">
            {tickets.map((t) => (
              <div key={t.id} className="px-6 py-4 flex items-center gap-4 flex-wrap">
                <button onClick={() => openTranscript(t)} className="flex-1 min-w-0 text-left">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                    <MessageSquare size={13} className="text-muted-foreground shrink-0" /> {t.subject}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.category} · from {t.userName} · {new Date(t.createdAt).toLocaleDateString()}
                  </p>
                </button>
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
        open={!!openTicket}
        onOpenChange={(open) => {
          if (!open) {
            setOpenTicket(null);
            setTranscript(null);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{openTicket?.subject}</DialogTitle>
          </DialogHeader>
          <div className="max-h-96 overflow-y-auto space-y-2">
            {transcript === null ? (
              <p className="text-sm text-muted-foreground">Loading transcript…</p>
            ) : transcript.length === 0 ? (
              <p className="text-sm text-muted-foreground">No chatbot conversation linked to this ticket.</p>
            ) : (
              transcript.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm ${m.role === "user" ? "ml-auto bg-primary text-white" : "bg-muted text-foreground"}`}
                >
                  {m.body}
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
