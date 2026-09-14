"use client";

// P4 — Member 4: chatbot admin oversight. CLAUDE-PHASE2.md Feature A —
// "Also on /admin/chatbot: total questions, answer rate, top unanswered
// questions, a KB editor (add/edit/deactivate a doc -> auto re-embed on save)."

import { useEffect, useRef, useState } from "react";
import { Bot, MessageSquareText, Plus, RefreshCw, Sparkles, TrendingUp, WandSparkles } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { TICKET_CATEGORIES } from "@/lib/chatbot/classify";
import { useTranslation } from "react-i18next";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";

interface TopQuestion { question: string; count: number; lastAskedAt: string }

interface ChatbotStats {
  totalQuestions: number;
  answeredCount: number;
  answerRate: number;
  topUnanswered: TopQuestion[];
  notHelpfulAnswered: TopQuestion[];
  escalationRate: number;
  topEscalated: TopQuestion[];
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
  category: string; // one of TICKET_CATEGORIES going forward — see the category <select> below
  isActive: boolean;
}

// "general" — always a valid member of TICKET_CATEGORIES — so a brand new
// doc never starts on a blank category the dropdown itself doesn't offer.
const EMPTY_FORM: KbFormState = { title: "", body: "", keywords: "", category: "general", isActive: true };

export default function AdminChatbotPage() {
  const { showFeedback } = useActionFeedback();
  const { t } = useTranslation("admin");
  const [stats, setStats] = useState<ChatbotStats | null | undefined>(undefined);
  const [docs, setDocs] = useState<KbDoc[] | null | undefined>(undefined);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<KbFormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const kbFormRef = useRef<HTMLDivElement>(null);
  // CLAUDE-P4-EXTRAS-2.md Extra 5 — which gap question is currently being
  // drafted (there can be several rows across both gap lists; this scopes
  // the "Drafting…" state to the one actually clicked, not the whole page).
  const [draftingQuestion, setDraftingQuestion] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

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
        setReindexResult(t("chatbot.reindexResult", { scanned: body.data.scanned, embedded: body.data.reindexed, skipped: body.data.skipped, errors: body.data.errors.length ? t("chatbot.reindexErrors", { count: body.data.errors.length }) : "" }));
        await loadDocs();
      } else {
        setReindexResult(body.error?.message ?? t("chatbot.errors.reindex"));
      }
    } catch {
      setReindexResult(t("chatbot.errors.reindex"));
    } finally {
      setReindexing(false);
    }
  }

  function startNew() {
    setForm(EMPTY_FORM);
    setFormError(null);
    setEditingId("new");
  }

  // CLAUDE-QUICKWINS.md Item 3: closes the loop — admin sees a gap in "top
  // unanswered", one click opens a KB doc pre-filled with that exact
  // question, admin fills in the answer, bot improves. Only the title is
  // pre-filled (the question itself) — the body/keywords are the admin's
  // answer to write, not something to guess for them.
  function addToKb(question: string) {
    setForm({ ...EMPTY_FORM, title: question });
    setFormError(null);
    setEditingId("new");
  }

  // CLAUDE-P4-EXTRAS-2.md Extra 5: the AI-assisted version of addToKb()
  // above — prefills BOTH title and body with a Gemini-drafted answer
  // (including [ADMIN: confirm …] placeholders for anything it doesn't
  // actually know), instead of leaving the admin to write the body from
  // scratch. Still opens the exact same form, still requires the admin to
  // review/edit and press the existing Save button — nothing here writes to
  // chatbot_kb_documents itself. Sits alongside "Add to KB", not in place of
  // it — a manual title-only start is still one click away if preferred.
  async function draftAnswer(question: string) {
    if (draftingQuestion) return;
    setDraftingQuestion(question);
    try {
      const res = await fetch("/api/admin/chatbot/kb/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question }),
      });
      const body = (await res.json()) as {
        data: { title: string; body: string; keywords: string[]; category: string } | null;
        error: { message: string } | null;
      };
      if (!res.ok || !body.data) {
        showFeedback("error", body.error?.message ?? t("chatbot.errors.draft"));
        return;
      }
      // category is classifyTicket(question) from the route — a pre-fill,
      // not a decision; the dropdown below lets the admin override it
      // before saving, same as it already does for a manual/"Add to KB" doc.
      // keywords is the same comma-separated string the form already uses
      // for a manually-typed doc (split on save in saveDoc()) — the AI
      // suggestion is just prefilling that same field, not a new code path.
      setForm({
        ...EMPTY_FORM,
        title: body.data.title,
        body: body.data.body,
        keywords: body.data.keywords.join(", "),
        category: body.data.category,
      });
      setFormError(null);
      setEditingId("new");
    } catch {
      showFeedback("error", t("chatbot.errors.draft"));
    } finally {
      setDraftingQuestion(null);
    }
  }

  // Deferred to an effect rather than called inline in addToKb()/startNew():
  // the form <div> only mounts once editingId becomes truthy, so the ref
  // isn't populated until after that re-render commits.
  useEffect(() => {
    if (editingId) kbFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editingId]);

  function startEdit(doc: KbDoc) {
    setForm({
      title: doc.title,
      body: doc.body,
      keywords: doc.keywords.join(", "),
      // Preserves a legacy category (e.g. "rewards"/"wallet"/"account" — real
      // values on the pre-existing seeded docs, predating this dropdown and
      // outside TICKET_CATEGORIES) exactly as stored; only a genuinely null
      // category falls back to "general". The <select> below adds this as
      // an extra option when it isn't one of the fixed six, so opening this
      // form can never silently reclassify a doc just by loading it.
      category: doc.category ?? "general",
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
        setFormError(body.error?.message ?? t("chatbot.errors.save"));
        return;
      }
      setEditingId(null);
      showFeedback("success", editingId === "new" ? t("chatbot.success.created") : t("chatbot.success.updated"));
      await loadDocs();
    } catch {
      setFormError(t("chatbot.errors.save"));
      showFeedback("error", t("chatbot.errors.saveRetry"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(doc: KbDoc) {
    try {
      const response = await fetch(`/api/admin/chatbot/kb/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !doc.isActive }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("chatbot.errors.status")); return; }
      showFeedback("success", doc.isActive ? t("chatbot.success.deactivated") : t("chatbot.success.activated"));
      await loadDocs();
    } catch { showFeedback("error", t("chatbot.errors.statusRetry")); }
  }

  async function applyBatch(action: "activate" | "deactivate") {
    if (batchBusy) return;
    const selected = sortedDocs.filter((doc) => selectedDocIds.has(doc.id) && (action === "activate" ? !doc.isActive : doc.isActive));
    if (!selected.length || selected.length !== selectedDocIds.size) {
      showFeedback("error", t("chatbot.errors.sameStatus"));
      return;
    }
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((doc) => fetch(`/api/admin/chatbot/kb/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: action === "activate" }) })));
      const failed = responses.find((response) => !response.ok);
      if (failed) {
        const body = await failed.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? t("chatbot.errors.batchUpdate"));
      }
      setSelectedDocIds(new Set());
      showFeedback("success", t("chatbot.success.batchStatus", { count: selected.length }));
      await loadDocs();
    } catch (error) {
      showFeedback("error", error instanceof Error ? error.message : t("chatbot.errors.batchFailed"));
    } finally {
      setBatchBusy(false);
    }
  }

  const sortedDocs = docs ? [...docs].sort((a, b) => Number(b.isActive) - Number(a.isActive) || a.title.localeCompare(b.title)) : [];

  if (stats === undefined || docs === undefined) {
    return <AdminPageShell><AdminPageHeader title={t("chatbot.title")} /><p className="text-sm text-muted-foreground">{t("chatbot.loading")}</p></AdminPageShell>;
  }
  if (stats === null || docs === null) {
    return (
      <AdminPageShell><AdminPageHeader title={t("chatbot.title")} /><EmptyState
        title={t("chatbot.errors.loadTitle")}
        description={t("chatbot.errors.loadDescription")}
      /></AdminPageShell>
    );
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Bot size={14} /> {t("chatbot.title")}</span>}
        title={t("chatbot.title")}
        actions={<div className="text-right">
          <Button size="sm" variant="outline" onClick={runReindex} disabled={reindexing}>
            <RefreshCw size={13} className={reindexing ? "animate-spin" : ""} /> {reindexing ? t("chatbot.reindexing") : t("chatbot.reindex")}
          </Button>
          {reindexResult && <p className="text-[0.6875rem] text-muted-foreground mt-1 max-w-[240px]">{reindexResult}</p>}
        </div>}
      />

      <AdminMetricGrid items={[{ label: t("chatbot.metrics.questions"), value: stats.totalQuestions }, { label: t("chatbot.metrics.answerRate"), value: `${(stats.answerRate * 100).toFixed(0)}%` }, { label: t("chatbot.metrics.escalationRate"), value: `${(stats.escalationRate * 100).toFixed(0)}%`, detail: t("chatbot.metrics.escalationNote") }]} />

      <div className="rounded-2xl border border-border bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <TrendingUp size={13} /> {t("chatbot.topUnanswered.title")}
        </p>
        <p className="text-[0.6875rem] text-muted-foreground mb-3 -mt-2">{t("chatbot.topUnanswered.description")}</p>
        {stats.topUnanswered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.topUnanswered.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.topUnanswered.map((q, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <span className="text-foreground flex items-center gap-1.5 min-w-0">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="truncate">{q.question}</span>
                  </span>
                  <p className="text-[0.6875rem] text-muted-foreground pl-[19px]">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString() })}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => addToKb(q.question)}>
                    <Sparkles size={12} /> {t("chatbot.actions.addToKb")}
                  </Button>
                  <Button size="sm" variant="outline" disabled={draftingQuestion === q.question} onClick={() => draftAnswer(q.question)}>
                    <WandSparkles size={12} /> {draftingQuestion === q.question ? t("chatbot.drafting") : t("chatbot.actions.aiDraft")}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <TrendingUp size={13} /> {t("chatbot.notHelpful.title")}
        </p>
        <p className="text-[0.6875rem] text-muted-foreground mb-3 -mt-2">{t("chatbot.notHelpful.description")}</p>
        {stats.notHelpfulAnswered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.notHelpful.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.notHelpfulAnswered.map((q, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <span className="text-foreground flex items-center gap-1.5 min-w-0">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="truncate">{q.question}</span>
                  </span>
                  <p className="text-[0.6875rem] text-muted-foreground pl-[19px]">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString() })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={draftingQuestion === q.question}
                  onClick={() => draftAnswer(q.question)}
                >
                  <WandSparkles size={12} /> {draftingQuestion === q.question ? t("chatbot.drafting") : t("chatbot.actions.aiDraft")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-border bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <TrendingUp size={13} /> {t("chatbot.topEscalated.title")}
        </p>
        <p className="text-[0.6875rem] text-muted-foreground mb-3 -mt-2">{t("chatbot.topEscalated.description")}</p>
        {stats.topEscalated.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.topEscalated.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.topEscalated.map((q, i) => (
              <div key={i} className="flex items-center justify-between gap-3 text-sm border-t border-border pt-2 first:border-t-0 first:pt-0">
                <div className="min-w-0">
                  <span className="text-foreground flex items-center gap-1.5 min-w-0">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="truncate">{q.question}</span>
                  </span>
                  <p className="text-[0.6875rem] text-muted-foreground pl-[19px]">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString() })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={draftingQuestion === q.question}
                  onClick={() => draftAnswer(q.question)}
                >
                  <WandSparkles size={12} /> {draftingQuestion === q.question ? t("chatbot.drafting") : t("chatbot.actions.aiDraft")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
        <p className="text-xs font-bold uppercase tracking-wider text-primary">{t("chatbot.knowledgeBase")}</p>
        <Button size="sm" onClick={startNew}>
          <Plus size={14} /> {t("chatbot.actions.newDoc")}
        </Button>
      </div>

      {editingId && (
        <div ref={kbFormRef} className="rounded-2xl border border-border bg-card p-4 space-y-2" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
          <p className="text-xs font-bold uppercase tracking-wider text-primary">{editingId === "new" ? t("chatbot.form.newTitle") : t("chatbot.form.editTitle")}</p>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder={t("chatbot.form.title")}
            className={`${adminFilterControlClassName} w-full`}
          />
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            placeholder={t("chatbot.form.body")}
            rows={4}
            className={`${adminFilterControlClassName} min-h-24 w-full py-2`}
          />
          <div className="flex gap-2 flex-wrap">
            <input
              value={form.keywords}
              onChange={(e) => setForm((f) => ({ ...f, keywords: e.target.value }))}
              placeholder={t("chatbot.form.keywords")}
              className={`${adminFilterControlClassName} min-w-[200px] flex-1`}
            />
            {/* CLAUDE-P4-EXTRAS-2.md: fixed dropdown, not free text — the
                same TICKET_CATEGORIES set support tickets classify into
                (lib/chatbot/classify.ts). chatbot_kb_documents.category has
                no DB constraint of its own, so this dropdown is what
                enforces the fixed set going forward, not the schema. A few
                pre-existing seeded docs carry categories from before this
                (rewards/wallet/account) that aren't in the set — appended
                as an extra option only when editing one of those, so
                opening the form can't silently reclassify it. */}
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className={`${adminFilterControlClassName} w-40`}
            >
              {[
                ...TICKET_CATEGORIES,
                ...(form.category && !(TICKET_CATEGORIES as string[]).includes(form.category) ? [form.category] : []),
              ].map((c) => (
                <option key={c} value={c}>
                  {t(`chatbot.categories.${c}`)}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-1.5 text-sm text-foreground">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              {t("chatbot.form.active")}
            </label>
          </div>
          {formError && <p className="text-[0.6875rem] text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveDoc} disabled={saving || !form.title.trim() || !form.body.trim()}>
              {saving ? t("chatbot.saving") : t("common.actions.save")}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs"><input type="checkbox" aria-label={t("chatbot.accessibility.selectAll")} checked={sortedDocs.length > 0 && sortedDocs.every((doc) => selectedDocIds.has(doc.id))} onChange={(event) => setSelectedDocIds(event.target.checked ? new Set(sortedDocs.map((doc) => doc.id)) : new Set())} /><span className="text-muted-foreground">{t("chatbot.selectAll")}</span></div>
        <AdminBatchActionBar selectedCount={sortedDocs.filter((doc) => selectedDocIds.has(doc.id)).length} onClear={() => setSelectedDocIds(new Set())} onApply={(action) => void applyBatch(action as "activate" | "deactivate")} actions={[{ value: "activate", label: t("batchActions.activate") }, { value: "deactivate", label: t("batchActions.deactivate") }]} busy={batchBusy} />
        {sortedDocs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("chatbot.emptyDocuments")}</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedDocs.map((d) => (
              <div key={d.id} className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <input type="checkbox" aria-label={t("chatbot.accessibility.selectDocument", { title: d.title })} checked={selectedDocIds.has(d.id)} onChange={(event) => setSelectedDocIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(d.id) : next.delete(d.id); return next; })} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate">
                    {d.title} {!d.isActive && <span className="text-muted-foreground font-normal">({t("chatbot.inactive")})</span>}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {d.category ? t(`chatbot.categories.${d.category}`) : t("chatbot.uncategorized")} · {d.hasEmbedding ? t("chatbot.embedded") : t("chatbot.notEmbedded")}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => startEdit(d)}>
                  {t("chatbot.actions.edit")}
                </Button>
                <Button size="sm" variant="outline" onClick={() => toggleActive(d)}>
                  {d.isActive ? t("batchActions.deactivate") : t("batchActions.activate")}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminPageShell>
  );
}
