"use client";

// P4 — Member 4: chatbot admin oversight. CLAUDE-PHASE2.md Feature A —
// "Also on /admin/chatbot: total questions, answer rate, top unanswered
// questions, a KB editor (add/edit/deactivate a doc -> auto re-embed on save)."

import { useEffect, useMemo, useState } from "react";
import { Bot, MessageSquareText, Plus, RefreshCw, TrendingUp } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";

interface ChatbotStats {
  totalQuestions: number;
  answeredCount: number;
  answerRate: number;
  topUnanswered: { question: string; count: number }[];
}

interface KbDoc {
  id: string;
  title: string;
  body: string;
  keywords: string[];
  category: string | null;
  isActive: boolean;
  hasEmbedding: boolean;
  embeddedAt: string | null;
  updatedAt: string;
  createdAt: string;
}

interface KbFormState {
  title: string;
  body: string;
  keywords: string; // comma-separated in the form, split on save
  category: string;
  isActive: boolean;
}

const EMPTY_FORM: KbFormState = { title: "", body: "", keywords: "", category: "", isActive: true };

export default function AdminChatbotPage() {
  const { showFeedback } = useActionFeedback();
  const [stats, setStats] = useState<ChatbotStats | null | undefined>(undefined);
  const [docs, setDocs] = useState<KbDoc[] | null | undefined>(undefined);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<KbFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  async function loadStats() {
    try {
      const res = await fetch("/api/admin/chatbot/stats");
      const body = (await res.json()) as { data: ChatbotStats | null };
      setStats(res.ok && body.data ? body.data : null);
    } catch {
      setStats(null);
    }
  }

  async function loadDocs() {
    try {
      const res = await fetch("/api/admin/chatbot/kb");
      const body = (await res.json()) as { data: KbDoc[] | null };
      setDocs(res.ok && body.data ? body.data : null);
    } catch {
      setDocs(null);
    }
  }

  useEffect(() => {
    (async () => {
      await Promise.all([loadStats(), loadDocs()]);
    })();
  }, []);

  async function runReindex() {
    if (reindexing) return;
    setReindexing(true);
    setReindexResult(null);
    try {
      const res = await fetch("/api/admin/chatbot/reindex", { method: "POST" });
      const body = (await res.json()) as {
        data: { scanned: number; reindexed: number; skipped: number; errors: unknown[] } | null;
        error: { message: string } | null;
      };
      if (res.ok && body.data) {
        setReindexResult(
          `Scanned ${body.data.scanned}, embedded ${body.data.reindexed}, skipped ${body.data.skipped}` +
            (body.data.errors.length ? `, ${body.data.errors.length} error(s)` : ""),
        );
        await loadDocs();
      } else {
        setReindexResult(body.error?.message ?? "Reindex failed.");
      }
    } catch {
      setReindexResult("Reindex failed.");
    } finally {
      setReindexing(false);
    }
  }

  function startNew() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  function startEdit(doc: KbDoc) {
    setForm({
      title: doc.title,
      body: doc.body,
      keywords: doc.keywords.join(", "),
      category: doc.category ?? "",
      isActive: doc.isActive,
    });
    setFormError(null);
    setEditingId(doc.id);
  }

  async function saveDoc() {
    if (saving || !editingId) return;
    setSaving(true);
    setFormError(null);
    const payload = {
      title: form.title.trim(),
      body: form.body.trim(),
      keywords: form.keywords.split(",").map((k) => k.trim()).filter(Boolean),
      category: form.category.trim() || null,
      isActive: form.isActive,
    };
    try {
      const res = await fetch(editingId === "new" ? "/api/admin/chatbot/kb" : `/api/admin/chatbot/kb/${editingId}`, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { error: { message: string } | null };
      if (!res.ok) {
        setFormError(body.error?.message ?? "Failed to save.");
        return;
      }
      setEditingId(null);
      showFeedback("success", editingId === "new" ? "Knowledge document created." : "Knowledge document updated.");
      await loadDocs();
    } catch {
      setFormError("Failed to save.");
      showFeedback("error", "Knowledge document could not be saved. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(doc: KbDoc) {
    try {
      const response = await fetch(`/api/admin/chatbot/kb/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !doc.isActive }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? "Could not update document status."); return; }
      showFeedback("success", doc.isActive ? "Knowledge document deactivated." : "Knowledge document activated.");
      await loadDocs();
    } catch { showFeedback("error", "Could not update document status. Please try again."); }
  }

  const sortedDocs = useMemo(() => {
    if (!docs) return [];
    return [...docs].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.title.localeCompare(b.title));
  }, [docs]);

  if (stats === undefined || docs === undefined) {
    return <div className="p-8 text-sm text-muted-foreground">Loading…</div>;
  }
  if (stats === null || docs === null) {
    return (
      <EmptyState
        title="Couldn't load chatbot stats"
        description="Something went wrong loading the chatbot overview. Try refreshing the page."
      />
    );
  }

  return (
    <div className="p-6 sm:p-8">
      <div className="flex items-start justify-between flex-wrap gap-3 mb-6">
        <h1 className="font-bold text-lg text-foreground flex items-center gap-2">
          <Bot size={18} /> Chatbot Oversight
        </h1>
        <div className="text-right">
          <Button size="sm" variant="outline" onClick={runReindex} disabled={reindexing}>
            <RefreshCw size={13} className={reindexing ? "animate-spin" : ""} /> {reindexing ? "Reindexing…" : "Reindex KB"}
          </Button>
          {reindexResult && <p className="text-[11px] text-muted-foreground mt-1 max-w-[240px]">{reindexResult}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-6 max-w-md">
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Questions asked</p>
          <p className="text-xl font-bold text-foreground">{stats.totalQuestions}</p>
        </div>
        <div className="rounded-xl bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Answer rate</p>
          <p className="text-xl font-bold text-foreground">{(stats.answerRate * 100).toFixed(0)}%</p>
        </div>
      </div>

      <div className="rounded-xl bg-card p-4 mb-6" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <TrendingUp size={13} /> Top unanswered questions
        </p>
        {stats.topUnanswered.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing unanswered yet — the KB is covering everything asked so far.</p>
        ) : (
          <div className="space-y-1.5">
            {stats.topUnanswered.map((q, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-foreground flex items-center gap-1.5 min-w-0">
                  <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                  <span className="truncate">{q.question}</span>
                </span>
                <span className="text-muted-foreground shrink-0">
                  ×{q.count}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">Knowledge base</p>
        <Button size="sm" onClick={startNew}>
          <Plus size={14} /> New doc
        </Button>
      </div>

      {editingId && (
        <div className="rounded-xl bg-card p-4 mb-4 space-y-2" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{editingId === "new" ? "New KB document" : "Edit KB document"}</p>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Title"
            className="w-full h-9 rounded-lg border border-border px-3 text-sm bg-background text-foreground"
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder="Body — the fact the bot is allowed to answer from"
            rows={4}
            className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background text-foreground"
          />
          <div className="flex gap-2 flex-wrap">
            <input
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder="Keywords, comma-separated (used by the keyword fallback)"
              className="flex-1 min-w-[200px] h-9 rounded-lg border border-border px-3 text-sm bg-background text-foreground"
            />
            <input
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              placeholder="Category"
              className="w-40 h-9 rounded-lg border border-border px-3 text-sm bg-background text-foreground"
            />
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Active
            </label>
          </div>
          {formError && <p className="text-[11px] text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveDoc} disabled={saving || !form.title.trim() || !form.body.trim()}>
              {saving ? "Saving…" : "Save"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="rounded-xl overflow-hidden bg-card" style={{ boxShadow: "0 1px 10px rgba(36,49,58,0.07)" }}>
        {sortedDocs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">No KB documents yet.</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedDocs.map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {d.title} {!d.isActive && <span className="text-muted-foreground font-normal">(inactive)</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.category ?? "uncategorized"} · {d.hasEmbedding ? "embedded" : "not embedded (keyword-only)"}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => startEdit(d)}>
                  Edit
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleActive(d)}>
                  {d.isActive ? "Deactivate" : "Activate"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
