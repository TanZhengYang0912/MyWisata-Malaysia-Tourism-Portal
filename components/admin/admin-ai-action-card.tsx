"use client";

// A change the AI assistant proposed. Nothing has run: Confirm sends the
// prepared request to the existing admin route from this browser session,
// so that route's own permission and validation checks decide.

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import type { ProposedAction } from "@/lib/admin-ai/actions";

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
