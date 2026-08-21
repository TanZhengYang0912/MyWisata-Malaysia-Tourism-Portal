"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, ArrowDownCircle, CheckCircle2, Clock3, Info, Landmark, LoaderCircle, RefreshCw, Wallet, X, XCircle } from "lucide-react";
import { useAuth } from "@/components/providers/auth";
import { getWalletBuckets, getMyWithdrawals, getWalletTransactions, requestWithdrawal } from "@/backend/domains/commerce";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import type { WalletTransaction, WithdrawalRequest } from "@/backend/core/types";
import { filterTransactions, transactionLabel, transactionTone, type TransactionFilter } from "@/lib/wallet/transaction-display";
import { getWithdrawalDisplayGroups } from "@/lib/wallet/withdrawal-display";
import { DEMO_PAYOUT_ACCOUNT, MYR_CODE } from "@/lib/i18n/invariant-tokens";

const MIN_WITHDRAWAL = 50;
const DESTINATIONS = [
  "Maybank **** 1234",
  "CIMB **** 5678",
  "Public Bank **** 9012",
  "Touch 'n Go eWallet",
  "GrabPay",
  "Boost",
];

const FILTERS: TransactionFilter[] = ["all", "earnings", "withdrawals"];

function formatDate(value: string, locale: string) {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value));
}

function signedAmount(transaction: WalletTransaction) {
  return `${transaction.direction === "credit" ? "+" : "−"}RM ${transaction.amount.toFixed(2)}`;
}

function transactionIcon(transaction: WalletTransaction) {
  if (transaction.direction === "credit") return <CheckCircle2 size={18} className="text-emerald-600" />;
  if (transaction.type === "withdrawal_reserve") return <Clock3 size={18} className="text-amber-600" />;
  return <XCircle size={18} className="text-rose-600" />;
}

export default function VendorWalletPage() {
  const { t, i18n } = useTranslation("vendor");
  const locale = i18n.resolvedLanguage || i18n.language;
  const transactionTypeLabel = (type: WalletTransaction["type"]) => t(`ui.wallet.transactionType.${type}`);
  const referenceLabel = (transaction: WalletTransaction) => transaction.orderId
    ? t('ui.wallet.orderReference', { id: transaction.orderId.slice(0, 8).toUpperCase() })
    : transaction.withdrawalId
      ? t('ui.wallet.withdrawalReference', { id: transaction.withdrawalId.slice(0, 8).toUpperCase() })
      : t('ui.wallet.walletLedger');
  const { currentUser } = useAuth();
  const [wallet, setWallet] = useState({ topup: 0, earnings: 0, pendingEarnings: 0 });
  const [withdrawals, setWithdrawals] = useState<WithdrawalRequest[]>([]);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ amount: "", destination: DESTINATIONS[0] });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState<TransactionFilter>("all");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;

    Promise.allSettled([
      getWalletBuckets(currentUser.id),
      getMyWithdrawals(currentUser.id),
      getWalletTransactions(currentUser.id),
    ]).then(([walletResult, withdrawalsResult, transactionsResult]) => {
      if (cancelled) return;
      const failures: string[] = [];
      if (walletResult.status === "fulfilled") setWallet(walletResult.value);
      else failures.push(t('ui.wallet.balance'));
      if (withdrawalsResult.status === "fulfilled") setWithdrawals(withdrawalsResult.value);
      else failures.push(t('ui.wallet.withdrawals'));
      if (transactionsResult.status === "fulfilled") setTransactions(transactionsResult.value);
      else failures.push(t('ui.wallet.transactionHistory').toLowerCase());
      if (failures.length > 0) setLoadError(t('ui.wallet.loadFailed', { items: failures.join(t('ui.wallet.listJoiner')) }));
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });

    return () => { cancelled = true; };
  }, [currentUser, refreshKey, t]);

  const displayGroups = getWithdrawalDisplayGroups(withdrawals, wallet.earnings);
  const { pending, pendingTotal: pendingWithdrawalAmount, availableEarnings: available } = displayGroups;
  const totalEarnings = available + wallet.pendingEarnings + pendingWithdrawalAmount;
  const canRequestWithdrawal = available >= MIN_WITHDRAWAL && pending.length === 0;
  const filteredTransactions = useMemo(() => filterTransactions(transactions, activeFilter), [transactions, activeFilter]);

  async function handleWithdraw(e: React.FormEvent) {
    e.preventDefault();
    if (!currentUser) return;
    setError("");
    const amount = parseFloat(form.amount);
    if (!amount || amount < MIN_WITHDRAWAL) {
      setError(t('ui.wallet.minimumError', { amount: MIN_WITHDRAWAL.toFixed(2) }));
      return;
    }
    if (amount > available) {
      setError(t('ui.wallet.insufficientBalance'));
      return;
    }
    setSubmitting(true);
    try {
      const withdrawal = await requestWithdrawal(currentUser.id, amount);
      setWithdrawals((prev) => [withdrawal, ...prev]);
      setShowModal(false);
      setForm({ amount: "", destination: DESTINATIONS[0] });
      setRefreshKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.wallet.submissionFailed'));
    } finally {
      setSubmitting(false);
    }
  }

  const amountNum = parseFloat(form.amount) || 0;
  const amountExceedsBalance = amountNum > available;
  const amountBelowMin = amountNum > 0 && amountNum < MIN_WITHDRAWAL;
  const withdrawalHelp = pending.length > 0
    ? t('ui.wallet.activeUnderReview')
    : t('ui.wallet.minimumError', { amount: MIN_WITHDRAWAL.toFixed(2) });
  const refresh = () => { setLoadError(""); setRefreshKey((value) => value + 1); };

  return (
    <div className="w-full space-y-6">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary"><Wallet size={21} /></div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{t('ui.wallet.vendorFinance')}</p>
            <h1 className="mt-1 text-2xl font-bold tracking-tight text-foreground">{t('ui.wallet.title')}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{t('ui.wallet.description')}</p>
          </div>
        </div>
        <div className="flex flex-col items-stretch gap-2 sm:items-end">
          <Button onClick={() => { setError(""); setShowModal(true); }} disabled={!canRequestWithdrawal || loading} className="flex items-center justify-center gap-2">
            <ArrowDownCircle size={15} /> {t('ui.wallet.withdrawFunds')}
          </Button>
          <p className="text-right text-xs text-muted-foreground">{withdrawalHelp}</p>
        </div>
      </header>

      {loadError && <div role="alert" className="flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between"><span className="inline-flex items-center gap-2"><AlertCircle size={16} /> {loadError}</span><button type="button" onClick={refresh} className="inline-flex items-center gap-2 font-semibold underline underline-offset-4"><RefreshCw size={14} /> {t('ui.common.tryAgain')}</button></div>}

      <section aria-label={t('ui.wallet.summaryLabel')} className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl p-5 text-white" style={{ background: "linear-gradient(135deg, var(--primary) 0%, #11115A 100%)", boxShadow: "0 4px 20px rgba(0,0,77,0.28)" }}>
          <p className="text-xs opacity-75">{t('ui.wallet.availableToWithdraw')}</p>
          <p className="mt-2 text-3xl font-bold font-[family-name:var(--font-mono)]">{MYR_CODE} {available.toFixed(2)}</p>
          <p className="mt-2 text-xs opacity-75">{t('ui.wallet.availableDescription')}</p>
        </div>
        <div className="rounded-2xl border border-amber-100 bg-amber-50 p-5" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.06)" }}>
          <p className="text-xs font-semibold text-amber-800">{t('ui.wallet.pendingEarnings')}</p>
          <p className="mt-2 text-3xl font-bold text-amber-700 font-[family-name:var(--font-mono)]">{MYR_CODE} {wallet.pendingEarnings.toFixed(2)}</p>
          <p className="mt-2 text-xs text-amber-800/70">{t('ui.wallet.pendingDescription')}</p>
        </div>
        <div className="rounded-2xl border border-border bg-card p-5" style={{ boxShadow: "0 1px 10px rgba(1,0,102,0.06)" }}>
          <p className="text-xs font-semibold text-muted-foreground">{t('ui.wallet.totalEarnings')}</p>
          <p className="mt-2 text-3xl font-bold text-primary font-[family-name:var(--font-mono)]">{MYR_CODE} {totalEarnings.toFixed(2)}</p>
          <p className="mt-2 text-xs text-muted-foreground">{t('ui.wallet.totalDescription')}</p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-6">
          {pending.length > 0 && <section className="overflow-hidden rounded-2xl border border-amber-100 bg-card shadow-sm"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div className="flex items-center gap-2"><Clock3 size={16} className="text-amber-600" /><div><h2 className="text-sm font-bold text-foreground">{t('ui.wallet.activeWithdrawals')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('ui.wallet.activeDescription')}</p></div></div><span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">{t('ui.wallet.activeCount', { count: pending.length })}</span></div><div className="divide-y divide-border">{pending.map((withdrawal) => <div key={withdrawal.id} className="flex items-center justify-between gap-4 px-5 py-4"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{withdrawal.destination || t('ui.wallet.payoutDestination')}</p><p className="mt-1 text-xs text-muted-foreground">{t('ui.wallet.submittedOn', { date: formatDate(withdrawal.createdAt, locale) })}</p>{withdrawal.requiresDualApproval && <span className="mt-2 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">{t('ui.wallet.dualApprovalRequired')}</span>}</div><div className="shrink-0 text-right"><p className="font-bold text-foreground font-[family-name:var(--font-mono)]">{MYR_CODE} {withdrawal.amount.toFixed(2)}</p><StatusBadge status={withdrawal.status} /></div></div>)}</div></section>}

          <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between"><div><h2 className="text-sm font-bold text-foreground">{t('ui.wallet.transactionHistory')}</h2><p className="mt-1 text-xs text-muted-foreground">{t('ui.wallet.transactionDescription')}</p></div><div role="tablist" aria-label={t('ui.wallet.transactionFilters')} className="flex flex-wrap gap-1 rounded-xl bg-muted p-1">{FILTERS.map((filter) => <button key={filter} type="button" role="tab" aria-selected={activeFilter === filter} onClick={() => setActiveFilter(filter)} className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeFilter === filter ? "bg-card text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>{t(`ui.wallet.filters.${filter}`)}</button>)}</div></div>
            {loading ? <div className="flex items-center justify-center gap-2 px-5 py-14 text-sm text-muted-foreground"><LoaderCircle size={18} className="animate-spin" /> {t('ui.wallet.loadingTransactions')}</div> : filteredTransactions.length === 0 ? <div className="px-5 py-14 text-center"><div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary"><Wallet size={22} /></div><h3 className="mt-4 text-sm font-bold text-foreground">{transactions.length === 0 ? t('ui.wallet.noActivity') : t('ui.wallet.noMatches')}</h3><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">{transactions.length === 0 ? t('ui.wallet.noActivityDescription') : t('ui.wallet.noMatchesDescription')}</p>{transactions.length === 0 ? <a href="/vendor/orders" className="mt-4 inline-flex text-sm font-bold text-primary hover:underline">{t('ui.wallet.viewOrders')}</a> : <button type="button" onClick={() => setActiveFilter("all")} className="mt-4 text-sm font-bold text-primary hover:underline">{t('ui.wallet.showAll')}</button>}</div> : <><div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[680px] text-left"><thead className="bg-muted/50 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground"><tr><th className="px-5 py-3">{t('ui.wallet.dateColumn')}</th><th className="px-5 py-3">{t('ui.wallet.descriptionColumn')}</th><th className="px-5 py-3">{t('ui.wallet.referenceColumn')}</th><th className="px-5 py-3">{t('ui.wallet.typeColumn')}</th><th className="px-5 py-3 text-right">{t('ui.wallet.amountColumn')}</th></tr></thead><tbody className="divide-y divide-border">{filteredTransactions.map((transaction) => <tr key={transaction.id} className="transition hover:bg-muted/30"><td className="whitespace-nowrap px-5 py-4 text-sm text-muted-foreground">{formatDate(transaction.createdAt, locale)}</td><td className="px-5 py-4"><div className="flex items-center gap-3">{transactionIcon(transaction)}<div className="min-w-0"><p className="font-semibold text-foreground">{transaction.note || transactionTypeLabel(transaction.type)}</p><p className="mt-1 text-xs text-muted-foreground">{transaction.direction === "credit" ? t('ui.wallet.moneyAdded') : t('ui.wallet.moneyMovedOut')}</p></div></div></td><td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-muted-foreground">{referenceLabel(transaction)}</td><td className="px-5 py-4"><span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{transactionTypeLabel(transaction.type)}</span></td><td className={`whitespace-nowrap px-5 py-4 text-right font-bold font-[family-name:var(--font-mono)] ${transactionTone(transaction.direction) === "positive" ? "text-emerald-700" : "text-rose-700"}`}>{signedAmount(transaction)}</td></tr>)}</tbody></table></div><div className="divide-y divide-border md:hidden">{filteredTransactions.map((transaction) => <article key={transaction.id} className="px-5 py-4"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-start gap-3">{transactionIcon(transaction)}<div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{transaction.note || transactionTypeLabel(transaction.type)}</p><p className="mt-1 text-xs text-muted-foreground">{formatDate(transaction.createdAt, locale)} · {referenceLabel(transaction)}</p></div></div><p className={`shrink-0 text-sm font-bold font-[family-name:var(--font-mono)] ${transactionTone(transaction.direction) === "positive" ? "text-emerald-700" : "text-rose-700"}`}>{signedAmount(transaction)}</p></div><span className="ml-8 mt-3 inline-flex rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-primary">{transactionTypeLabel(transaction.type)}</span></article>)}</div></>}
          </section>
        </div>

        <aside className="space-y-5 xl:sticky xl:top-6 xl:self-start">
          <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-secondary text-primary"><Landmark size={18} /></div><div><p className="text-xs font-bold uppercase tracking-[0.14em] text-primary">{t('ui.wallet.payoutInformation')}</p><h2 className="mt-1 text-base font-bold text-foreground">{t('ui.wallet.knowBefore')}</h2></div></div><dl className="mt-5 space-y-4"><div className="flex items-start justify-between gap-4"><dt className="text-sm text-muted-foreground">{t('ui.wallet.minimumWithdrawal')}</dt><dd className="text-right text-sm font-bold text-foreground">{MYR_CODE} {MIN_WITHDRAWAL.toFixed(2)}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-sm text-muted-foreground">{t('ui.wallet.typicalProcessing')}</dt><dd className="text-right text-sm font-bold text-foreground">{t('ui.wallet.businessDays')}</dd></div><div className="flex items-start justify-between gap-4"><dt className="text-sm text-muted-foreground">{t('ui.wallet.activeRequests')}</dt><dd className="text-right text-sm font-bold text-foreground">{t('ui.wallet.activeRequestCount', { count: pending.length })}</dd></div></dl><div className="mt-5 flex items-start gap-2 rounded-xl bg-secondary/70 p-3 text-xs leading-5 text-muted-foreground"><Info size={15} className="mt-0.5 shrink-0 text-primary" /> {t('ui.wallet.reserveNotice')}</div></section>
          <section className="rounded-2xl border border-dashed border-border bg-muted/30 p-5"><p className="text-sm font-bold text-foreground">{t('ui.wallet.needMore')}</p><p className="mt-1 text-sm leading-6 text-muted-foreground">{t('ui.wallet.needMoreDescription')}</p><a href="/vendor/products" className="mt-3 inline-flex text-sm font-bold text-primary hover:underline">{t('ui.wallet.manageProducts')}</a></section>
        </aside>
      </div>

      {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0,0,0,0.5)" }}><div className="w-full max-w-md rounded-2xl bg-card p-6 shadow-2xl"><div className="mb-5 flex items-center justify-between"><h2 className="text-lg font-bold text-foreground">{t('ui.wallet.withdrawFunds')}</h2><button type="button" onClick={() => { setShowModal(false); setError(""); }} aria-label={t('ui.wallet.closeDialog')} className="text-muted-foreground hover:text-foreground"><X size={18} /></button></div><div className="mb-5 flex items-center justify-between rounded-xl px-4 py-3" style={{ backgroundColor: "color-mix(in srgb, var(--primary) 10%, transparent)" }}><p className="text-xs text-muted-foreground">{t('ui.wallet.availableToWithdraw')}</p><p className="font-bold text-primary font-[family-name:var(--font-mono)]">{MYR_CODE} {available.toFixed(2)}</p></div><form onSubmit={handleWithdraw} className="space-y-4"><div className="space-y-1.5"><div className="flex items-center justify-between"><label htmlFor="withdrawal-amount" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ui.wallet.amountRm')}</label><button type="button" onClick={() => setForm((current) => ({ ...current, amount: available.toFixed(2) }))} className="text-[10px] font-bold text-primary hover:underline">{t('ui.wallet.withdrawAll')}</button></div><input id="withdrawal-amount" type="number" min={MIN_WITHDRAWAL} step="0.01" required value={form.amount} onChange={(event) => setForm((current) => ({ ...current, amount: event.target.value }))} placeholder={t('ui.wallet.minimumPlaceholder', { amount: MIN_WITHDRAWAL.toFixed(2) })} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none transition focus:border-primary focus:ring-4 focus:ring-primary/10" />{amountExceedsBalance && <p className="text-xs text-destructive">{t('ui.wallet.insufficientBalance')}</p>}{amountBelowMin && <p className="text-xs text-destructive">{t('ui.wallet.minimumError', { amount: MIN_WITHDRAWAL.toFixed(2) })}</p>}</div><div className="space-y-1.5"><label htmlFor="payout-destination" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t('ui.wallet.payoutDestination')}</label><select id="payout-destination" value={form.destination} onChange={(event) => setForm((current) => ({ ...current, destination: event.target.value }))} className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary"><option value={DEMO_PAYOUT_ACCOUNT}>{DEMO_PAYOUT_ACCOUNT}</option>{DESTINATIONS.slice(1).map((destination) => <option key={destination}>{destination}</option>)}</select></div>{parseFloat(form.amount) >= 500 && <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-700">{t('ui.wallet.largeWithdrawalNotice')}</div>}{error && <p className="text-xs text-destructive">{error}</p>}<div className="flex gap-2 pt-1"><Button type="submit" disabled={submitting || amountExceedsBalance || amountBelowMin} className="flex-1">{submitting ? t('ui.wallet.submitting') : t('ui.wallet.submitRequest')}</Button><Button type="button" variant="outline" onClick={() => { setShowModal(false); setError(""); }}>{t('ui.wallet.cancel')}</Button></div></form></div></div>}
    </div>
  );
}
