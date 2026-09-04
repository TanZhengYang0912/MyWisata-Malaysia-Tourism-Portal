"use client";

import { useTranslation } from "react-i18next";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, Building2, QrCode, ShieldCheck } from "lucide-react";
import { GuestAccountEmptyState } from "@/components/customer/guest-account-empty-state";
import { useAuth } from "@/components/providers/auth";
import { EmptyState } from "@/components/shared/empty-state";
import { Button } from "@/components/ui/button";
import { REFERENCE_PREFIX } from "@/lib/i18n/invariant-tokens";
import { formatMYRFromSen } from "@/lib/i18n/format";

type SimulatorProvider = "tng_ewallet_simulator" | "grabpay_simulator" | "bank_transfer_simulator";
type SimulatorSession = {
  sessionId: string;
  orderId: string;
  provider: SimulatorProvider;
  providerPaymentId: string;
  amountSen: number;
  currency: "MYR";
  status: string;
  expiresAt: string;
  simulated: true;
};

const PROVIDER_LABEL_KEYS: Record<SimulatorProvider, string> = {
  tng_ewallet_simulator: "strictMigration.paymentSimulator.providers.tng",
  grabpay_simulator: "strictMigration.paymentSimulator.providers.grabpay",
  bank_transfer_simulator: "strictMigration.paymentSimulator.providers.bankTransfer",
};

export default function PaymentSimulatorPage() {
  const { t: tCustomer } = useTranslation("customer");
  const { currentUser } = useAuth();
  const params = useParams<{ sessionId: string }>();
  const router = useRouter();
  const [session, setSession] = useState<SimulatorSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUser) {
      setLoading(false);
      setSession(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/payments/simulator/sessions/${params.sessionId}`)
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.data) throw new Error(tCustomer("ui.states.loadingError"));
        return body.data as SimulatorSession;
      })
      .then((data) => {
        if (!cancelled) setSession(data);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : tCustomer("ui.states.loadingError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [currentUser, params.sessionId, tCustomer]);

  async function submitOutcome(outcome: "succeeded" | "failed" | "cancelled" | "expired") {
    if (!session || processing) return;
    setProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/payments/simulator/sessions/${session.sessionId}/action`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ outcome }),
      });
      const body = await response.json();
      if (!response.ok || !body.data) throw new Error(tCustomer("ui.states.loadingError"));
      const result = body.data as { status: string; orderId?: string };
      if (result.status === "paid" && result.orderId) {
        router.push(`/customer/orders/${result.orderId}`);
        return;
      }
      setSession((current) => current ? { ...current, status: result.status } : current);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : tCustomer("ui.states.loadingError"));
    } finally {
      setProcessing(false);
    }
  }

  if (!currentUser) {
    return <div className="mx-auto max-w-lg px-4 py-10 sm:px-6"><GuestAccountEmptyState title={tCustomer("ui.checkout.phoneRequired")} description={tCustomer("ui.checkout.verifyPhone")} nextPath={`/customer/checkout/simulator/${params.sessionId}`} /></div>;
  }
  if (loading) return <div className="mx-auto max-w-lg px-4 py-16 text-sm text-muted-foreground">{tCustomer("ui.states.loading")}</div>;
  if (!session) return <EmptyState title={tCustomer("ui.states.couldNotLoad")} description={error ?? tCustomer("ui.states.loadingError")} />;

  const isBank = session.provider === "bank_transfer_simulator";
  const terminal = ["paid", "failed", "cancelled", "expired"].includes(session.status);
  const successLabel = isBank ? tCustomer("strictMigration.paymentSimulator.markFundsReceived") : tCustomer("strictMigration.paymentSimulator.simulateSuccess");

  return (
    <div className="mx-auto max-w-lg px-4 py-8 sm:px-6">
      <div className="mb-5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
        <p className="flex items-center gap-2 text-sm font-bold"><ShieldCheck size={16} /> {tCustomer("strictMigration.paymentSimulator.eyebrow")}</p>
        <p className="mt-1 text-xs">{tCustomer("strictMigration.paymentSimulator.notice")}</p>
      </div>

      <div className="rounded-2xl border border-border bg-card p-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{tCustomer("ui.checkout.paymentMethod")}</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground font-[family-name:var(--font-display)]">{tCustomer(PROVIDER_LABEL_KEYS[session.provider])}</h1>
        <div className="mt-5 flex min-h-48 items-center justify-center rounded-xl bg-secondary/60 p-6 text-center">
          {isBank ? (
            <div>
              <Building2 className="mx-auto text-primary" size={42} />
              <p className="mt-3 text-sm font-bold text-foreground">{tCustomer("ui.labels.bookingReference")}</p>
              <p className="mt-1 font-mono text-sm text-primary">{REFERENCE_PREFIX}{session.sessionId.slice(0, 8).toUpperCase()}</p>
              <p className="mt-2 text-xs text-muted-foreground">{tCustomer("strictMigration.paymentSimulator.bankInstruction")}</p>
            </div>
          ) : (
            <div>
              <QrCode className="mx-auto text-primary" size={72} />
              <p className="mt-3 text-sm font-bold text-foreground">{tCustomer("strictMigration.paymentSimulator.scanQr")}</p>
              <p className="mt-1 text-xs text-muted-foreground">{tCustomer("strictMigration.paymentSimulator.qrInstruction")}</p>
            </div>
          )}
        </div>

        <dl className="mt-5 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-muted-foreground">{tCustomer("ui.checkout.total")}</dt><dd className="font-bold font-[family-name:var(--font-mono)]">{formatMYRFromSen(session.amountSen)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">{tCustomer("ui.labels.status")}</dt><dd className="font-semibold">{tCustomer(`strictMigration.paymentSimulator.statuses.${session.status}`)}</dd></div>
          <div className="flex justify-between"><dt className="text-muted-foreground">{tCustomer("ui.labels.bookingReference")}</dt><dd className="font-mono text-xs">…{session.providerPaymentId.slice(-10)}</dd></div>
        </dl>

        {error && <p role="alert" className="mt-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"><AlertCircle className="mt-0.5 shrink-0" size={15} />{error}</p>}

        {!terminal ? (
          <div className="mt-6 space-y-2">
            <Button className="w-full" disabled={processing} onClick={() => void submitOutcome("succeeded")}>{processing ? tCustomer("ui.states.sending") : successLabel}</Button>
            <Button className="w-full" variant="outline" disabled={processing} onClick={() => void submitOutcome("failed")}>{tCustomer("strictMigration.paymentSimulator.simulateFailure")}</Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="ghost" disabled={processing} onClick={() => void submitOutcome("cancelled")}>{tCustomer("strictMigration.paymentSimulator.cancelPayment")}</Button>
              <Button variant="ghost" disabled={processing} onClick={() => void submitOutcome("expired")}>{tCustomer("strictMigration.paymentSimulator.expireSession")}</Button>
            </div>
          </div>
        ) : (
          <div className="mt-6 flex gap-3">
            <Link className="flex-1" href="/customer/checkout"><Button className="w-full" variant="outline">{tCustomer("strictMigration.paymentSimulator.backToCheckout")}</Button></Link>
            <Link className="flex-1" href={`/customer/orders/${session.orderId}`}><Button className="w-full">{tCustomer("ui.actions.viewDetails")}</Button></Link>
          </div>
        )}
      </div>
    </div>
  );
}
