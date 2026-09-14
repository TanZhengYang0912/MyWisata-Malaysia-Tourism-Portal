'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionFeedback } from '@/components/providers/action-feedback';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';
import { useTranslation } from 'react-i18next';
import { getItemFulfilmentAction } from '@/lib/vendor/order-actions';

export default function OrderQuickAction({ vendorId, itemId, status, orderStatus }: { vendorId: string; itemId: string; status: string; orderStatus: string }) {
  const router = useRouter();
  const { showFeedback } = useActionFeedback();
  const { t } = useTranslation('vendor');
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const nextStatus = getItemFulfilmentAction(orderStatus, status);
  if (!nextStatus) return <span className="text-xs text-gray-400">{t('order.noAction')}</span>;

  async function updateStatus() {
    setLoading(true);
    const response = await fetch(`/api/vendors/${vendorId}/orders/${itemId}/fulfil`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }),
    });
    setLoading(false);
    if (response.ok) {
      showFeedback('success', nextStatus === 'ready' ? t('order.itemMarkedReady') : t('order.itemFulfilled'));
      router.refresh();
    } else {
      const payload = await response.json().catch(() => ({}));
      showFeedback('error', payload.error?.message || t('order.updateFailed'));
    }
  }

  const actionLabel = nextStatus === 'ready' ? t('order.markReady') : t('order.fulfil');
  const description = nextStatus === 'ready' ? t('ui.orders.confirmItemMarkReadyDescription') : t('ui.orders.confirmItemFulfilDescription');

  return <>
    <button type="button" onClick={() => setConfirmOpen(true)} disabled={loading} aria-label={actionLabel} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60">
      {loading ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />}
      {actionLabel}
    </button>
    <ActionConfirmationDialog open={confirmOpen} title={nextStatus === 'ready' ? t('ui.orders.confirmMarkReadyTitle') : t('ui.orders.confirmFulfilTitle')} description={description} confirmLabel={actionLabel} busy={loading} onCancel={() => { if (!loading) setConfirmOpen(false); }} onConfirm={() => { setConfirmOpen(false); void updateStatus(); }} />
  </>;
}
