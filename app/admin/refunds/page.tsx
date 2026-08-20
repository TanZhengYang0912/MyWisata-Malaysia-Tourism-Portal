'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/shared/status-badge';
import { MYR_CODE } from "@/lib/i18n/invariant-tokens";

type RefundRow = {
  id: string;
  orderId: string;
  orderNumber: string | null;
  amountRm: number;
  reason: string | null;
  status: string;
  provider: string | null;
  method: string | null;
  providerRefundId: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string;
};

const SIMULATOR_PROVIDERS = new Set([
  'tng_ewallet_simulator',
  'grabpay_simulator',
  'bank_transfer_simulator',
]);

function providerLabel(provider: string | null, t: (key: string, options?: { ns?: string }) => string) {
  if (provider === 'tng_ewallet_simulator') return t('refunds.providers.tngSimulator', { ns: 'admin' });
  if (provider === 'grabpay_simulator') return t('refunds.providers.grabpaySimulator', { ns: 'admin' });
  if (provider === 'bank_transfer_simulator') return t('refunds.providers.bankTransferSimulator', { ns: 'admin' });
  if (provider === 'stripe') return t('refunds.providers.stripeSandbox', { ns: 'admin' });
  if (provider === 'platform_wallet') return t('refunds.providers.mywisataWallet', { ns: 'admin' });
  return provider ?? t('refunds.providers.unknown', { ns: 'admin' });
}

export default function AdminRefundsPage() {
  const { t } = useTranslation('admin');
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/refunds', { cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t('refunds.errors.loadRequests'));
      setRefunds(body.data?.refunds ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : t('refunds.errors.loadRequests'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { void load(); }, [load]);

  async function review(refundId: string, action: 'approve' | 'reject') {
    setBusyId(refundId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/refunds/${refundId}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? t('refunds.errors.reviewFailed'));
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : t('refunds.errors.reviewFailed'));
    } finally {
      setBusyId(null);
    }
  }

  async function simulate(refundId: string, outcome: 'succeeded' | 'failed') {
    setBusyId(refundId);
    setError(null);
    try {
      const response = await fetch(`/api/payments/simulator/refunds/${refundId}/action`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ outcome }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error?.message ?? body.error ?? t('refunds.errors.simulationFailed'));
      await load();
    } catch (simulationError) {
      setError(simulationError instanceof Error ? simulationError.message : t('refunds.errors.simulationFailed'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl space-y-6 p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">{t('refunds.header.eyebrow')}</p>
          <h1 className="mt-1 text-3xl font-bold">{t('refunds.header.title')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t('refunds.header.description')}
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={loading ? 'animate-spin' : ''} /> {t('refunds.actions.refresh')}
        </Button>
      </div>

      <section className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
        <strong>{t('refunds.sandbox.label')}</strong> {t('refunds.sandbox.description')}
      </section>

      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="py-12 text-center text-sm text-muted-foreground">{t('refunds.loading')}</p>
      ) : refunds.length === 0 ? (
        <div className="rounded-2xl border bg-card p-12 text-center">
          <RotateCcw className="mx-auto mb-3 text-muted-foreground" />
          <p className="font-semibold">{t('refunds.empty.title')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('refunds.empty.description')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {refunds.map((refund) => {
            const simulated = refund.provider ? SIMULATOR_PROVIDERS.has(refund.provider) : false;
            const busy = busyId === refund.id;
            return (
              <article key={refund.id} className="rounded-2xl border bg-card p-5 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-bold">{refund.orderNumber ?? refund.orderId}</h2>
                      <StatusBadge status={refund.status === 'processed' ? t('refunds.status.processed') : refund.status} />
                      {simulated && <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold text-amber-900">{t('refunds.status.simulated')}</span>}
                    </div>
                    <p className="mt-2 text-sm text-muted-foreground">{providerLabel(refund.provider, t)} · {t('refunds.attempt', { count: refund.attemptCount })}</p>
                    <p className="mt-1 text-sm">{refund.reason ?? t('refunds.detail.noReason')}</p>
                    {refund.failureMessage && (
                      <p className="mt-2 text-sm text-destructive">{refund.failureCode}: {refund.failureMessage}</p>
                    )}
                  </div>
                  <p className="text-xl font-bold tabular-nums">{MYR_CODE} {refund.amountRm.toFixed(2)}</p>
                </div>

                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  {refund.status === 'pending' && (
                    <>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void review(refund.id, 'reject')}>{t('refunds.actions.reject')}</Button>
                      <Button type="button" disabled={busy} onClick={() => void review(refund.id, 'approve')}>{t('refunds.actions.approve')}</Button>
                    </>
                  )}
                  {refund.status === 'approved' && simulated && (
                    <>
                      <Button type="button" variant="outline" disabled={busy} onClick={() => void simulate(refund.id, 'failed')}>{t('refunds.actions.simulateRetryableFailure')}</Button>
                      <Button type="button" disabled={busy} onClick={() => void simulate(refund.id, 'succeeded')}>{t('refunds.actions.simulateSuccess')}</Button>
                    </>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </main>
  );
}
