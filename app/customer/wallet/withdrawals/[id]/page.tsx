"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ArrowRight, CheckCircle2, Printer, ReceiptText, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { useAuth } from "@/components/providers/auth";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";
import type { CustomerSettlementProof } from "@/lib/payouts/settlement-proof";

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
  settlementProof: CustomerSettlementProof | null;
};

export default function WithdrawalReceiptPage() {
  const { t: tCustomer, i18n } = useTranslation("customer");
  const { currentUser } = useAuth();
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const loadReceipt = useCallback(async (silent = false) => {
    if (!currentUser) return;
    const id = window.location.pathname.split("/").filter(Boolean).at(-1);
    if (!id) {
      setError(tCustomer("ui.states.noReceipt"));
      setLoading(false);
      return;
    }
    if (!silent) setLoading(true);
    try {
      const response = await fetch(`/api/wallet/withdrawals/${id}/receipt`, { cache: "no-store" });
      const body = await response.json() as { data?: Receipt; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(tCustomer("ui.states.noReceipt"));
      setReceipt(body.data);
      setError("");
    } catch {
      if (!silent) setError(tCustomer("ui.states.loadingError"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [currentUser, tCustomer]);

  useEffect(() => {
    if (!currentUser) {
      setReceipt(null);
      setError("");
      setLoading(false);
      return;
    }
    void loadReceipt();
  }, [currentUser, loadReceipt]);

  useEffect(() => {
    if (!receipt || !["approved", "processing"].includes(receipt.status)) return;
    let inFlight = false;
    const interval = window.setInterval(() => {
      if (inFlight) return;
      inFlight = true;
      void loadReceipt(true).finally(() => { inFlight = false; });
    }, 2_000);
    return () => window.clearInterval(interval);
  }, [loadReceipt, receipt]);

  if (!currentUser) {
    return <main className="mx-auto max-w-2xl px-5 py-8"><GuestAccountEmptyState title={tCustomer("ui.states.noReceipt")} description={tCustomer("ui.guest.accountHint")} nextPath="/customer/wallet" /></main>;
  }

  const proof = receipt?.settlementProof;
  const movement = proof?.moneyMovement;
  const movementDestination = movement?.to === "withdrawn_earnings"
    ? tCustomer("strictMigration.walletReceipt.moneyMovement.withdrawn")
    : movement?.to === "earnings"
    ? tCustomer("strictMigration.walletReceipt.moneyMovement.earnings")
    : tCustomer("strictMigration.walletReceipt.moneyMovement.pending");
  const formatAmount = (amountSen: number) => `${MYR_CODE} ${(amountSen / 100).toFixed(2)}`;
  const eventHash = proof?.event?.payloadSha256
    ? `${proof.event.payloadSha256.slice(0, 12)}…${proof.event.payloadSha256.slice(-8)}`
    : null;

  return <main className="mx-auto max-w-2xl px-5 py-8 print:px-0">
    <div className="mb-6 flex items-center justify-between print:hidden">
      <Link href="/customer/wallet" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={16} /> {tCustomer("strictMigration.walletReceipt.backToWallet")}</Link>
      {receipt && <Button variant="outline" size="sm" onClick={() => window.print()}><Printer size={15} className="mr-2" /> {tCustomer("ui.actions.printReceipt")}</Button>}
    </div>
    {loading ? <div className="rounded-2xl border border-border bg-card p-10 text-center text-muted-foreground">{tCustomer("ui.states.loadingReceipt")}</div> : error ? <div role="alert" className="rounded-2xl border border-destructive/30 bg-card p-10 text-center text-destructive"><p>{error}</p><p className="mt-2 text-sm">{tCustomer("ui.states.loadingError")}</p></div> : receipt && <section className="rounded-2xl border border-border bg-card p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4 border-b border-border pb-5"><div><p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">{tCustomer("strictMigration.walletReceipt.eyebrow")}</p><h1 className="mt-1 text-2xl font-bold">{tCustomer("strictMigration.walletReceipt.title")}</h1><p className="mt-1 text-sm text-muted-foreground">{receipt.reference}</p></div><ReceiptText size={30} className="text-primary" /></div>
      <div className="grid grid-cols-2 gap-4 py-6 text-sm"><div><p className="text-xs text-muted-foreground">{tCustomer("ui.checkout.total")}</p><p className="mt-1 font-mono text-xl font-bold">{MYR_CODE} {receipt.amountRm.toFixed(2)}</p></div><div><p className="text-xs text-muted-foreground">{tCustomer("ui.labels.status")}</p><div className="mt-2"><StatusBadge status={receipt.status} /></div></div><div><p className="text-xs text-muted-foreground">{tCustomer("ui.labels.date")}</p><p className="mt-1">{new Date(receipt.createdAt).toLocaleString(i18n.resolvedLanguage)}</p></div><div><p className="text-xs text-muted-foreground">{tCustomer("ui.labels.history")}</p><p className="mt-1">{new Date(receipt.updatedAt).toLocaleString(i18n.resolvedLanguage)}</p></div></div>
      <div className="rounded-xl bg-muted/40 p-4 text-sm"><p className="font-semibold">{tCustomer("strictMigration.walletReceipt.payoutDestination")}</p><p className="mt-1 text-muted-foreground">{receipt.destinationLabel ?? tCustomer("strictMigration.walletReceipt.defaultDestination")}</p>{receipt.payoutReference && <p className="mt-1 text-xs text-muted-foreground">{tCustomer("strictMigration.walletReceipt.payoutReference", { reference: receipt.payoutReference })}</p>}</div>
      {receipt.statusGuidanceCode && <div role="status" className="mt-4 rounded-xl border border-border bg-muted/30 p-4 text-sm"><p className="font-semibold">{tCustomer(`strictMigration.walletReceipt.guidance.${receipt.statusGuidanceCode}.title`)}</p><p className="mt-1 text-muted-foreground">{tCustomer(`strictMigration.walletReceipt.guidance.${receipt.statusGuidanceCode}.message`)}</p></div>}

      {movement && <section className="mt-4 rounded-xl border border-border p-4 text-sm">
        <h2 className="font-semibold">{tCustomer("strictMigration.walletReceipt.moneyMovement.title")}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="rounded-lg bg-muted px-3 py-2"><p className="text-xs text-muted-foreground">{tCustomer("strictMigration.walletReceipt.moneyMovement.reserved")}</p><p className="font-mono font-semibold">−{formatAmount(movement.amountSen)}</p></div>
          <ArrowRight size={18} className="text-muted-foreground" />
          <div className="rounded-lg bg-primary/10 px-3 py-2"><p className="text-xs text-muted-foreground">{movementDestination}</p><p className="font-mono font-semibold">{movement.to ? `+${formatAmount(movement.amountSen)}` : formatAmount(movement.amountSen)}</p></div>
        </div>
      </section>}

      {proof && <section className="mt-4 rounded-xl border border-border p-4 text-sm">
        <h2 className="font-semibold">{tCustomer("strictMigration.walletReceipt.timeline.title")}</h2>
        <ol className="mt-3 space-y-2 text-xs text-muted-foreground">
          <li className="flex gap-2"><CheckCircle2 size={14} className="text-nature-green" />{tCustomer("strictMigration.walletReceipt.timeline.requested")}</li>
          <li className="flex gap-2"><CheckCircle2 size={14} className="text-nature-green" />{tCustomer("strictMigration.walletReceipt.timeline.submitted")}</li>
          <li className="flex gap-2"><CheckCircle2 size={14} className={proof.event ? "text-nature-green" : "text-muted-foreground"} />{tCustomer("strictMigration.walletReceipt.timeline.callbackVerified")}</li>
          <li className="flex gap-2"><CheckCircle2 size={14} className={movement?.to ? "text-nature-green" : "text-muted-foreground"} />{tCustomer("strictMigration.walletReceipt.timeline.ledgerSettled")}</li>
        </ol>
      </section>}

      {proof?.event && <section className="mt-4 rounded-xl border border-nature-green/30 bg-nature-green/5 p-4 text-sm">
        <div className="flex items-center justify-between gap-3"><h2 className="font-semibold">{tCustomer("strictMigration.walletReceipt.proof.title")}</h2>{proof.event.signatureVerified && <span className="inline-flex items-center gap-1 rounded-full bg-nature-green/15 px-2 py-1 text-xs font-semibold text-nature-green-ink"><ShieldCheck size={13} />{tCustomer("strictMigration.walletReceipt.proof.verified")}</span>}</div>
        <dl className="mt-3 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-muted-foreground">{tCustomer("strictMigration.walletReceipt.proof.eventId")}</dt><dd className="break-all font-mono">{proof.event.id}</dd></div><div><dt className="text-muted-foreground">{tCustomer("strictMigration.walletReceipt.proof.amount")}</dt><dd>{formatAmount(proof.event.amountSen)} {proof.event.currency}</dd></div><div><dt className="text-muted-foreground">{tCustomer("strictMigration.walletReceipt.proof.providerTime")}</dt><dd>{new Date(proof.event.providerOccurredAt).toLocaleString(i18n.resolvedLanguage)}</dd></div><div><dt className="text-muted-foreground">{tCustomer("strictMigration.walletReceipt.proof.receivedTime")}</dt><dd>{new Date(proof.event.receivedAt).toLocaleString(i18n.resolvedLanguage)}</dd></div>{eventHash && <div className="sm:col-span-2"><dt className="text-muted-foreground">{tCustomer("strictMigration.walletReceipt.proof.payloadHash")}</dt><dd className="font-mono">{eventHash}</dd></div>}</dl>
        <p className="mt-3 text-xs text-muted-foreground">{tCustomer("strictMigration.walletReceipt.proof.immutableNotice")}</p>
      </section>}

      {receipt.customerReason && <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm"><p className="font-semibold">{tCustomer("strictMigration.walletReceipt.reviewNote")}</p><p className="mt-1">{receipt.customerReason}</p></div>}
      <p className="mt-6 text-xs text-muted-foreground">{tCustomer("strictMigration.walletReceipt.settlementNotice", { provider: receipt.payoutProvider === "tng_direct_credit" ? "Touch 'n Go eWallet" : "Stripe Connect" })}</p>
    </section>}
  </main>;
}
