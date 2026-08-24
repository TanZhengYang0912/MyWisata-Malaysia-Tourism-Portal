"use client";

import Link from "next/link";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { WithdrawalRequest } from "@/backend/core/types";
import { StatusBadge } from "@/components/shared/status-badge";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

export function WithdrawalList({ pending, history }: { pending: WithdrawalRequest[]; history: WithdrawalRequest[] }) {
  const { t, i18n } = useTranslation("customer");
  const locale = i18n.language === "en" ? "en-MY" : i18n.language;
  return <>
    {pending.length > 0 && <section className="mb-4 overflow-hidden rounded-2xl border border-border bg-card"><div className="flex items-center gap-2 border-b border-border px-5 py-4"><Clock size={14} className="text-accent" /><h2 className="text-sm font-bold text-foreground">{t("ui.wallet.inProgress", { count: pending.length })}</h2></div><div className="divide-y divide-border">{pending.map((w) => (
      <Link key={w.id} href={`/customer/wallet/withdrawals/${w.id}`} className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"><div><p className="text-sm font-semibold text-foreground">{w.destination}</p><p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString(locale)}</p></div><div className="text-right"><p className="font-[family-name:var(--font-mono)] font-bold text-foreground">{MYR_CODE} {w.amount.toFixed(2)}</p><StatusBadge status={w.status} /></div></Link>
    ))}</div></section>}
    <section className="overflow-hidden rounded-2xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="text-sm font-bold text-foreground">{t("ui.wallet.transactionHistory")}</h2></div>{history.length === 0 && pending.length === 0 ? <div className="px-5 py-8 text-center text-sm text-muted-foreground">{t("ui.wallet.noTransactions")}</div> : history.length === 0 ? <div className="px-5 py-6 text-center text-sm text-muted-foreground">{t("ui.wallet.noCompletedTransactions")}</div> : <div className="divide-y divide-border">{history.map((w) => (
      <Link key={w.id} href={`/customer/wallet/withdrawals/${w.id}`} className="flex cursor-pointer items-center justify-between gap-3 px-5 py-3.5 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"><div className="flex items-center gap-3">{w.status === "completed" || w.status === "paid" || w.status === "approved" ? <CheckCircle2 size={16} className="shrink-0 text-primary" /> : w.status === "failed" || w.status === "rejected" ? <XCircle size={16} className="shrink-0 text-destructive" /> : <Clock size={16} className="shrink-0 text-accent" />}<div><p className="text-sm text-foreground">{w.destination}</p><p className="text-xs text-muted-foreground">{new Date(w.createdAt).toLocaleDateString(locale)}</p></div></div><div className="text-right"><p className="font-[family-name:var(--font-mono)] font-bold text-foreground">{MYR_CODE} {w.amount.toFixed(2)}</p><StatusBadge status={w.status} /></div></Link>
    ))}</div>}</section>
  </>;
}
