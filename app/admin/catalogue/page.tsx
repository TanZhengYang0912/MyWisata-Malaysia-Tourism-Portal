'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, ClipboardCheck, Eye, MessageSquare, X } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { AdminBatchActionBar } from '@/components/admin/batch-action-bar';
import { AdminSegmentedFilter } from '@/components/admin/segmented-filter';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

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

const labelKeys: Record<ReviewItem['entityType'], string> = {
  outlet: 'catalogue.entity.outlet',
  product: 'catalogue.entity.listing',
  voucher: 'catalogue.entity.voucher',
};

export default function CatalogueReviewPage() {
  const { t, i18n } = useTranslation('admin');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<'all' | ReviewItem['entityType']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/catalogue/reviews', { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('catalogue.errors.loadQueue', { defaultValue: 'Unable to load review queue' }));
      setItems(payload.data?.items ?? []);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('catalogue.errors.loadQueue', { defaultValue: 'Unable to load review queue' }));
    } finally {
      setLoading(false);
    }
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  async function performReview(item: ReviewItem, action: 'approve' | 'change_requested' | 'reject', note?: string) {
    const trimmedNote = note?.trim();
    if (action !== 'approve' && (!trimmedNote || trimmedNote.length < 10)) {
      const message = t('catalogue.errors.reasonLength', { defaultValue: `${action === 'reject' ? 'Reject' : 'Request changes'} requires a reason of at least 10 characters.` });
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
      if (!response.ok) throw new Error(payload.error?.message || t('catalogue.errors.actionFailed', { defaultValue: 'Review action failed' }));
      showFeedback('success', t(`catalogue.success.${action}`, { defaultValue: `${t(labelKeys[item.entityType], { defaultValue: labels[item.entityType] })} ${action === 'approve' ? 'approved' : action === 'reject' ? 'rejected' : 'returned for changes'}.` }));
      setActive(null);
      await load();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t('catalogue.errors.reviewActionFailed');
      setError(message);
      showFeedback('error', message);
    } finally {
      setBusy(null);
    }
  }

  async function review(item: ReviewItem, action: 'approve' | 'change_requested' | 'reject') {
    const note = action === 'approve' ? undefined : window.prompt(action === 'reject' ? t('catalogue.prompts.rejectReason') : t('catalogue.prompts.changeReason'));
    if (action !== 'approve' && note === null) return;
    await performReview(item, action, note ?? undefined);
  }

  async function applyBatch(action: 'approve' | 'change_requested' | 'reject') {
    const selected = visible.filter((item) => selectedIds.has(`${item.entityType}:${item.id}`));
    if (!selected.length) return;
    const note = action === 'approve' ? undefined : window.prompt(action === 'reject' ? t('catalogue.prompts.batchRejectReason') : t('catalogue.prompts.batchChangeReason'));
    if (action !== 'approve' && note === null) return;
    const trimmedNote = note?.trim();
    if (action !== 'approve' && (!trimmedNote || trimmedNote.length < 10)) {
      const message = t('catalogue.errors.reasonLength', { defaultValue: `${action === 'reject' ? 'Reject' : 'Request changes'} requires a reason of at least 10 characters.` });
      setError(message);
      showFeedback('error', message);
      return;
    }
    setBusy(`batch:${action}`);
    try {
      const results = await Promise.all(selected.map((item) => fetch('/api/admin/catalogue/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: item.entityType, entityId: item.id, action, note: trimmedNote }),
      })));
      const failed = results.find((response) => !response.ok);
      if (failed) {
        const payload = await failed.json().catch(() => ({}));
        throw new Error(payload.error?.message || t('catalogue.errors.batchFailed', { defaultValue: 'One or more catalogue reviews failed' }));
      }
      showFeedback('success', t('catalogue.success.batchProcessed', { defaultValue: '{{count}} catalogue items processed.', count: selected.length }));
      setSelectedIds(new Set());
      await load();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t('catalogue.errors.batchReviewFailed', { defaultValue: 'Batch review failed' });
      setError(message);
      showFeedback('error', message);
    } finally {
      setBusy(null);
    }
  }

  const visible = filter === 'all' ? items : items.filter((item) => item.entityType === filter);
  const selectedVisibleCount = visible.filter((item) => selectedIds.has(`${item.entityType}:${item.id}`)).length;
  const counts = {
    all: items.length,
    outlet: items.filter((item) => item.entityType === 'outlet').length,
    product: items.filter((item) => item.entityType === 'product').length,
    voucher: items.filter((item) => item.entityType === 'voucher').length,
  };

  return (
    <main className="min-h-full px-4 py-6 sm:px-6 sm:py-8 xl:px-8">
      <div className="w-full space-y-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ClipboardCheck size={15} /> {t('catalogue.eyebrow', { defaultValue: 'Marketplace governance' })}</p>
            <h1 className="mt-2 font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] text-foreground sm:text-4xl">{t('catalogue.title', { defaultValue: 'Catalogue review' })}</h1>
            <p className="mt-1 text-sm text-gray-500">{t('catalogue.description', { defaultValue: 'Review outlet, product and promotion changes before they become visible to customers.' })}</p>
          </div>
          <div className="rounded-2xl border border-amber-100 bg-amber-50 px-4 py-3 text-right"><p className="text-sm font-semibold text-amber-700">{t('catalogue.waiting', { defaultValue: 'Waiting' })}</p><p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-amber-950">{items.length}</p></div>
        </header>

        <AdminSegmentedFilter
          value={filter}
          ariaLabel="Catalogue item type"
          items={(['all', 'outlet', 'product', 'voucher'] as const).map((value) => ({ value, label: value === 'all' ? t('catalogue.filters.allItems', { defaultValue: 'All items' }) : t(labelKeys[value], { defaultValue: labels[value] }), count: counts[value] }))}
          onChange={(value) => setFilter(value as 'all' | ReviewItem['entityType'])}
        />

        {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
        <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
          <div className="border-b border-gray-100 bg-gray-50/70 px-5 py-3"><AdminBatchActionBar selectedCount={selectedVisibleCount} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as 'approve' | 'change_requested' | 'reject')} actions={[{ value: 'approve', label: t('batchActions.approve', { defaultValue: 'Approve' }) }, { value: 'change_requested', label: t('batchActions.request_changes', { defaultValue: 'Request changes' }) }, { value: 'reject', label: t('batchActions.reject', { defaultValue: 'Reject' }) }]} busy={Boolean(busy?.startsWith('batch:'))} /></div>
          <div className="hidden grid-cols-[36px_110px_minmax(220px,1.5fr)_minmax(150px,1fr)_150px_90px] gap-4 border-b border-gray-100 bg-gray-50/70 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span><input type="checkbox" aria-label={t('catalogue.accessibility.selectAll', { defaultValue: 'Select all visible catalogue items' })} checked={visible.length > 0 && selectedVisibleCount === visible.length} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); visible.forEach((item) => { const key = `${item.entityType}:${item.id}`; event.target.checked ? next.add(key) : next.delete(key); }); return next; })} /></span><span>{t('catalogue.columns.type', { defaultValue: 'Type' })}</span><span>{t('catalogue.columns.submission', { defaultValue: 'Submission' })}</span><span>{t('catalogue.columns.vendorLocation', { defaultValue: 'Vendor / location' })}</span><span>{t('catalogue.columns.submitted', { defaultValue: 'Submitted' })}</span><span className="text-right">{t('catalogue.columns.action', { defaultValue: 'Action' })}</span></div>
          {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : visible.length === 0 ? <div className="px-6 py-20 text-center text-sm text-gray-400"><ClipboardCheck className="mx-auto mb-3 opacity-30" size={36} /><p>{t('catalogue.empty', { defaultValue: 'No content is waiting for review.' })}</p></div> : <div className="divide-y divide-gray-100">{visible.map((item) => { const key = `${item.entityType}:${item.id}`; return <article key={key} className="grid gap-3 px-4 py-4 md:grid-cols-[36px_110px_minmax(220px,1.5fr)_minmax(150px,1fr)_150px_90px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" aria-label={t('catalogue.accessibility.selectItem', { defaultValue: 'Select {{item}}', item: item.entityLabel })} checked={selectedIds.has(key)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); event.target.checked ? next.add(key) : next.delete(key); return next; })} /></div><div><StatusBadge status={t(labelKeys[item.entityType], { defaultValue: labels[item.entityType] })} /></div><div className="min-w-0"><p className="truncate font-semibold text-gray-950">{item.entityLabel}</p><p className="mt-1 truncate text-xs text-gray-500">{item.display_id || item.id} · {item.context || t('catalogue.fallback.noLocation', { defaultValue: 'No location provided' })}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-700">{item.vendors?.name || t('catalogue.fallback.unknownVendor', { defaultValue: 'Unknown vendor' })}</p><p className="mt-1 text-xs text-amber-700">{t('catalogue.status.pendingReview', { defaultValue: 'Pending review' })}</p></div><div className="text-sm text-gray-500">{new Date(item.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}</div><div className="flex justify-end gap-1"><button type="button" title={t('catalogue.actions.openReview', { defaultValue: 'Open review' })} onClick={() => setActive(item)} className="rounded-lg p-2 text-gray-500 hover:bg-secondary hover:text-primary"><Eye size={16} /></button><button type="button" title={t('batchActions.approve', { defaultValue: 'Approve' })} disabled={!!busy} onClick={() => void review(item, 'approve')} className="rounded-lg p-2 text-primary hover:bg-secondary disabled:opacity-40"><Check size={16} /></button></div></article>; })}</div>}
        </section>
      </div>

      {active && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/25 p-4 sm:p-6" onClick={() => setActive(null)}><aside role="dialog" aria-modal="true" aria-labelledby="catalogue-review-title" onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('catalogue.reviewTitle', { defaultValue: '{{entity}} review', entity: t(labelKeys[active.entityType], { defaultValue: labels[active.entityType] }) })}</p><h2 id="catalogue-review-title" className="mt-1 text-xl font-bold text-gray-950">{active.entityLabel}</h2></div><button type="button" aria-label={t('catalogue.actions.closeReview', { defaultValue: 'Close review' })} onClick={() => setActive(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">{t('catalogue.fields.vendor', { defaultValue: 'Vendor' })}</p><p className="mt-1 font-semibold text-gray-900">{active.vendors?.name || t('catalogue.fallback.unknownVendor', { defaultValue: 'Unknown vendor' })}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">{t('catalogue.fields.reference', { defaultValue: 'Reference' })}</p><p className="mt-1 break-all font-mono text-xs text-gray-700">{active.display_id || active.id}</p><p className="mt-2 text-gray-600">{active.context || t('catalogue.fallback.noLocation', { defaultValue: 'No location provided' })}</p></div><div className="rounded-xl border border-violet-100 bg-violet-50 p-4 text-violet-900"><div className="flex items-center gap-2 font-semibold"><MessageSquare size={15} /> {t('catalogue.checklist.title', { defaultValue: 'Review checklist' })}</div><p className="mt-2 text-xs leading-5">{t('catalogue.checklist.description', { defaultValue: 'Confirm the title, description, price, location, images and availability are accurate before approving.' })}</p></div></div><div className="mt-8 grid gap-2 sm:grid-cols-3"><button type="button" disabled={!!busy} onClick={() => void review(active, 'approve')} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">{t('batchActions.approve', { defaultValue: 'Approve' })}</button><button type="button" disabled={!!busy} onClick={() => void review(active, 'change_requested')} className="rounded-xl border border-amber-200 px-4 py-3 text-sm font-semibold text-amber-700 disabled:opacity-50">{t('batchActions.request_changes', { defaultValue: 'Request changes' })}</button><button type="button" disabled={!!busy} onClick={() => void review(active, 'reject')} className="rounded-xl border border-red-200 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-50">{t('batchActions.reject', { defaultValue: 'Reject' })}</button></div></aside></div>}
    </main>
  );
}
