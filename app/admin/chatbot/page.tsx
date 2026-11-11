"use client";

// P4 — Member 4: chatbot admin oversight. CLAUDE-PHASE2.md Feature A —
// "Also on /admin/chatbot: total questions, answer rate, top unanswered
// questions, a KB editor (add/edit/deactivate a doc -> auto re-embed on save)."

import { useCallback, useEffect, useRef, useState } from "react";
import { Bot, MessageSquareText, Plus, RefreshCw, Sparkles, TrendingUp, WandSparkles } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminBatchActionBar } from "@/components/admin/batch-action-bar";
import { TICKET_CATEGORIES } from "@/lib/chatbot/classify";
import { useTranslation } from "react-i18next";
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";
import { Pagination } from "@/components/shared/pagination";

interface TopQuestion { question: string; count: number; lastAskedAt: string }

interface ChatbotStats {
  totalQuestions: number;
  answeredCount: number;
  answerRate: number;
  topCommon: TopQuestion[];
  topUnanswered: TopQuestion[];
  notHelpfulAnswered: TopQuestion[];
  escalationRate: number;
  topEscalated: TopQuestion[];
  pairedUnansweredCount: number;
  legacyUnpairedCount: number;
  range: { from: string; to: string };
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
  contentVersion: number;
  sourceRefs: string[];
  pendingRevision: {
    id: string;
    title: string;
    body: string;
    keywords: string[];
    category: string | null;
    sourceRefs: string[];
    baseContentVersion: number;
  } | null;
}

interface KbDocumentPage {
  documents: KbDoc[];
  page: number;
  pageSize: 10;
  total: number;
  totalPages: number;
}

interface KbFormState {
  title: string;
  body: string;
  keywords: string; // comma-separated in the form, split on save
  category: string; // one of TICKET_CATEGORIES going forward — see the category <select> below
  sourceRefs: string;
  expectedContentVersion: number;
  revisionId: string | null;
  reviewConfirmed: boolean;
}

// "general" — always a valid member of TICKET_CATEGORIES — so a brand new
// doc never starts on a blank category the dropdown itself doesn't offer.
const EMPTY_FORM: KbFormState = { title: "", body: "", keywords: "", category: "general", sourceRefs: "", expectedContentVersion: 0, revisionId: null, reviewConfirmed: false };
const KB_DRAFT_OPERATION_STORAGE_KEY = "mylawatan-admin-kb-draft-operation-v1";

function readKbDraftOperationId(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.sessionStorage.getItem(KB_DRAFT_OPERATION_STORAGE_KEY);
    return stored && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(stored)
      ? stored
      : null;
  } catch {
    return null;
  }
}

export default function AdminChatbotPage() {
  const { showFeedback } = useActionFeedback();
  const { t, i18n } = useTranslation("admin");
  const [stats, setStats] = useState<ChatbotStats | null | undefined>(undefined);
  const [statsError, setStatsError] = useState(false);
  const [statsDays, setStatsDays] = useState<7 | 30 | 90>(30);
  const [docs, setDocs] = useState<KbDoc[] | null | undefined>(undefined);
  const [docsError, setDocsError] = useState(false);
  const [docsPage, setDocsPage] = useState(1);
  const [docsTotal, setDocsTotal] = useState(0);
  const [docsTotalPages, setDocsTotalPages] = useState(1);
  const [reindexing, setReindexing] = useState(false);
  const [reindexResult, setReindexResult] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<KbFormState>(EMPTY_FORM);
  const [draftOperationId, setDraftOperationId] = useState(() => crypto.randomUUID());
  const [kbDraftOperationId, setKbDraftOperationId] = useState(readKbDraftOperationId);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [draftPersisted, setDraftPersisted] = useState(false);
  const [formChanged, setFormChanged] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const kbFormRef = useRef<HTMLDivElement>(null);
  // CLAUDE-P4-EXTRAS-2.md Extra 5 — which gap question is currently being
  // drafted (there can be several rows across both gap lists; this scopes
  // the "Drafting…" state to the one actually clicked, not the whole page).
  const [draftingQuestion, setDraftingQuestion] = useState<string | null>(null);
  const [selectedDocIds, setSelectedDocIds] = useState<Set<string>>(new Set());
  const [batchBusy, setBatchBusy] = useState(false);

  function rotateKbDraftOperationId(): string | null {
    try {
      const next = crypto.randomUUID();
      window.sessionStorage.setItem(KB_DRAFT_OPERATION_STORAGE_KEY, next);
      setKbDraftOperationId(next);
      return next;
    } catch {
      setKbDraftOperationId(null);
      return null;
    }
  }

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/chatbot/stats?days=${statsDays}`);
      const body = (await res.json()) as { data: ChatbotStats | null };
      if (res.ok && body.data) {
        setStats(body.data);
        setStatsError(false);
      } else {
        setStats((current) => current ?? null);
        setStatsError(true);
      }
    } catch {
      setStats((current) => current ?? null);
      setStatsError(true);
    }
  }, [statsDays]);

  const loadDocs = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/chatbot/kb?page=${docsPage}`, { cache: "no-store" });
      const body = (await res.json()) as { data: KbDocumentPage | null };
      if (!res.ok || !body.data) {
        setDocs(null);
        setDocsError(true);
        return;
      }
      setDocs(body.data.documents);
      setDocsError(false);
      setDocsTotal(body.data.total);
      setDocsTotalPages(body.data.totalPages);
      if (body.data.page !== docsPage) setDocsPage(body.data.page);
    } catch {
      setDocs(null);
      setDocsError(true);
    }
  }, [docsPage]);

  useEffect(() => {
    // Range changes trigger an async report fetch; the state updates happen only when it resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadDocs();
  }, [loadDocs]);

  async function runReindex(documentId?: string) {
    if (reindexing) return;
    setReindexing(true);
    setReindexResult(null);
    try {
      const res = await fetch("/api/admin/chatbot/reindex", {
        method: "POST",
        ...(documentId ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ documentId }) } : {}),
      });
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
    setDraftOperationId(crypto.randomUUID());
    rotateKbDraftOperationId();
    setFormError(null);
    setDraftPersisted(false);
    setFormChanged(false);
    setEditingId("new");
  }

  // CLAUDE-QUICKWINS.md Item 3: closes the loop — admin sees a gap in "top
  // unanswered", one click opens a KB doc pre-filled with that exact
  // question, admin fills in the answer, bot improves. Only the title is
  // pre-filled (the question itself) — the body/keywords are the admin's
  // answer to write, not something to guess for them.
  function addToKb(question: string) {
    setForm({ ...EMPTY_FORM, title: question });
    setDraftOperationId(crypto.randomUUID());
    rotateKbDraftOperationId();
    setFormError(null);
    setDraftPersisted(false);
    setFormChanged(false);
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
    let operationId = kbDraftOperationId;
    if (!operationId) operationId = rotateKbDraftOperationId();
    if (!operationId) {
      showFeedback("error", t("chatbot.errors.draftStorageUnavailable"));
      return;
    }
    setDraftingQuestion(question);
    try {
      const res = await fetch("/api/admin/chatbot/kb/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question, operationId }),
      });
      const body = (await res.json()) as {
        data: { title: string; body: string; keywords: string[]; category: string } | null;
        error: { code?: string; message: string } | null;
      };
      if (!res.ok || !body.data) {
        if (body.error?.code === "OPERATION_CONFLICT" || body.error?.code === "RATE_LIMITED" || body.error?.code === "DRAFT_UNAVAILABLE" || body.error?.code === "DRAFT_RESULT_EXPIRED") {
          rotateKbDraftOperationId();
        }
        const message = body.error?.code === "PERSONAL_DATA_WITHHELD"
          ? t("chatbot.errors.privacyBlocked")
          : body.error?.code === "DRAFT_RESULT_EXPIRED"
            ? t("chatbot.errors.draftResultExpired")
          : body.error?.code === "OPERATION_UNKNOWN"
            ? t("chatbot.errors.draftOutcomeUnknown")
            : body.error?.code === "OPERATION_CONFLICT"
              ? t("chatbot.errors.draftOperationConflict")
              : body.error?.code === "RATE_LIMITED"
                ? t("chatbot.errors.draftRateLimited")
                : t("chatbot.errors.draft");
        showFeedback("error", message);
        return;
      }
      // Keep the current key until a confirmed response is consumed so an
      // uncertain network result can be reconciled. A successful draft starts
      // a fresh user intent for the next question.
      rotateKbDraftOperationId();
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
      setDraftOperationId(crypto.randomUUID());
      setFormError(null);
      setDraftPersisted(false);
      setFormChanged(false);
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
    const revision = doc.pendingRevision;
    setForm({
      title: revision?.title ?? doc.title,
      body: revision?.body ?? doc.body,
      keywords: (revision?.keywords ?? doc.keywords).join(", "),
      // Preserves a legacy category (e.g. "rewards"/"wallet"/"account" — real
      // values on the pre-existing seeded docs, predating this dropdown and
      // outside TICKET_CATEGORIES) exactly as stored; only a genuinely null
      // category falls back to "general". The <select> below adds this as
      // an extra option when it isn't one of the fixed six, so opening this
      // form can never silently reclassify a doc just by loading it.
      category: (revision?.category ?? doc.category) ?? "general",
      sourceRefs: (revision?.sourceRefs ?? doc.sourceRefs ?? []).join("\n"),
      expectedContentVersion: doc.contentVersion,
      revisionId: revision?.id ?? null,
      reviewConfirmed: false,
    });
    setFormError(null);
    setDraftPersisted(Boolean(revision));
    setFormChanged(false);
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
      sourceRefs: form.sourceRefs.split("\n").map((source) => source.trim()).filter(Boolean),
      expectedContentVersion: form.expectedContentVersion,
      operationId: draftOperationId,
    };
    const { operationId: _operationId, ...updatePayload } = payload;
    try {
      const res = await fetch(editingId === "new" ? "/api/admin/chatbot/kb" : `/api/admin/chatbot/kb/${editingId}`, {
        method: editingId === "new" ? "POST" : "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editingId === "new" ? payload : updatePayload),
      });
      const body = (await res.json()) as { data?: { documentId?: string; revisionId?: string; contentVersion?: number; changed?: boolean }; error: { message: string } | null };
      if (!res.ok) {
        setFormError(body.error?.message ?? t("chatbot.errors.save"));
        return;
      }
      if (body.data?.changed === false && !body.data.revisionId) {
        setEditingId(null);
        showFeedback("success", t("chatbot.success.noChanges"));
        await loadDocs();
        return;
      }
      const documentId = body.data?.documentId ?? editingId;
      if (typeof documentId !== "string" || typeof body.data?.revisionId !== "string" || typeof body.data.contentVersion !== "number") {
        setFormError(t("chatbot.errors.save"));
        return;
      }
      setEditingId(documentId);
      setForm((current) => ({ ...current, revisionId: body.data!.revisionId!, expectedContentVersion: body.data!.contentVersion!, reviewConfirmed: false }));
      setDraftPersisted(true);
      setFormChanged(false);
      showFeedback("success", t("chatbot.success.draftSaved"));
      if (editingId === "new" && docsPage !== 1) {
        setDocsPage(1);
        return;
      }
      await loadDocs();
    } catch {
      setFormError(t("chatbot.errors.save"));
      showFeedback("error", t("chatbot.errors.saveRetry"));
    } finally {
      setSaving(false);
    }
  }

  async function publishDraft() {
    if (publishing || saving || !draftPersisted || formChanged || !form.revisionId || !form.reviewConfirmed) return;
    setPublishing(true);
    setFormError(null);
    try {
      const response = await fetch(`/api/admin/chatbot/kb/${editingId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ revisionId: form.revisionId, expectedContentVersion: form.expectedContentVersion, confirmed: true }),
      });
      const result = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) {
        setFormError(result.error?.message ?? t("chatbot.errors.publish"));
        return;
      }
      setEditingId(null);
      showFeedback("success", t("chatbot.success.published"));
      await loadDocs();
    } catch {
      setFormError(t("chatbot.errors.publishRetry"));
    } finally {
      setPublishing(false);
    }
  }

  async function toggleActive(doc: KbDoc) {
    if (!doc.isActive) {
      startEdit(doc);
      return;
    }
    try {
      const response = await fetch(`/api/admin/chatbot/kb/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: !doc.isActive }) });
      if (!response.ok) { const body = await response.json().catch(() => ({})); showFeedback("error", body?.error?.message ?? t("chatbot.errors.status")); return; }
      showFeedback("success", doc.isActive ? t("chatbot.success.deactivated") : t("chatbot.success.activated"));
      await loadDocs();
    } catch { showFeedback("error", t("chatbot.errors.statusRetry")); }
  }

  async function applyBatch() {
    if (batchBusy) return;
    const selected = sortedDocs.filter((doc) => selectedDocIds.has(doc.id) && doc.isActive);
    if (!selected.length || selected.length !== selectedDocIds.size) {
      showFeedback("error", t("chatbot.errors.sameStatus"));
      return;
    }
    setBatchBusy(true);
    try {
      const responses = await Promise.all(selected.map((doc) => fetch(`/api/admin/chatbot/kb/${doc.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive: false }) })));
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

  const sortedDocs = docs ?? [];

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><Bot size={14} /> {t("chatbot.title")}</span>}
        title={t("chatbot.title")}
        actions={<div className="text-right">
          <Button size="sm" variant="outline" onClick={() => void runReindex()} disabled={reindexing}>
            <RefreshCw size={13} className={reindexing ? "animate-spin" : ""} /> {reindexing ? t("chatbot.reindexing") : t("chatbot.reindex")}
          </Button>
          {reindexResult && <p className="text-[0.6875rem] text-muted-foreground mt-1 max-w-[240px]">{reindexResult}</p>}
        </div>}
      />

      {statsError && stats && <div role="alert" className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm">
        <span>{t("chatbot.errors.loadStatsRefresh")}</span>
        <Button size="sm" variant="outline" onClick={() => void loadStats()}>{t("chatbot.errors.retry")}</Button>
      </div>}
      {stats === undefined && <p className="mb-3 text-sm text-muted-foreground">{t("chatbot.loading")}</p>}
      {stats === null && <EmptyState
        title={t("chatbot.errors.loadTitle")}
        description={t("chatbot.errors.loadDescription")}
        action={<Button size="sm" variant="outline" onClick={() => void loadStats()}>{t("chatbot.errors.retry")}</Button>}
      />}
      {stats && <>
      <div className="mb-3 flex items-center justify-end gap-2">
        <label htmlFor="chatbot-stats-range" className="text-xs text-muted-foreground">{t("chatbot.metrics.range")}</label>
        <select id="chatbot-stats-range" className={adminFilterControlClassName} value={statsDays} onChange={(event) => setStatsDays(Number(event.target.value) as 7 | 30 | 90)}>
          {[7, 30, 90].map((days) => <option key={days} value={days}>{t(`chatbot.metrics.days.${days}`)}</option>)}
        </select>
      </div>
      <p className="mb-3 text-right text-xs text-muted-foreground">
        {t("chatbot.metrics.dateRange", {
          from: new Date(stats.range.from).toLocaleDateString(i18n.resolvedLanguage),
          to: new Date(stats.range.to).toLocaleDateString(i18n.resolvedLanguage),
        })}
      </p>
      {stats.totalQuestions === 0 && <p className="mb-3 text-sm text-muted-foreground">{t("chatbot.metrics.noQuestions")}</p>}
      <AdminMetricGrid items={[{ label: t("chatbot.metrics.questions"), value: stats.totalQuestions }, { label: t("chatbot.metrics.answerRate"), value: `${(stats.answerRate * 100).toFixed(0)}%` }, { label: t("chatbot.metrics.escalationRate"), value: `${(stats.escalationRate * 100).toFixed(0)}%`, detail: t("chatbot.metrics.escalationNote") }]} />
      <p className="mt-2 text-right text-xs text-muted-foreground">{t("chatbot.metrics.turnCoverage", { paired: stats.pairedUnansweredCount, legacy: stats.legacyUnpairedCount })}</p>

      <div className="rounded-2xl border border-border bg-card p-4" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <p className="text-xs font-bold uppercase tracking-wider text-primary mb-3 flex items-center gap-1.5">
          <TrendingUp size={13} /> {t("chatbot.topCommon.title")}
        </p>
        {stats.topCommon.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.topCommon.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.topCommon.map((q, i) => (
              <div key={`${q.question}-${i}`} className="flex min-w-0 flex-col gap-3 border-t border-border pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-start gap-1.5 text-foreground">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="break-words">{q.question}</span>
                  </span>
                  <p className="break-words pl-[19px] text-[0.6875rem] text-muted-foreground">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString(i18n.resolvedLanguage) })}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                  <Button size="sm" variant="outline" className="min-h-11 min-w-[8rem] flex-1 justify-center whitespace-normal text-center sm:flex-none" onClick={() => addToKb(q.question)}>
                    <Sparkles size={12} /> {t("chatbot.actions.addToKb")}
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-11 min-w-[8rem] flex-1 justify-center whitespace-normal text-center sm:flex-none" disabled={draftingQuestion === q.question} onClick={() => draftAnswer(q.question)}>
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
          <TrendingUp size={13} /> {t("chatbot.topUnanswered.title")}
        </p>
        {stats.topUnanswered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.topUnanswered.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.topUnanswered.map((q, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-3 border-t border-border pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-start gap-1.5 text-foreground">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="break-words">{q.question}</span>
                  </span>
                  <p className="break-words pl-[19px] text-[0.6875rem] text-muted-foreground">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString() })}
                  </p>
                </div>
                <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:shrink-0">
                  <Button size="sm" variant="outline" className="min-h-11 min-w-[8rem] flex-1 justify-center whitespace-normal text-center sm:flex-none" onClick={() => addToKb(q.question)}>
                    <Sparkles size={12} /> {t("chatbot.actions.addToKb")}
                  </Button>
                  <Button size="sm" variant="outline" className="min-h-11 min-w-[8rem] flex-1 justify-center whitespace-normal text-center sm:flex-none" disabled={draftingQuestion === q.question} onClick={() => draftAnswer(q.question)}>
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
        {stats.notHelpfulAnswered.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.notHelpful.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.notHelpfulAnswered.map((q, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-3 border-t border-border pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-start gap-1.5 text-foreground">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="break-words">{q.question}</span>
                  </span>
                  <p className="break-words pl-[19px] text-[0.6875rem] text-muted-foreground">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString() })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full justify-center whitespace-normal text-center sm:w-auto"
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
        {stats.topEscalated.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("chatbot.topEscalated.empty")}</p>
        ) : (
          <div className="space-y-2">
            {stats.topEscalated.map((q, i) => (
              <div key={i} className="flex min-w-0 flex-col gap-3 border-t border-border pt-3 text-sm first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0 flex-1">
                  <span className="flex min-w-0 items-start gap-1.5 text-foreground">
                    <MessageSquareText size={13} className="text-muted-foreground shrink-0" />
                    <span className="break-words">{q.question}</span>
                  </span>
                  <p className="break-words pl-[19px] text-[0.6875rem] text-muted-foreground">
                    {t("chatbot.questionMeta", { count: q.count, date: new Date(q.lastAskedAt).toLocaleDateString() })}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  className="min-h-11 w-full justify-center whitespace-normal text-center sm:w-auto"
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
      </>}

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
            onChange={(e) => { setForm((f) => ({ ...f, title: e.target.value, reviewConfirmed: false })); setFormChanged(true); setDraftPersisted(false); }}
            placeholder={t("chatbot.form.title")}
            className={`${adminFilterControlClassName} w-full`}
          />
          <textarea
            value={form.body}
            onChange={(e) => { setForm((f) => ({ ...f, body: e.target.value, reviewConfirmed: false })); setFormChanged(true); setDraftPersisted(false); }}
            placeholder={t("chatbot.form.body")}
            rows={4}
            className={`${adminFilterControlClassName} min-h-24 w-full py-2`}
          />
          <div className="flex gap-2 flex-wrap">
            <input
              value={form.keywords}
              onChange={(e) => { setForm((f) => ({ ...f, keywords: e.target.value, reviewConfirmed: false })); setFormChanged(true); setDraftPersisted(false); }}
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
              onChange={(e) => { setForm((f) => ({ ...f, category: e.target.value, reviewConfirmed: false })); setFormChanged(true); setDraftPersisted(false); }}
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
          </div>
          <textarea
            value={form.sourceRefs}
            onChange={(e) => { setForm((f) => ({ ...f, sourceRefs: e.target.value, reviewConfirmed: false })); setFormChanged(true); setDraftPersisted(false); }}
            placeholder={t("chatbot.form.sources")}
            rows={2}
            className={`${adminFilterControlClassName} min-h-16 w-full py-2`}
            aria-label={t("chatbot.form.sources")}
          />
          <p className="text-xs text-muted-foreground">{t("chatbot.form.sourcesHint")}</p>
          {draftPersisted && !formChanged && <label className="flex items-start gap-2 text-sm text-foreground">
            <input type="checkbox" checked={form.reviewConfirmed} onChange={(e) => setForm((f) => ({ ...f, reviewConfirmed: e.target.checked }))} />
            <span>{t("chatbot.form.reviewConfirmation")}</span>
          </label>}
          {formError && <p className="text-[0.6875rem] text-destructive">{formError}</p>}
          <div className="flex gap-2">
            <Button size="sm" onClick={saveDoc} disabled={saving || !form.title.trim() || !form.body.trim()}>
              {saving ? t("chatbot.saving") : t("chatbot.actions.saveDraft")}
            </Button>
            {draftPersisted && !formChanged && <Button size="sm" onClick={publishDraft} disabled={saving || publishing || !form.reviewConfirmed || form.sourceRefs.split("\n").every((source) => !source.trim())}>
              {publishing ? t("chatbot.publishing") : t("chatbot.actions.publish")}
            </Button>}
            <Button size="sm" variant="outline" onClick={() => setEditingId(null)} disabled={saving}>
              {t("common.actions.cancel")}
            </Button>
          </div>
        </div>
      )}

      {docsError && <EmptyState
        title={t("chatbot.errors.loadDocsTitle")}
        description={t("chatbot.errors.loadDescription")}
        action={<Button size="sm" variant="outline" onClick={() => void loadDocs()}>{t("chatbot.errors.retry")}</Button>}
      />}
      {docs === undefined && <p className="text-sm text-muted-foreground">{t("chatbot.loading")}</p>}
      {docs !== null && docs !== undefined && <>
      <div className="overflow-hidden rounded-2xl border border-border bg-card" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.07)" }}>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3 text-xs"><input type="checkbox" aria-label={t("chatbot.accessibility.selectAll")} checked={sortedDocs.some((doc) => doc.isActive) && sortedDocs.filter((doc) => doc.isActive).every((doc) => selectedDocIds.has(doc.id))} onChange={(event) => setSelectedDocIds(event.target.checked ? new Set(sortedDocs.filter((doc) => doc.isActive).map((doc) => doc.id)) : new Set())} /><span className="text-muted-foreground">{t("chatbot.selectAll")}</span></div>
        <AdminBatchActionBar selectedCount={sortedDocs.filter((doc) => selectedDocIds.has(doc.id) && doc.isActive).length} onClear={() => setSelectedDocIds(new Set())} onApply={() => void applyBatch()} actions={[{ value: "deactivate", label: t("batchActions.deactivate") }]} busy={batchBusy} />
        {sortedDocs.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">{t("chatbot.emptyDocuments")}</p>
        ) : (
          <div className="divide-y divide-border">
            {sortedDocs.map((d) => (
              <div key={d.id} className="flex min-w-0 flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center">
                <input type="checkbox" aria-label={t("chatbot.accessibility.selectDocument", { title: d.title })} checked={selectedDocIds.has(d.id)} disabled={!d.isActive} onChange={(event) => setSelectedDocIds((previous) => { const next = new Set(previous); if (event.target.checked) next.add(d.id); else next.delete(d.id); return next; })} />
                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-semibold text-foreground">
                    {d.title} {!d.isActive && <span className="text-muted-foreground font-normal">({t("chatbot.inactive")})</span>} {d.pendingRevision && <span className="text-amber-700 dark:text-amber-300 font-normal">· {t("chatbot.pendingReview")}</span>}
                  </p>
                  <p className="break-words text-xs text-muted-foreground">
                    {d.category ? t(`chatbot.categories.${d.category}`) : t("chatbot.uncategorized")} · {d.hasEmbedding ? t("chatbot.embedded") : t("chatbot.notEmbedded")}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => startEdit(d)}>
                  {d.pendingRevision ? t("chatbot.actions.reviewDraft") : t("chatbot.actions.edit")}
                </Button>
                <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => toggleActive(d)}>
                  {d.isActive ? t("batchActions.deactivate") : d.pendingRevision ? t("chatbot.actions.reviewDraft") : t("chatbot.actions.edit")}
                </Button>
                {d.isActive && !d.hasEmbedding && <Button size="sm" variant="outline" className="min-h-11 w-full sm:w-auto" onClick={() => void runReindex(d.id)} disabled={reindexing}>
                  {t("chatbot.actions.reindexEntry")}
                </Button>}
              </div>
            ))}
          </div>
        )}
      </div>
      <Pagination
        ariaLabel={t("chatbot.knowledgeBase")}
        currentPage={docsPage}
        totalPages={docsTotalPages}
        totalItems={docsTotal}
        pageSize={10}
        onPageChange={(nextPage) => {
          setSelectedDocIds(new Set());
          setDocsPage(nextPage);
        }}
      />
      </>}
    </AdminPageShell>
  );
}
