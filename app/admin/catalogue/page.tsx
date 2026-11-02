'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Check, ChevronLeft, ChevronRight, ClipboardCheck, Eye, MessageSquare, RefreshCw, X } from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { HotelProfileDiff } from '@/components/admin/hotel-profile-diff';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useAppDialog } from '@/components/providers/app-dialog';
import { AdminBatchActionBar } from '@/components/admin/batch-action-bar';
import { AdminSegmentedFilter } from '@/components/admin/segmented-filter';
import { AdminFilterBar } from '@/components/admin/filter-bar';
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { useTranslation } from 'react-i18next';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { useVisibleReviewRefresh } from '@/hooks/use-visible-review-refresh';

type ReviewItem = {
  id: string;
  entityType: 'outlet' | 'product' | 'voucher' | 'hotel_profile';
  entityLabel: string;
  live?: Record<string, unknown> | null;
  updated_at: string;
  proposed?: Record<string, unknown> | null;
  context: string;
  vendor_id: string;
  vendors?: { name?: string } | null;
  review_note?: string | null;
  created_at: string;
  display_id?: string | null;
};



const labelKeys: Record<ReviewItem['entityType'], string> = {
  outlet: 'catalogue.entity.outlet',
  product: 'catalogue.entity.listing',
  voucher: 'catalogue.entity.voucher',
  hotel_profile: 'catalogue.entity.hotelProfile',
};

export default function CatalogueReviewPage() {
  const { t, i18n } = useTranslation('admin');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const { prompt } = useAppDialog();
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [filter, setFilter] = useState<'all' | ReviewItem['entityType']>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [active, setActive] = useState<ReviewItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [batchDraftNote, setBatchDraftNote] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<10 | 25 | 50>(10);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [counts, setCounts] = useState({ all: 0, outlet: 0, product: 0, voucher: 0, hotel_profile: 0 });

  const load = useCallback(async (signal?: AbortSignal): Promise<ReviewItem[] | null> => {
    if (!signal) setLoading(true);
    setError(null);
    try {
      const query = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (filter !== 'all') query.set('entityType', filter);
      const response = await fetch(`/api/admin/catalogue/reviews?${query}`, { cache: 'no-store', signal });
      if (response.status === 401 || response.status === 403) { setItems([]); setActive(null); setSelectedIds(new Set()); throw Object.assign(new Error(t("reviewRefresh.denied")), { status: response.status }); }
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('catalogue.errors.loadQueue'));
      const nextItems = payload.data?.items ?? [];
      const nextTotal = payload.data?.total ?? 0;
      const nextTotalPages = payload.data?.totalPages ?? 0;
      if (page > Math.max(1, nextTotalPages)) {
        setSelectedIds(new Set());
        setTotal(nextTotal);
        setTotalPages(nextTotalPages);
        setCounts(payload.data?.counts ?? { all: 0, outlet: 0, product: 0, voucher: 0, hotel_profile: 0 });
        setPage(Math.max(1, nextTotalPages));
        return [];
      }
      setItems(nextItems);
      const currentKeys = new Set(nextItems.map((item: ReviewItem) => `${item.entityType}:${item.id}`));
      setSelectedIds((current) => new Set([...current].filter((key) => currentKeys.has(key))));
      setTotal(nextTotal);
      setTotalPages(nextTotalPages);
      setCounts(payload.data?.counts ?? { all: 0, outlet: 0, product: 0, voucher: 0, hotel_profile: 0 });
      return nextItems;
    } catch (reason) {
      if (signal) throw reason;
      setError(reason instanceof Error ? reason.message : t('catalogue.errors.loadQueue'));
      return null;
    } finally {
      if (!signal) setLoading(false);
    }
  }, [filter, page, pageSize, t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  const reviewRefresh = useVisibleReviewRefresh({ enabled: true, onRefresh: load });

  async function performReview(item: ReviewItem, action: 'approve' | 'change_requested' | 'reject', note?: string) {
    const trimmedNote = note?.trim();
    if (action !== 'approve' && (!trimmedNote || trimmedNote.length < 10)) {
      const message = t('catalogue.errors.reasonLength');
      setError(message);
      showFeedback('error', message);
      return;
    }
    setBusy(`${action}:${item.id}`);
    try {
      const response = await fetch('/api/admin/catalogue/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: item.entityType, entityId: item.id, action, note: trimmedNote, expectedVersion: item.updated_at }),
      });
      const payload = await response.json();
      if (response.status === 409) {
        const refreshed = await load();
        const current = refreshed?.find((candidate) => candidate.id === item.id && candidate.entityType === item.entityType);
        setActive(current ?? null);
        const message = t('catalogue.errors.reviewConflict');
        setError(message);
        showFeedback('error', message);
        return;
      }
      if (!response.ok) throw new Error(payload.error?.message || t('catalogue.errors.actionFailed'));
      showFeedback('success', t(`catalogue.success.${action}`, { entity: t(labelKeys[item.entityType]) }));
      setDraftNotes((current) => {
        const next = { ...current };
        delete next[`${item.entityType}:${item.id}`];
        return next;
      });
      const currentIndex = visible.findIndex((v) => v.id === item.id && v.entityType === item.entityType);
      if (currentIndex >= 0 && currentIndex < visible.length - 1) {
        setActive(visible[currentIndex + 1]);
      } else {
        setActive(null);
      }
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
    const key = `${item.entityType}:${item.id}`;
    const note = action === 'approve' ? undefined : await prompt(action === 'reject' ? t('catalogue.prompts.rejectReason') : t('catalogue.prompts.changeReason'), draftNotes[key] ?? '');
    if (action !== 'approve' && note === null) return;
    if (typeof note === 'string') setDraftNotes((current) => ({ ...current, [key]: note }));
    await performReview(item, action, note ?? undefined);
  }

  async function applyBatch(action: 'approve' | 'change_requested' | 'reject') {
    const selected = visible.filter((item) => selectedIds.has(`${item.entityType}:${item.id}`));
    if (!selected.length) return;
    const note = action === 'approve' ? undefined : await prompt(action === 'reject' ? t('catalogue.prompts.batchRejectReason') : t('catalogue.prompts.batchChangeReason'), batchDraftNote);
    if (action !== 'approve' && note === null) return;
    const trimmedNote = note?.trim();
    if (typeof note === 'string') setBatchDraftNote(note);
    if (action !== 'approve' && (!trimmedNote || trimmedNote.length < 10)) {
      const message = t('catalogue.errors.reasonLength');
      setError(message);
      showFeedback('error', message);
      return;
    }
    setBusy(`batch:${action}`);
    try {
      const results = await Promise.all(selected.map((item) => fetch('/api/admin/catalogue/reviews', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType: item.entityType, entityId: item.id, action, note: trimmedNote, expectedVersion: item.updated_at }),
      })));
      const failed = results.find((response) => !response.ok);
      if (failed) {
        const payload = await failed.json().catch(() => ({}));
        if (failed.status === 409) {
          await load();
          const message = t('catalogue.errors.reviewConflict');
          setError(message);
          showFeedback('error', message);
          return;
        }
        throw new Error(payload.error?.message || t('catalogue.errors.batchFailed'));
      }
      showFeedback('success', t('catalogue.success.batchProcessed', { count: selected.length }));
      setSelectedIds(new Set());
      setBatchDraftNote('');
      await load();
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : t('catalogue.errors.batchReviewFailed');
      setError(message);
      showFeedback('error', message);
    } finally {
      setBusy(null);
    }
  }

  /* eslint-disable react-hooks/preserve-manual-memoization */
  const visible = items;
  const selectedVisibleCount = useMemo(
    () => visible.filter((item) => selectedIds.has(`${item.entityType}:${item.id}`)).length,
    [visible, selectedIds]
  );
  /* eslint-enable react-hooks/preserve-manual-memoization */
  const activeIndex = active ? visible.findIndex((item) => item.id === active.id && item.entityType === active.entityType) : -1;
  const isActiveStale = active !== null && !items.some((item) => item.id === active.id && item.entityType === active.entityType && item.updated_at === active.updated_at);
  const hasPrevious = activeIndex > 0;
  const hasNext = activeIndex >= 0 && activeIndex < visible.length - 1;

  function goToPrevious() {
    if (hasPrevious) setActive(visible[activeIndex - 1]);
  }

  function goToNext() {
    if (hasNext) setActive(visible[activeIndex + 1]);
  }

  useEffect(() => {
    if (!active) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'ArrowLeft' && hasPrevious) {
        event.preventDefault();
        setActive(visible[activeIndex - 1]);
      } else if (event.key === 'ArrowRight' && hasNext) {
        event.preventDefault();
        setActive(visible[activeIndex + 1]);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [active, hasPrevious, hasNext, visible, activeIndex]);

  return (
    <AdminPageShell>
      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground"><Button type="button" size="sm" variant="outline" onClick={reviewRefresh.refresh}>{t("actions.refresh")}</Button><span role="status">{reviewRefresh.hasRefreshError ? t("reviewRefresh.stale") : t("dashboard.lastRefreshed")} · {reviewRefresh.lastSuccessAt ? new Date(reviewRefresh.lastSuccessAt).toLocaleTimeString() : "—"}</span></div>
      <AdminPageHeader
        eyebrow={<><ClipboardCheck size={15} /> {t('catalogue.eyebrow')}</>}
        title={t('catalogue.title')}
        actions={<div className="flex flex-wrap items-center justify-end gap-2"><Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}><RefreshCw size={14} />{t('actions.refresh')}</Button><Button asChild variant="outline" size="sm"><Link href="/admin/catalogue/hotel-amenities">{t('hotelAmenities.manage')}</Link></Button></div>}
      />
      <AdminMetricGrid items={[{ label: t('catalogue.waiting'), value: total }]} />

        <AdminFilterBar>
          <AdminSegmentedFilter
            value={filter}
            ariaLabel="catalogue.accessibility.itemType"
            fullWidth={false}
            items={(['all', 'outlet', 'product', 'voucher', 'hotel_profile'] as const).map((value) => ({ value, label: value === 'all' ? t('catalogue.filters.allItems') : t(labelKeys[value]), count: counts[value] }))}
            onChange={(value) => { setFilter(value as 'all' | ReviewItem['entityType']); setPage(1); setSelectedIds(new Set()); }}
          />
          <select aria-label={t('catalogue.pagination.pageSize')} value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value) as 10 | 25 | 50); setPage(1); setSelectedIds(new Set()); }} className="h-10 rounded-lg border border-border bg-background px-3 text-sm">
            {[10, 25, 50].map((size) => <option key={size} value={size}>{t('catalogue.pagination.perPage', { count: size })}</option>)}
          </select>
        </AdminFilterBar>

        {error && <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          <div className="border-b border-border bg-muted/50 px-5 py-3"><AdminBatchActionBar selectedCount={selectedVisibleCount} onClear={() => setSelectedIds(new Set())} onApply={(action) => void applyBatch(action as 'approve' | 'change_requested' | 'reject')} actions={[{ value: 'approve', label: t('batchActions.approve') }, { value: 'change_requested', label: t('batchActions.request_changes') }, { value: 'reject', label: t('batchActions.reject') }]} busy={Boolean(busy?.startsWith('batch:'))} /></div>
          <div className="hidden grid-cols-[36px_110px_minmax(220px,1.5fr)_minmax(150px,1fr)_150px_90px] gap-4 border-b border-border bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid"><span><input type="checkbox" aria-label={t('catalogue.accessibility.selectAll')} checked={visible.length > 0 && selectedVisibleCount === visible.length} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); visible.forEach((item) => { const key = `${item.entityType}:${item.id}`; if (event.target.checked) next.add(key); else next.delete(key); }); return next; })} /></span><span>{t('catalogue.columns.type')}</span><span>{t('catalogue.columns.submission')}</span><span>{t('catalogue.columns.vendorLocation')}</span><span>{t('catalogue.columns.submitted')}</span><span className="text-right">{t('catalogue.columns.action')}</span></div>
          {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-muted" />)}</div> : visible.length === 0 ? <div className="px-6 py-20 text-center text-sm text-muted-foreground"><ClipboardCheck className="mx-auto mb-3 opacity-30" size={36} /><p>{t('catalogue.empty')}</p></div> : <div className="divide-y divide-border">{visible.map((item) => { const key = `${item.entityType}:${item.id}`; return <article key={key} className="grid gap-3 px-4 py-4 md:grid-cols-[36px_110px_minmax(220px,1.5fr)_minmax(150px,1fr)_150px_90px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" aria-label={t('catalogue.accessibility.selectItem', { item: item.entityLabel })} checked={selectedIds.has(key)} onChange={(event) => setSelectedIds((previous) => { const next = new Set(previous); if (event.target.checked) next.add(key); else next.delete(key); return next; })} /></div><div><StatusBadge status={t(labelKeys[item.entityType])} /></div><div className="min-w-0"><p className="truncate font-semibold text-foreground">{item.entityLabel}</p><p className="mt-1 truncate text-xs text-muted-foreground">{item.display_id || item.id} · {item.context || t('catalogue.fallback.noLocation')}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium text-foreground">{item.vendors?.name || t('catalogue.fallback.unknownVendor')}</p><p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t('catalogue.status.pendingReview')}</p></div><div className="text-sm text-muted-foreground">{new Date(item.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}</div><div className="flex justify-end gap-1"><button type="button" title={t('catalogue.actions.openReview')} onClick={() => setActive(item)} className="rounded-lg p-2 text-muted-foreground hover:bg-secondary hover:text-primary"><Eye size={16} /></button><button type="button" title={t('batchActions.approve')} disabled={!!busy} onClick={() => void review(item, 'approve')} className="rounded-lg p-2 text-primary hover:bg-secondary disabled:opacity-40"><Check size={16} /></button></div></article>; })}</div>}
        </section>
        <div className="flex items-center justify-between border-t border-border px-1 py-2 text-xs text-muted-foreground">
          <span>{t('catalogue.pagination.range', { first: total === 0 ? 0 : (page - 1) * pageSize + 1, last: Math.min(page * pageSize, total), total })}</span>
          <div className="flex items-center gap-2"><span>{t('catalogue.pagination.pageOf', { page, totalPages: Math.max(totalPages, 1) })}</span><Button size="sm" variant="outline" aria-label={t('actions.previous')} disabled={page <= 1 || loading} onClick={() => setPage((value) => value - 1)}><ChevronLeft size={14} /></Button><Button size="sm" variant="outline" aria-label={t('actions.next')} disabled={page >= totalPages || loading} onClick={() => setPage((value) => value + 1)}><ChevronRight size={14} /></Button></div>
        </div>
      {active && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 sm:p-6" onClick={() => setActive(null)}>
          <aside role="dialog" aria-modal="true" aria-labelledby="catalogue-review-title" onClick={(event) => event.stopPropagation()} className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-border bg-card p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('catalogue.reviewTitle', { entity: t(labelKeys[active.entityType]) })}</p>
                <h2 id="catalogue-review-title" className="mt-1 text-xl font-bold text-foreground">{active.entityLabel}</h2>
              </div>
              <div className="flex items-center gap-2">
                {visible.length > 1 && (
                  <div className="flex items-center gap-1.5 rounded-xl border border-border bg-muted/60 px-2 py-1">
                    <span className="text-xs font-semibold text-muted-foreground">
                      {activeIndex + 1} / {visible.length}
                    </span>
                    <button
                      type="button"
                      disabled={!hasPrevious}
                      onClick={goToPrevious}
                      title={t('actions.previous')}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <button
                      type="button"
                      disabled={!hasNext}
                      onClick={goToNext}
                      title={t('actions.next')}
                      className="rounded-lg p-1 text-muted-foreground hover:bg-card hover:text-foreground disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
                <button type="button" aria-label={t('catalogue.actions.closeReview')} onClick={() => setActive(null)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={18} /></button>
              </div>
            </div>
            {isActiveStale && <p role="alert" className="mt-4 rounded-xl border border-amber-300/60 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300">{t('catalogue.errors.reviewConflict')}</p>}
            <div className="mt-6 space-y-3 text-sm">
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs text-muted-foreground">{t('catalogue.fields.vendor')}</p>
                <p className="mt-1 font-semibold text-foreground">{active.vendors?.name || t('catalogue.fallback.unknownVendor')}</p>
              </div>
              <div className="rounded-xl bg-muted p-4">
                <p className="text-xs text-muted-foreground">{t('catalogue.fields.reference')}</p>
                <p className="mt-1 break-all font-mono text-xs text-foreground">{active.display_id || active.id}</p>
                <p className="mt-2 text-muted-foreground">{active.context || t('catalogue.fallback.noLocation')}</p>
              </div>
              {active.entityType === 'hotel_profile' && <HotelProfileDiff live={active.live} proposed={active.proposed} />}
              <div className="rounded-xl border border-primary/20 bg-secondary p-4 text-primary">
                <div className="flex items-center gap-2 font-semibold"><MessageSquare size={15} /> {t('catalogue.checklist.title')}</div>
                <p className="mt-2 text-xs leading-5">{t('catalogue.checklist.description')}</p>
              </div>
            </div>
            <div className="mt-8 grid gap-2 sm:grid-cols-3">
              <button type="button" disabled={!!busy || isActiveStale} onClick={() => void review(active, 'approve')} className="rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">{t('batchActions.approve')}</button>
              <button type="button" disabled={!!busy || isActiveStale} onClick={() => void review(active, 'change_requested')} className="rounded-xl border border-amber-300/60 dark:border-amber-500/30 px-4 py-3 text-sm font-semibold text-amber-700 disabled:opacity-50 dark:border-amber-500/40 dark:text-amber-400">{t('batchActions.request_changes')}</button>
              <button type="button" disabled={!!busy || isActiveStale} onClick={() => void review(active, 'reject')} className="rounded-xl border border-destructive/30 px-4 py-3 text-sm font-semibold text-destructive disabled:opacity-50">{t('batchActions.reject')}</button>
            </div>
          </aside>
        </div>
      )}
    </AdminPageShell>
  );
}
