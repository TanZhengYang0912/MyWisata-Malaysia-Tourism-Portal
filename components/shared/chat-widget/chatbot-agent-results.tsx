"use client";

// What the customer chatbot agent returns besides its text: listing links, a
// comparison table, and refund confirm cards (lib/chatbot/agent.ts). A refund
// card has not run: Confirm sends the prepared request to the existing refund
// route from this browser session, so that route's checks decide.

import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { toRM } from "@/lib/money";
import type { ChatListing, RefundProposal } from "@/lib/chatbot/agent";

export function ChatbotListingLinks({ listings }: { listings: ChatListing[] }) {
  return (
    <ul className="mt-1.5 max-w-[85%] space-y-1">
      {listings.map((listing) => (
        <li key={listing.id}>
          <Link href={listing.href} className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs hover:bg-secondary">
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium text-foreground">{listing.name}</span>
              <span className="block truncate text-muted-foreground">{listing.shop} · {listing.area}</span>
            </span>
            <span className="shrink-0 text-right">
              <span className="block font-semibold text-foreground">{toRM(listing.price)}</span>
              {listing.reviews > 0 && (
                <span className="flex items-center justify-end gap-0.5 text-muted-foreground">
                  <Star size={10} className="fill-current" /> {listing.rating.toFixed(1)}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

export function ChatbotComparisonTable({ rows }: { rows: ChatListing[] }) {
  const { t } = useTranslation("common");
  const fields: { key: string; value: (row: ChatListing) => string }[] = [
    { key: "price", value: (row) => toRM(row.price) },
    { key: "rating", value: (row) => (row.reviews > 0 ? `${row.rating.toFixed(1)} (${row.reviews})` : "-") },
    { key: "shop", value: (row) => row.shop },
    { key: "area", value: (row) => row.area },
    { key: "hours", value: (row) => row.hours || "-" },
  ];
  return (
    <div className="mt-1.5 max-w-full overflow-x-auto rounded-lg border border-border bg-background">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border">
            <th className="px-2 py-1.5 text-left font-medium text-muted-foreground" />
            {rows.map((row) => (
              <th key={row.id} className="min-w-24 px-2 py-1.5 text-left font-semibold text-foreground">
                <Link href={row.href} className="hover:underline">{row.name}</Link>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {fields.map((field) => (
            <tr key={field.key} className="border-b border-border/60 last:border-0">
              <th scope="row" className="px-2 py-1.5 text-left font-medium text-muted-foreground">{t(`chatbot.agent.compare.${field.key}`)}</th>
              {rows.map((row) => <td key={row.id} className="px-2 py-1.5 text-foreground">{field.value(row)}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type RefundState = "pending" | "running" | "done" | "cancelled" | "failed";

export function ChatbotRefundCard({ refund }: { refund: RefundProposal }) {
  const { t } = useTranslation("common");
  const [state, setState] = useState<RefundState>("pending");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    // Only same-origin API routes; the server built this, but never follow anything else.
    if (!refund.request.url.startsWith("/api/")) return;
    setState("running");
    try {
      const res = await fetch(refund.request.url, {
        method: refund.request.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(refund.request.body),
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

  const rows: [string, string][] = [
    ["order", refund.orderRef],
    ["items", refund.items],
    ["total", toRM(refund.total)],
    ["reason", refund.reason],
  ];
  return (
    <div data-chatbot-refund className="mt-1.5 max-w-[85%] rounded-lg border border-border bg-background p-2.5 text-xs">
      <p className="font-semibold text-foreground">{t("chatbot.agent.refund.title")}</p>
      <dl className="mt-1.5 space-y-1">
        {rows.map(([key, value]) => (
          <div key={key} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-2">
            <dt className="text-muted-foreground">{t(`chatbot.agent.refund.${key}`)}</dt>
            <dd className="break-words text-foreground">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        {state === "pending" || state === "running" ? (
          <>
            <Button size="sm" className="h-7 px-2.5 text-xs" onClick={confirm} disabled={state === "running"}>
              {state === "running" ? t("chatbot.agent.refund.running") : t("chatbot.agent.refund.confirm")}
            </Button>
            <Button size="sm" variant="ghost" className="h-7 px-2.5 text-xs" onClick={() => setState("cancelled")} disabled={state === "running"}>
              {t("chatbot.agent.refund.cancel")}
            </Button>
          </>
        ) : (
          <span className={`font-medium ${state === "failed" ? "text-destructive" : "text-muted-foreground"}`}>
            {t(`chatbot.agent.refund.${state}`)}{error ? `: ${error}` : ""}
          </span>
        )}
      </div>
    </div>
  );
}
