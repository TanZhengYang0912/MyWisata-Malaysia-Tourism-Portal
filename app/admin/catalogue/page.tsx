'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCheck, Eye, MessageSquare, X } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { useActionFeedback } from '@/components/providers/action-feedback';

type ReviewItem = {
  id: string;
  entityType: 'outlet' | 'product' | 'voucher';
  entityLabel: string;
  context: string;
  vendor_id: string;
  vendors?: { name?: string } | null;
  review_note?: string | null;
  created_at: string;
  display_id?: string | null;
};

const labels: Record<ReviewItem['entityType'], string> = {
  outlet: 'Outlet',
  product: 'Listing',
  voucher: 'Voucher',
};

export default function CatalogueReviewPage() {
  const { showFeedback } = useActionFeedback();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<'all' | ReviewItem['entityType']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/catalogue/reviews', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Unable to load review queue');
      setItems(payload.data?.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load review queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(item: ReviewItem, action: 'approve' | 'change_requested' | 'reject') {
    const note = action === 'approve' ? undefined : window.prompt(action === 'reject' ? 'Reason for rejection (at least 10 characters):' : 'What needs to be changed? (at least 10 characters)');
    if (action !== 'approve' && note === null) return;
    const trimmedNote = note?.trim();
    if (action !== 'approve' && (!trimmedNote || trimmedNote.length < 10)) {
      const message = `${action === 'reject' ? 'Reject' : 'Request changes'} requires a reason of at least 10 characters.`;
      setError(message);
      showFeedback('error', message);
      return;
    }
    setBusy(`${action}:${item.id}`);
    try {
      const response = await fetch('/api/admin/catalogue/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: item.entityType, entityId: item.id, action, note: trimmedNote }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Review action failed');
      showFeedback('success', `${labels[item.entityType]} ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'returned for changes'}.`);
      setActive(null);
      await load();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Review action failed';
      setError(message);
      showFeedback('error', message);
    } finally {
      setBusy(null);
    }
  }

  const visible = filter === 'all' ? items : items.filter((item) => item.entityType === filter);
  const counts = {
    all: items.length,
    outlet: items.filter((item) => item.entityType === 'outlet').length,
    product: items.filter((item) => item.entityType === 'product').length,
    voucher: items.filter((item) => item.entityType === 'voucher').length,
  };

  return (
    <main className="min-h-full p-6 lg:p-10">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700"><ClipboardCheck size={15} /> Marketplace governance</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-gray-950">Catalogue review</h1>
            <p className="mt-1 text-sm text-gray-500">Review outlet, product and promotion changes before they become visible to customers.</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-right"><p className="text-xs font-semibold uppercase tracking-wider text-amber-700">Waiting</p><p className="mt-1 text-2xl font-bold text-amber-950">{items.length}</p></div>
        </header>

        <div className="flex flex-wrap gap-2 rounded-2xl border border-gray-100 bg-white p-2 shadow-sm">
          {(['all', 'outlet', 'product', 'voucher'] as const).map((value) => <button key={value} type="button" onClick={() => setFilter(value)} className={`rounded-xl px-4 py-2 text-sm font-semibold capitalize ${filter === value ? 'bg-gray-950 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>{value === 'all' ? 'All items' : labels[value]} <span className="ml-1 text-xs opacity-70">{counts[value]}</span></button>)}
        </div>

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="hidden grid-cols-[110px_minmax(220px,1.5fr)_minmax(150px,1fr)_150px_90px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span>Type</span><span>Submission</span><span>Vendor / location</span><span>Submitted</span><span className="text-right">Action</span></div>
          {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : visible.length === 0 ? <div className="px-6 py-20 text-center text-sm text-gray-400"><ClipboardCheck className="mx-auto mb-3 opacity-30" size={36} /><p>No content is waiting for review.</p></div> : <div className="divide-y divide-gray-100">{visible.map((item) => <article key={`${item.entityType}:${item.id}`} className="grid gap-3 px-4 py-4 md:grid-cols-[110px_minmax(220px,1.5fr)_minmax(150px,1fr)_150px_90px] md:items-center md:gap-4 md:px-5"><div><StatusBadge status={labels[item.entityType]} /></div><div className="min-w-0"><p className="truncate font-semibold text-gray-950">{item.entityLabel}</p><p className="mt-1 truncate text-xs text-gray-500">{item.display_id || item.id} · {item.context || 'No location provided'}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-700">{item.vendors?.name || 'Unknown vendor'}</p><p className="mt-1 text-xs text-amber-700">Pending review</p></div><div className="text-sm text-gray-500">{new Date(item.created_at).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' })}</div><div className="flex justify-end gap-1"><button type="button" title="Open review" onClick={() => setActive(item)} className="rounded-lg p-2 text-gray-500 hover:bg-emerald-50 hover:text-emerald-700"><Eye size={16} /></button><button type="button" title="Approve" disabled={!!busy} onClick={() => void review(item, 'approve')} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40"><Check size={16} /></button></div></article>)}</div>}
        </section>
      </div>

      {active && <div className="fixed inset-0 z-50 bg-gray-950/25" onClick={() => setActive(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-lg overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">{labels[active.entityType]} review</p><h2 className="mt-1 text-xl font-bold text-gray-950">{active.entityLabel}</h2></div><button type="button" onClick={() => setActive(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Vendor</p><p className="mt-1 font-semibold text-gray-900">{active.vendors?.name || 'Unknown vendor'}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Reference</p><p className="mt-1 break-all font-mono text-xs text-gray-700">{active.display_id || active.id}</p><p className="mt-2 text-gray-600">{active.context || 'No location provided'}</p></div><div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-violet-900"><div className="flex items-center gap-2 font-semibold"><MessageSquare size={15} /> Review checklist</div><p className="mt-2 text-xs leading-5">Confirm the title, description, price, location, images and availability are accurate before approving.</p></div></div><div className="mt-8 grid gap-2 sm:grid-cols-3"><button type="button" disabled={!!busy} onClick={() => void review(active, 'approve')} className="rounded-xl bg-emerald-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">Approve</button><button type="button" disabled={!!busy} onClick={() => void review(active, 'change_requested')} className="rounded-xl border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700 disabled:opacity-50">Request changes</button><button type="button" disabled={!!busy} onClick={() => void review(active, 'reject')} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">Reject</button></div></aside></div>}
    </main>
  );
}
