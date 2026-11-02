"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowRightLeft, Landmark, RefreshCw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useAppDialog } from "@/components/providers/app-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { formatMYRFromSen } from "@/lib/i18n/format";
import { DEFAULT_LOCALE, isAppLocale } from "@/lib/i18n/locale";

type PlatformTransfer = {
  id: string; amountSen: number; transferredOn: string; reference: string; note: string | null;
  createdAt: string; recordedBy: string | null; voidedAt: string | null; voidReason: string | null;
};
export type PlatformFunds = {
  owed: { readyToWithdrawSen: number; onHoldSen: number; withdrawalsInProgressSen: number; customerTopUpSen: number; refundsPendingSen: number; totalSen: number };
  earnedConfirmedSen: number; transferredSen: number; availableSen: number;
  transfers: PlatformTransfer[];
};

/** "1,250.50" → 125050 sen; null when not a positive amount with at most two decimals. */
export function parseRinggitToSen(value: string): number | null {
  const cleaned = value.replace(/,/g, "").trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const sen = Math.round(Number(cleaned) * 100);
  return sen > 0 ? sen : null;
}

function malaysiaToday() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kuala_Lumpur" }).format(new Date());
}

export function PlatformFundsPanel() {
  const { t, i18n } = useTranslation("admin");
  const { t: tCommon } = useTranslation("common");
  const { confirm, prompt } = useAppDialog();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const money = (sen: number) => formatMYRFromSen(Number(sen), locale);
  const [funds, setFunds] = useState<PlatformFunds | null>(null);
  const [loadError, setLoadError] = useState("");
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [transferredOn, setTransferredOn] = useState(malaysiaToday);
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    try {
      const response = await fetch("/api/admin/reconciliation/platform-funds", { cache: "no-store" });
      const body = await response.json() as { data?: PlatformFunds; error?: { message?: string } };
      if (!response.ok || !body.data?.owed) throw new Error(body.error?.message ?? t("reconciliation.funds.loadError"));
      setFunds(body.data);
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : t("reconciliation.funds.loadError"));
    }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function post(body: Record<string, unknown>) {
    const response = await fetch("/api/admin/reconciliation/platform-funds", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const payload = await response.json().catch(() => ({})) as { error?: { message?: string } };
    if (!response.ok) throw new Error(payload.error?.message ?? t("reconciliation.funds.saveError"));
  }

  const amountSen = parseRinggitToSen(amount);
  const overAvailable = Boolean(funds && amountSen !== null && amountSen > funds.availableSen);
  const canSubmit = Boolean(funds && amountSen !== null && !overAvailable && reference.trim().length >= 3 && transferredOn && transferredOn <= malaysiaToday());

  async function record(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || amountSen === null || busy) return;
    if (!await confirm(t("reconciliation.funds.recordConfirm", { amount: money(amountSen) }))) return;
    setBusy(true);
    setFormError("");
    try {
      await post({ action: "record", amountSen, transferredOn, reference: reference.trim(), note: note.trim() || undefined });
      setOpen(false);
      setAmount(""); setReference(""); setNote(""); setTransferredOn(malaysiaToday());
      await load();
    } catch (reason) {
      setFormError(reason instanceof Error ? reason.message : t("reconciliation.funds.saveError"));
    } finally {
      setBusy(false);
    }
  }

  async function voidTransfer(transfer: PlatformTransfer) {
    const reason = await prompt(t("reconciliation.funds.voidPrompt", { amount: money(transfer.amountSen), reference: transfer.reference }));
    if (reason === null) return;
    setBusy(true);
    setLoadError("");
    try {
      await post({ action: "void", id: transfer.id, reason });
      await load();
    } catch (reason) {
      setLoadError(reason instanceof Error ? reason.message : t("reconciliation.funds.saveError"));
    } finally {
      setBusy(false);
    }
  }

  const owedRows: [string, number][] = funds ? [
    [t("reconciliation.funds.owed.readyToWithdraw"), funds.owed.readyToWithdrawSen],
    [t("reconciliation.funds.owed.onHold"), funds.owed.onHoldSen],
    [t("reconciliation.funds.owed.withdrawalsInProgress"), funds.owed.withdrawalsInProgressSen],
    [t("reconciliation.funds.owed.customerTopUp"), funds.owed.customerTopUpSen],
    [t("reconciliation.funds.owed.refundsPending"), funds.owed.refundsPendingSen],
  ] : [];

  return (
    <section data-platform-funds className="mt-5 space-y-4 rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold"><Landmark size={18} aria-hidden="true" /> {t("reconciliation.funds.title")}</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void load()} disabled={busy}><RefreshCw size={14} /> {t("reconciliation.funds.refresh")}</Button>
      </div>
      {loadError && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{loadError}</p>}
      {funds && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">{t("reconciliation.funds.owed.title")}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              {owedRows.map(([label, sen]) => <div key={label} className="flex justify-between gap-3"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium tabular-nums">{money(sen)}</dd></div>)}
              <div className="flex justify-between gap-3 border-t border-border pt-2"><dt className="font-semibold">{t("reconciliation.funds.owed.total")}</dt><dd data-owed-total className="font-bold tabular-nums">{money(funds.owed.totalSen)}</dd></div>
            </dl>
          </div>
          <div className="rounded-xl border border-border p-4">
            <h3 className="text-sm font-semibold">{t("reconciliation.funds.earnings.title")}</h3>
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("reconciliation.funds.earnings.earned")}</dt><dd className="font-medium tabular-nums">{money(funds.earnedConfirmedSen)}</dd></div>
              <div className="flex justify-between gap-3"><dt className="text-muted-foreground">{t("reconciliation.funds.earnings.transferred")}</dt><dd className="font-medium tabular-nums">{money(funds.transferredSen)}</dd></div>
              <div className="flex justify-between gap-3 border-t border-border pt-2"><dt className="font-semibold">{t("reconciliation.funds.earnings.available")}</dt><dd data-available className="font-bold tabular-nums">{money(funds.availableSen)}</dd></div>
            </dl>
            <Button type="button" className="mt-3" onClick={() => { setFormError(""); setOpen(true); }} disabled={busy || funds.availableSen <= 0}><ArrowRightLeft size={15} /> {t("reconciliation.funds.recordButton")}</Button>
          </div>
        </div>
      )}
      {funds && (
        <div>
          <h3 className="text-sm font-semibold">{t("reconciliation.funds.history.title")}</h3>
          {funds.transfers.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t("reconciliation.funds.history.empty")}</p> : (
            <ul className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
              {funds.transfers.map((transfer) => (
                <li key={transfer.id} data-transfer={transfer.id} className={`flex flex-wrap items-center justify-between gap-3 p-3 ${transfer.voidedAt ? "text-muted-foreground" : ""}`}>
                  <div className="min-w-0">
                    <p className={`font-semibold tabular-nums ${transfer.voidedAt ? "line-through" : ""}`}>{money(transfer.amountSen)} · {transfer.transferredOn} · {transfer.reference}</p>
                    <p className="text-xs text-muted-foreground">{t("reconciliation.funds.history.recordedBy", { name: transfer.recordedBy ?? "—" })}{transfer.note ? ` · ${transfer.note}` : ""}</p>
                    {transfer.voidedAt && <p className="text-xs">{t("reconciliation.funds.history.voided", { reason: transfer.voidReason ?? "" })}</p>}
                  </div>
                  {!transfer.voidedAt && <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => void voidTransfer(transfer)}>{t("reconciliation.funds.history.void")}</Button>}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <Dialog open={open} onOpenChange={(next) => { if (!busy) setOpen(next); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("reconciliation.funds.dialog.title")}</DialogTitle>
            <DialogDescription>{t("reconciliation.funds.dialog.description", { available: funds ? money(funds.availableSen) : "" })}</DialogDescription>
          </DialogHeader>
          <form onSubmit={(event) => void record(event)} className="space-y-3">
            <label className="block text-sm font-medium">{t("reconciliation.funds.dialog.amount")}
              <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" className="mt-1" aria-invalid={Boolean(amount && (amountSen === null || overAvailable))} />
            </label>
            {amount && amountSen === null && <p role="alert" className="text-xs text-destructive">{t("reconciliation.funds.dialog.amountInvalid")}</p>}
            {overAvailable && <p role="alert" className="text-xs text-destructive">{t("reconciliation.funds.dialog.overAvailable")}</p>}
            <label className="block text-sm font-medium">{t("reconciliation.funds.dialog.date")}
              <Input type="date" value={transferredOn} max={malaysiaToday()} onChange={(event) => setTransferredOn(event.target.value)} className="mt-1" />
            </label>
            <label className="block text-sm font-medium">{t("reconciliation.funds.dialog.reference")}
              <Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} placeholder={t("reconciliation.funds.dialog.referencePlaceholder")} className="mt-1" />
            </label>
            <label className="block text-sm font-medium">{t("reconciliation.funds.dialog.note")}
              <Input value={note} maxLength={500} onChange={(event) => setNote(event.target.value)} className="mt-1" />
            </label>
            {formError && <p role="alert" className="text-sm text-destructive">{formError}</p>}
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>{tCommon("actions.cancel")}</Button>
              <Button type="submit" disabled={busy || !canSubmit}>{busy ? tCommon("states.processingEllipsis") : t("reconciliation.funds.dialog.submit")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </section>
  );
}
