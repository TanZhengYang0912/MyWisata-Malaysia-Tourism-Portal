"use client";

// A change the AI assistant proposed. Nothing has run: Confirm sends the
// prepared request to the existing admin route from this browser session,
// so that route's own permission and validation checks decide.

import Link from "next/link";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ChoiceList, ProposedAction } from "@/lib/admin-ai/actions";

type CardState = "pending" | "running" | "done" | "cancelled" | "failed";

export function AdminAiActionCard({ action }: { action: ProposedAction }) {
  const { t } = useTranslation("admin");
  const [state, setState] = useState<CardState>("pending");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    // Only same-origin API routes; the server built this, but never follow anything else.
    if (!action.request.url.startsWith("/api/")) return;
    setState("running");
    try {
      const res = await fetch(action.request.url, {
        method: action.request.method,
        headers: action.request.body ? { "Content-Type": "application/json" } : undefined,
        body: action.request.body ? JSON.stringify(action.request.body) : undefined,
      });
      if (res.ok) {
        setState("done");
        return;
      }
      const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
      setError(body?.error?.message ?? null);
      setState("failed");
    } catch {
      setState("failed");
    }
  }

  return (
    <div data-ai-action={action.action} className="w-full max-w-[85%] rounded-xl border border-border bg-background p-3 text-sm shadow-sm lg:max-w-3xl">
      <p className="font-semibold text-foreground">{t(`aiAssistant.actions.${action.action}`)}</p>
      {action.details.length > 0 && (
        <dl className="mt-2 space-y-1">
          {action.details.map((detail) => (
            <div key={detail.field} className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-2">
              <dt className="text-muted-foreground">{t(`aiAssistant.fields.${detail.field}`)}</dt>
              <dd className="break-words whitespace-pre-wrap text-foreground">
                {detail.field === "active" ? t(`aiAssistant.card.${detail.value}`) : detail.value}
              </dd>
            </div>
          ))}
        </dl>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {state === "pending" || state === "running" ? (
          <>
            <Button size="sm" onClick={confirm} disabled={state === "running"}>
              {state === "running" ? t("aiAssistant.card.running") : t("aiAssistant.card.confirm")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState("cancelled")} disabled={state === "running"}>
              {t("aiAssistant.card.cancel")}
            </Button>
            <span className="text-xs text-muted-foreground">{t("aiAssistant.card.pending")}</span>
            {action.link && (
              <Link href={action.link} target="_blank" className="ml-auto text-xs font-medium text-primary hover:underline">
                {t("aiAssistant.card.open")}
              </Link>
            )}
          </>
        ) : (
          <span className={`text-xs font-medium ${state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
            {t(`aiAssistant.card.${state}`)}{error ? `: ${error}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * An on/off table the assistant offered. Nothing has run: flipping a switch
 * only stages it, and Save sends one PATCH per changed row to the existing
 * admin route from this browser session, so that route's checks decide.
 */
export function AdminAiChoiceTable({ choices }: { choices: ChoiceList }) {
  const { t } = useTranslation("admin");
  const [rows, setRows] = useState(choices.rows);
  const [next, setNext] = useState<Record<string, boolean>>(() => Object.fromEntries(choices.rows.map((row) => [row.key, row.active])));
  const [results, setResults] = useState<Record<string, "done" | "failed">>({});
  const [saving, setSaving] = useState(false);
  const changed = rows.filter((row) => next[row.key] !== row.active);

  async function save() {
    setSaving(true);
    // One at a time: at most ~100 small PATCHes, and each result is shown on its row.
    for (const row of changed) {
      const isActive = next[row.key];
      let ok = false;
      if (row.request.url.startsWith("/api/")) {
        try {
          const res = await fetch(row.request.url, {
            method: row.request.method,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...row.request.body, isActive }),
          });
          ok = res.ok;
        } catch {
          ok = false;
        }
      }
      setResults((current) => ({ ...current, [row.key]: ok ? "done" : "failed" }));
      if (ok) setRows((current) => current.map((r) => (r.key === row.key ? { ...r, active: isActive } : r)));
      else setNext((current) => ({ ...current, [row.key]: row.active }));
    }
    setSaving(false);
  }

  return (
    <div data-ai-choices={choices.action} className="w-full max-w-[85%] rounded-xl border border-border bg-background p-3 text-sm shadow-sm lg:max-w-3xl">
      <p className="font-semibold text-foreground">{t(`aiAssistant.actions.${choices.action}`)}</p>
      <div className="mt-2 max-h-80 overflow-y-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="py-2 pr-3">{t("aiAssistant.choices.name")}</th>
              <th className="w-24 py-2 pr-3">{t("aiAssistant.choices.active")}</th>
              <th className="w-6 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className="border-b border-border/60 last:border-0">
                <td className="break-words py-2 pr-3 text-foreground">{row.label}</td>
                <td className="py-2 pr-3">
                  <label className="flex items-center gap-2 text-muted-foreground">
                    <input
                      type="checkbox"
                      role="switch"
                      aria-label={row.label}
                      checked={next[row.key]}
                      onChange={(event) => setNext((current) => ({ ...current, [row.key]: event.target.checked }))}
                      disabled={saving}
                      className="h-4 w-4 accent-primary"
                    />
                    {t(`aiAssistant.card.${next[row.key] ? "on" : "off"}`)}
                  </label>
                </td>
                <td className="py-2">
                  {results[row.key] === "done" && <Check size={14} className="text-primary" aria-label={t("aiAssistant.card.done")} />}
                  {results[row.key] === "failed" && <X size={14} className="text-destructive" aria-label={t("aiAssistant.card.failed")} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={saving || changed.length === 0}>
          {saving ? t("aiAssistant.card.running") : t("aiAssistant.choices.save", { count: changed.length })}
        </Button>
      </div>
    </div>
  );
}
