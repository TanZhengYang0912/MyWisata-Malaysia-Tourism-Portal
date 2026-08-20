"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Printer, ReceiptText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/components/providers/auth";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

type Receipt = {
  id: string;
  reference: string;
  amountRm: number;
  status: string;
  createdAt: string;
  updatedAt: string;
  destinationLabel: string | null;
  payoutProvider: "stripe_connect" | "tng_direct_credit";
  payoutReference: string | null;
  customerReason: string | null;
  statusGuidanceCode: "failed" | "processing" | "approvedReconciliation" | "approved" | "completed" | null;
};

export default function WithdrawalReceiptPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser) {
      setReceipt(null);
      setError("");
      setLoading(false);
      return;
    }
    let active = true;
    setLoading(true);
    const id = window.location.pathname.split("/").filter(Boolean).at(-1);
    if (!id) { setError(tCustomer("ui.states.noReceipt")); setLoading(false); return; }
    fetch(`/api/wallet/withdrawals/${id}/receipt`)
      .then(async (response) => {
        const body = await response.json() as { data?: Receipt; error?: { message?: string } };
        if (!response.ok || !body.data) throw new Error(tCustomer("ui.states.noReceipt"));
        if (active) setReceipt(body.data);
      })
    .catch(() => { if (active) setError(tCustomer("ui.states.loadingError")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [currentUser, tCustomer]);

  if (!currentUser) return <main className="mx-auto max-w-2xl px-5 py-8"><GuestAccountEmptyState title={tCustomer("ui.states.noReceipt")} description={tCustomer("ui.guest.accountHint")} nextPath="/customer/wallet" /></main>;

  return <main className="max-w-2xl mx-auto px-5 py-8 print:px-0">
    <div className="flex items-center justify-between mb-6 print:hidden">
      <Link href="/customer/wallet" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> {tCustomer("strictMigration.walletReceipt.backToWallet")}</Link>
      {receipt && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={15} className="mr-2" /> {tCustomer("ui.actions.printReceipt")}</Button>}
    </div>
    {loading ? <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">{tCustomer("ui.states.loadingReceipt")}</div> : error ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-10 text-center text-destructive"><p>{error}</p><p className="mt-2 text-sm">{tCustomer("ui.states.loadingError")}</p></div> : receipt && <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{tCustomer("strictMigration.walletReceipt.eyebrow")}</p><h1 className="mt-1 text-2xl font-bold">{tCustomer("strictMigration.walletReceipt.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{receipt.reference}</p></div><ReceiptText size={30} className="text-primary" /></div>
      <div className="grid grid-cols-2 gap-4 py-6 text-sm"><div><p className="text-xs text-muted-foreground">{tCustomer("ui.checkout.total")}</p><p className="mt-1 text-xl font-bold font-mono">{MYR_CODE} {receipt.amountRm.toFixed(2)}</p></div><div><p className="text-xs text-muted-foreground">{tCustomer("ui.labels.status")}</p><div className="mt-2"><StatusBadge status={receipt.status} /></div></div><div><p className="text-xs text-muted-foreground">{tCustomer("ui.labels.date")}</p><p className="mt-1">{new Date(receipt.createdAt).toLocaleString(i18n.resolvedLanguage)}</p></div><div><p className="text-xs text-muted-foreground">{tCustomer("ui.labels.history")}</p><p className="mt-1">{new Date(receipt.updatedAt).toLocaleString(i18n.resolvedLanguage)}</p></div></div>
      <div className="rounded-xl bg-muted/40 p-4 text-sm"><p className="font-semibold">{tCustomer("strictMigration.walletReceipt.payoutDestination")}</p><p className="mt-1 text-muted-foreground">{receipt.destinationLabel ?? tCustomer("strictMigration.walletReceipt.defaultDestination")}</p>{receipt.payoutReference && <p className="mt-1 text-xs text-muted-foreground">{tCustomer("strictMigration.walletReceipt.payoutReference", { reference: receipt.payoutReference })}</p>}</div>
      {receipt.statusGuidanceCode && <div role="status" className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm"><p className="font-semibold">{tCustomer(`strictMigration.walletReceipt.guidance.${receipt.statusGuidanceCode}.title`)}</p><p className="mt-1 text-muted-foreground">{tCustomer(`strictMigration.walletReceipt.guidance.${receipt.statusGuidanceCode}.message`)}</p></div>}
      {receipt.customerReason && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold">{tCustomer("strictMigration.walletReceipt.reviewNote")}</p><p className="mt-1">{receipt.customerReason}</p></div>}
      <p className="mt-6 text-xs text-muted-foreground">{tCustomer("strictMigration.walletReceipt.settlementNotice", { provider: receipt.payoutProvider === "tng_direct_credit" ? "Touch 'n Go eWallet" : "Stripe Connect" })}</p>
    </section>}
  </main>;
}
