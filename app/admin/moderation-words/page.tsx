"use client";

// Admin-editable profanity/slur word list — supplements the hardcoded lists
// in lib/moderation/wordlists.ts so a non-English word can be censored
// without a code deploy. See lib/moderation/custom-words.ts.

import { useEffect, useState } from "react";
import { Plus, ShieldBan, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/shared/empty-state";
import { useActionFeedback } from "@/components/providers/action-feedback";
import { AdminPageHeader, AdminPageShell } from "@/components/admin/admin-page-shell";
import { adminFilterControlClassName } from "@/components/admin/filter-bar";

interface CustomWord {
  id: string;
  term: string;
  category: "profanity" | "slur";
  language: string | null;
  isActive: boolean;
  createdAt: string;
}

const EMPTY_FORM: { term: string; category: CustomWord["category"]; language: string } = { term: "", category: "profanity", language: "" };

export default function ModerationWordsPage() {
  const { t } = useTranslation("admin");
  const { showFeedback } = useActionFeedback();
  const [words, setWords] = useState<CustomWord[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/moderation-words", { cache: "no-store" });
      const body = (await res.json()) as { data?: CustomWord[] };
      setWords(body.data ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { queueMicrotask(() => { void load(); }); }, []);

  async function addWord() {
    if (!form.term.trim() || saving) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/moderation-words", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term: form.term.trim(), category: form.category, language: form.language.trim() || undefined }),
      });
      const body = (await res.json()) as { data?: CustomWord; error?: { message?: string } };
      if (!res.ok || !body.data) throw new Error(body.error?.message ?? t("moderationWords.errors.add"));
      setWords((prev) => [body.data as CustomWord, ...prev]);
      setForm(EMPTY_FORM);
      showFeedback("success", t("moderationWords.success.added"));
    } catch (err) {
      showFeedback("error", err instanceof Error ? err.message : t("moderationWords.errors.add"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(word: CustomWord) {
    const nextActive = !word.isActive;
    setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, isActive: nextActive } : w)));
    const res = await fetch(`/api/admin/moderation-words/${word.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: nextActive }),
    });
    if (!res.ok) {
      setWords((prev) => prev.map((w) => (w.id === word.id ? { ...w, isActive: word.isActive } : w)));
      showFeedback("error", t("moderationWords.errors.update"));
    }
  }

  async function removeWord(word: CustomWord) {
    if (!window.confirm(t("moderationWords.confirmDelete", { term: word.term }))) return;
    setWords((prev) => prev.filter((w) => w.id !== word.id));
    const res = await fetch(`/api/admin/moderation-words/${word.id}`, { method: "DELETE" });
    if (!res.ok) {
      showFeedback("error", t("moderationWords.errors.remove"));
      void load();
    } else {
      showFeedback("success", t("moderationWords.success.removed"));
    }
  }

  return (
    <AdminPageShell>
      <AdminPageHeader
        eyebrow={<span className="flex items-center gap-2"><ShieldBan size={14} /> {t("moderationWords.eyebrow")}</span>}
        title={t("moderationWords.title")}
        description={t("moderationWords.description")}
      />

      <section className="rounded-2xl border border-border bg-card p-5">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto] sm:items-end">
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-foreground">{t("moderationWords.form.term")}</span>
            <input
              value={form.term}
              onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") void addWord(); }}
              className={adminFilterControlClassName}
              placeholder={t("moderationWords.form.termPlaceholder")}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-foreground">{t("moderationWords.form.category")}</span>
            <select
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value as CustomWord["category"] }))}
              className={adminFilterControlClassName}
            >
              <option value="profanity">{t("moderationWords.category.profanity")}</option>
              <option value="slur">{t("moderationWords.category.slur")}</option>
            </select>
          </label>
          <label className="text-sm">
            <span className="mb-1.5 block font-medium text-foreground">{t("moderationWords.form.language")}</span>
            <input
              value={form.language}
              onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))}
              className={adminFilterControlClassName}
              placeholder={t("moderationWords.form.languagePlaceholder")}
            />
          </label>
          <Button onClick={() => void addWord()} disabled={saving || !form.term.trim()}>
            <Plus size={15} /> {t("moderationWords.form.add")}
          </Button>
        </div>
      </section>

      <section className="mt-5 rounded-2xl border border-border bg-card p-5">
        {loading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">{t("moderationWords.loading")}</p>
        ) : words.length === 0 ? (
          <EmptyState title={t("moderationWords.empty")} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="py-3 pr-3">{t("moderationWords.table.term")}</th>
                  <th className="py-3 pr-3">{t("moderationWords.table.category")}</th>
                  <th className="py-3 pr-3">{t("moderationWords.table.language")}</th>
                  <th className="py-3 pr-3">{t("moderationWords.table.status")}</th>
                  <th className="py-3 pr-3" />
                </tr>
              </thead>
              <tbody>
                {words.map((word) => (
                  <tr key={word.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-medium text-foreground">{word.term}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{t(`moderationWords.category.${word.category}`)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{word.language ?? "—"}</td>
                    <td className="py-3 pr-3">
                      <button
                        onClick={() => void toggleActive(word)}
                        className={`rounded-full px-2.5 py-1 text-xs font-medium ${word.isActive ? "bg-emerald-100 text-emerald-800" : "bg-secondary text-muted-foreground"}`}
                      >
                        {word.isActive ? t("moderationWords.status.active") : t("moderationWords.status.inactive")}
                      </button>
                    </td>
                    <td className="py-3 pr-3 text-right">
                      <button
                        onClick={() => void removeWord(word)}
                        aria-label={t("moderationWords.table.remove")}
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPageShell>
  );
}
