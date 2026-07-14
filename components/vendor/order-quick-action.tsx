'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useActionFeedback } from '@/components/providers/action-feedback';

export default function OrderQuickAction({ vendorId, itemId, status, orderStatus }: { vendorId: string; itemId: string; status: string; orderStatus: string }) {
  const router = useRouter();
  const { showFeedback } = useActionFeedback();
  const [loading, setLoading] = useState(false);
  const nextStatus = !['paid', 'completed'].includes(orderStatus) ? null : status === 'pending' ? 'ready' : status === 'ready' ? 'fulfilled' : null;
  if (!nextStatus) return <span className="text-xs text-gray-400">No action</span>;

  async function updateStatus() {
    setLoading(true);
    const response = await fetch(`/api/vendors/${vendorId}/orders/${itemId}/fulfil`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: nextStatus }),
    });
    setLoading(false);
    if (response.ok) {
      showFeedback('success', nextStatus === 'ready' ? 'Order item marked ready.' : 'Order item fulfilled.');
      router.refresh();
    } else {
      const payload = await response.json().catch(() => ({}));
      showFeedback('error', payload.error?.message || 'Could not update order fulfilment.');
    }
  }

  return <button type="button" onClick={updateStatus} disabled={loading} className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-primary/90 disabled:opacity-60">
    {loading ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
    {nextStatus === 'ready' ? 'Mark ready' : 'Fulfil'}
  </button>;
}
