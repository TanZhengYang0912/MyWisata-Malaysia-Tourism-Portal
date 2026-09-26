'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'next/navigation';
import { Check, CirclePlus, Copy, Eye, Percent, Search, ToggleLeft, ToggleRight, Upload, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import VoucherForm from '@/components/vendor/voucher-form';
import { StatusBadge } from '@/components/ui/badge';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { useActionFeedback } from '@/components/providers/action-feedback';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';
import VoucherCsvBuilder, { type VoucherCsvDraftRecord } from '@/components/vendor/voucher-csv-builder';
import { VoucherTicket } from '@/components/vouchers/voucher-ticket';
import { voucherConfirmationCopy } from '@/lib/vendor/voucher-ui';
import { buildVoucherCsv } from '@/lib/vendor/voucher-csv-builder';
import { parseVoucherCsv } from '@/lib/vendor/voucher-csv';
import type { VoucherCsvDraftDocument } from '@/lib/vendor/voucher-csv-draft';
import { DEMO_VOUCHER_PREFIX } from "@/lib/i18n/invariant-tokens";
import { formatMYR, formatMYRNumber } from "@/lib/i18n/format";
import { getMalaysiaDateRangeDefaults } from "@/lib/datetime/date-input";
import { Button } from '@/components/ui/button';
import CenteredDetailModal from '@/components/ui/centered-detail-modal';
import { VoucherMetricCard } from '@/components/vendor/voucher-metric-card';

interface VoucherData { id: string; code: string; name: string; voucher_type: string; discount_value: number; min_spend: number; max_uses: number | null; uses_count: number; valid_from: string | null; valid_until: string | null; is_active: boolean; status: string; vendor_review_status?: string | null; buy_quantity?: number | null; free_quantity?: number | null; product_id?: string | null; outlets?: { id?: string; name?: string; city?: string; state?: string } | null }
interface VoucherAnalytics { voucherId: string; code: string; name: string; outletName: string; views: number; entries: number; applies: number; redemptions: number; uniqueCustomers: number; redemptionRate: number | null; discount: number; revenue: number; revenueImpact: number }
interface OutletOption { id: string; name: string; coverUrl?: string | null }
interface ProductOption { id: string; name: string }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
const statuses = ['all', 'pending_review', 'active', 'scheduled', 'inactive', 'expired'];

function dateLabel(value: string | null, locale: string, fallback: string) { return value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : fallback; }

type PendingAction =
  | { kind: 'toggle'; voucher: VoucherData; nextActive: boolean }
  | { kind: 'batch'; action: 'activate' | 'deactivate'; count: number }
  | null;

export default function VendorVouchersPage() {
  const { t, i18n } = useTranslation('vendor');
  const locale = i18n.resolvedLanguage || i18n.language;
  const searchParams = useSearchParams();
  const requestedOutletId = searchParams.get('outletId') || undefined;
  const requestedCreate = searchParams.get('create') === '1';
  const discountLabel = (voucher: VoucherData) => voucher.voucher_type === 'fixed'
    ? t('ui.vouchers.fixedDiscount', { amount: formatMYRNumber(Number(voucher.discount_value)) })
    : voucher.voucher_type === 'percent'
      ? t('ui.vouchers.percentDiscount', { percent: Number(voucher.discount_value) })
      : voucher.voucher_type === 'bogo'
        ? t('ui.vouchers.bogoDiscount', { buy: voucher.buy_quantity || 1, free: voucher.free_quantity || 1 })
        : t('ui.vouchers.offer');
  const { user, isVendorOwner, isOutletManager } = useAuth();
  const { showFeedback } = useActionFeedback();
  const vendorId = user?.activeVendorId;
  const [vouchers, setVouchers] = useState<VoucherData[]>([]);
  const [selectedVoucher, setSelectedVoucher] = useState<VoucherData | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [stats, setStats] = useState<Record<string, number>>({});
  const [status, setStatus] = useState('all');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const [analytics, setAnalytics] = useState<VoucherAnalytics[]>([]);
  const [outlets, setOutlets] = useState<OutletOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [analyticsRange, setAnalyticsRange] = useState<'all' | '7d' | '30d' | '12m' | 'custom'>('30d');
  const [analyticsFrom, setAnalyticsFrom] = useState('');
  const [analyticsTo, setAnalyticsTo] = useState('');
  const [analyticsOutlet, setAnalyticsOutlet] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [csvBuilderOpen, setCsvBuilderOpen] = useState(false);
  const [csvDrafts, setCsvDrafts] = useState<VoucherCsvDraftRecord[]>([]);
  const [csvDraft, setCsvDraft] = useState<VoucherCsvDraftRecord | null>(null);
  const [importDraftId, setImportDraftId] = useState<string | undefined>();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [generatedCsv, setGeneratedCsv] = useState<string | null>(null);
  const [autoGenerate, setAutoGenerate] = useState(true);
  const [codePrefix, setCodePrefix] = useState('TRAVEL');
  const [uploadBusy, setUploadBusy] = useState(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction>(null);
  const [actionBusy, setActionBusy] = useState(false);

  function primeAnalyticsDateRange() {
    const defaults = getMalaysiaDateRangeDefaults();
    setAnalyticsFrom((value) => value || defaults.from);
    setAnalyticsTo((value) => value || defaults.to);
  }
  const analyticsTotals = analytics.reduce((totals, item) => ({
    views: totals.views + item.views,
    entries: totals.entries + item.entries,
    applies: totals.applies + item.applies,
    redemptions: totals.redemptions + item.redemptions,
    uniqueCustomers: totals.uniqueCustomers + item.uniqueCustomers,
    discount: totals.discount + item.discount,
    revenue: totals.revenue + item.revenue,
    revenueImpact: totals.revenueImpact + item.revenueImpact,
  }), { views: 0, entries: 0, applies: 0, redemptions: 0, uniqueCustomers: 0, discount: 0, revenue: 0, revenueImpact: 0 });

  const loadVouchers = useCallback(async (page = 1) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10', q, status });
      const response = await fetch(`/api/vendors/${vendorId}/vouchers?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.vouchers.loadFailed'));
      setVouchers(payload.data?.items || []); setPagination(payload.data?.pagination || { page, pageSize: 10, total: 0, totalPages: 1 }); setStats(payload.data?.stats || {});
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t('ui.vouchers.loadFailed')); }
    finally { setLoading(false); }
  }, [q, status, t, vendorId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadVouchers(1); }, [loadVouchers]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (requestedCreate && vendorId) setShowForm(true); }, [requestedCreate, vendorId]);
  useEffect(() => {
    if (!vendorId) return;
    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=100&sort=name`, { cache: 'no-store' }),
      fetch(`/api/vendors/${vendorId}/products?page=1&pageSize=24&sort=name`, { cache: 'no-store' }),
    ])
      .then(async ([outletResponse, productResponse]) => {
        const [outletPayload, productPayload] = await Promise.all([outletResponse.json(), productResponse.json()]);
        if (!outletResponse.ok) throw new Error(outletPayload.error?.message || t('ui.vouchers.loadOutletsFailed'));
        if (!productResponse.ok) throw new Error(productPayload.error?.message || t('ui.vouchers.loadProductsFailed'));
        setOutlets((outletPayload.data?.items || []).map((outlet: OutletOption) => ({ id: outlet.id, name: outlet.name, coverUrl: outlet.coverUrl ?? null })));
        setProducts((productPayload.data?.items || []).map((product: ProductOption) => ({ id: product.id, name: product.name })));
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : t('ui.vouchers.loadOptionsFailed')));
  }, [t, vendorId]);
  const loadAnalytics = useCallback(async () => {
    if (!vendorId || !isVendorOwner) return;
    const params = new URLSearchParams();
    if (analyticsOutlet) params.set('outletId', analyticsOutlet);
    if (analyticsRange !== 'all') {
      const now = new Date();
      const end = analyticsRange === 'custom' ? analyticsTo : now.toISOString().slice(0, 10);
      const start = analyticsRange === 'custom' ? analyticsFrom : new Date(now.getTime() - (analyticsRange === '7d' ? 6 : analyticsRange === '12m' ? 364 : 29) * 86400000).toISOString().slice(0, 10);
      if (start) params.set('from', start);
      if (end) params.set('to', end);
    }
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/analytics?${params.toString()}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.vouchers.loadAnalyticsFailed'));
      setAnalytics(payload.data || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('ui.vouchers.loadAnalyticsFailed'));
    }
  }, [analyticsFrom, analyticsOutlet, analyticsRange, analyticsTo, isVendorOwner, t, vendorId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  async function toggleActive(voucher: VoucherData) {
    if (!vendorId) return false;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/${voucher.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !voucher.is_active }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('ui.vouchers.updateFailed'); setError(message); showFeedback('error', message); return false; }
      showFeedback('success', voucher.is_active ? t('ui.vouchers.deactivated') : t('ui.vouchers.activated'));
      setSelectedVoucher(null);
      await Promise.all([loadVouchers(pagination.page), loadAnalytics()]);
      return true;
    } catch { setError(t('ui.vouchers.updateFailed')); showFeedback('error', t('ui.vouchers.updateTryAgain')); return false; }
  }

  async function reviewVoucher(voucher: VoucherData, action: 'approve' | 'reject') {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/${voucher.id}/review`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.vouchers.reviewFailed'));
      await loadVouchers(pagination.page);
      showFeedback('success', t(action === 'approve' ? 'ui.vouchers.approved' : 'ui.vouchers.rejected'));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('ui.vouchers.reviewFailed'));
      showFeedback('error', t('ui.vouchers.reviewFailed'));
    }
  }

  function requestToggle(voucher: VoucherData) {
    setPendingAction({ kind: 'toggle', voucher, nextActive: !voucher.is_active });
  }

  async function copyCode(code: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = code;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        const copied = document.execCommand('copy');
        textarea.remove();
        if (!copied) throw new Error('Clipboard is unavailable');
      }
      setCopiedCode(code);
      window.setTimeout(() => setCopiedCode((current) => current === code ? null : current), 1600);
      showFeedback('success', t('ui.vouchers.codeCopied', { code }));
    } catch {
      setError(t('ui.vouchers.copyManual'));
      showFeedback('error', t('ui.vouchers.copyFailed'));
    }
  }

  function openUploadDialog() {
    setUploadFile(null);
    setGeneratedCsv(null);
    setCsvDraft(null);
    setImportDraftId(undefined);
    setBulkMessage('');
    setUploadOpen(true);
  }

  function closeUploadDialog() {
    if (uploadBusy) return;
    setUploadOpen(false);
    setUploadFile(null);
    setGeneratedCsv(null);
  }

  function openCsvBuilder() {
    setUploadOpen(false);
    setCsvBuilderOpen(true);
    void loadCsvDrafts();
  }

  function returnToUpload() {
    setCsvBuilderOpen(false);
    setUploadOpen(true);
  }

  function useBuiltCsv(document: VoucherCsvDraftDocument, draftId?: string) {
    setGeneratedCsv(buildVoucherCsv(document.rows));
    setUploadFile(null);
    setCodePrefix(document.codePrefix);
    setAutoGenerate(document.autoGenerate);
    setImportDraftId(draftId);
    setCsvBuilderOpen(false);
    setUploadOpen(true);
  }

  async function loadCsvDrafts() {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/drafts`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.vouchers.draftsLoadFailed'));
      setCsvDrafts(payload.data || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('ui.vouchers.draftsLoadFailed'));
    }
  }

  async function loadCsvDraft(id: string) {
    if (!vendorId) return null;
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/drafts?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || t('ui.vouchers.draftLoadFailed'));
    const loaded = payload.data as VoucherCsvDraftRecord;
    setCsvDraft(loaded);
    return loaded;
  }

  async function saveCsvDraft(input: { id?: string; document: VoucherCsvDraftDocument; expectedDraftVersion?: number }) {
    if (!vendorId) return null;
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || t('ui.vouchers.draftSaveFailed'));
    const saved = payload.data as VoucherCsvDraftRecord;
    setCsvDraft(saved);
    setCsvDrafts((current) => [saved, ...current.filter((draft) => draft.id !== saved.id)]);
    return saved;
  }

  async function deleteCsvDraft(id: string) {
    if (!vendorId) return false;
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/drafts?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    const payload = await response.json();
    if (!response.ok) {
      showFeedback('error', payload.error?.message || t('ui.vouchers.draftDiscardFailed'));
      return false;
    }
    setCsvDrafts((current) => current.filter((draft) => draft.id !== id));
    if (csvDraft?.id === id) setCsvDraft(null);
    return true;
  }

  async function uploadCsv() {
    if (!vendorId || (!uploadFile && !generatedCsv)) return false;
    const prefix = codePrefix.trim().toUpperCase();
    setUploadBusy(true);
    try {
      const csv = generatedCsv || (uploadFile ? await uploadFile.text() : '');
      const rows = parseVoucherCsv(csv.trim());
      const headers = (rows.shift() || []).map((header) => header.toLowerCase());
      const codeColumn = headers.indexOf('code');
      const hasBlankCodes = codeColumn < 0 || rows.some((row) => !(row[codeColumn] || '').trim());
      if (autoGenerate && hasBlankCodes && prefix.length < 2) {
        setBulkMessage(t('ui.vouchers.addCodePrefix'));
        return false;
      }
      const codePrefix = autoGenerate && prefix.length >= 2 ? prefix : undefined;
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, codePrefix }) });
      const payload = await response.json();
      if (!response.ok) {
        const failed = payload.error?.details?.failed as { row: number; errors: string[] }[] | undefined;
        const failedRows = failed?.length ? t('ui.vouchers.failedRows', { details: failed.map((item) => `#${item.row} ${item.errors.join(', ')}`).join(' · ') }) : '';
        const message = [payload.error?.message || t('ui.vouchers.uploadFailed'), failedRows].filter(Boolean).join(' ');
        setBulkMessage(message);
        showFeedback('error', payload.error?.message || t('ui.vouchers.uploadFailed'));
        return false;
      }
      const failed = payload.data?.failed as { row: number; errors: string[] }[] | undefined;
      const generated = payload.data?.generated ? t('ui.vouchers.generatedCodes', { count: payload.data.generated, prefix: codePrefix }) : '';
      const failedRows = failed?.length ? t('ui.vouchers.failedRows', { details: failed.map((item) => `#${item.row} ${item.errors.join(', ')}`).join(' · ') }) : '';
      setBulkMessage([t('ui.vouchers.uploadedForReview', { count: payload.data?.inserted || 0 }), generated, failedRows].filter(Boolean).join(' '));
      showFeedback('success', t('ui.vouchers.uploaded', { count: payload.data?.inserted || 0 }));
      setUploadOpen(false);
      setUploadFile(null);
      setGeneratedCsv(null);
      if (importDraftId) {
        const draftCleared = await deleteCsvDraft(importDraftId);
        if (!draftCleared) showFeedback('error', t('ui.vouchers.draftClearFailed'));
        setImportDraftId(undefined);
      }
      await Promise.all([loadVouchers(1), loadAnalytics()]);
      return true;
    } catch {
      setBulkMessage(t('ui.vouchers.uploadCheckFailed'));
      showFeedback('error', t('ui.vouchers.uploadTryAgain'));
      return false;
    } finally {
      setUploadBusy(false);
    }
  }
  function toggleSelected(voucherId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(voucherId) ? current.filter((id) => id !== voucherId) : [...current, voucherId]); }
  function requestBatchAction(action: string) {
    if (action !== 'activate' && action !== 'deactivate') return;
    const count = allFilteredSelected ? pagination.total : selectedIds.length;
    if (!count) return;
    setPendingAction({ kind: 'batch', action, count });
  }

  async function applyBatch(action: 'activate' | 'deactivate') {
    if (!vendorId) return false;
    setBatchBusy(true); setBatchMessage(''); setError('');
    try {
      const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'vouchers', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters: { q, status } }) });
      const payload = await response.json();
      if (!response.ok) { const message = payload.error?.message || t('ui.vouchers.batchFailed'); setError(message); showFeedback('error', message); return false; }
      setBatchMessage(payload.data?.skipped ? t('ui.vouchers.batchUpdatedSkipped', { updated: payload.data.updated, skipped: payload.data.skipped }) : t('ui.vouchers.batchUpdated', { count: payload.data?.updated || 0 }));
      setSelectedIds([]); setAllFilteredSelected(false);
      await Promise.all([loadVouchers(1), loadAnalytics()]);
      showFeedback('success', action === 'activate' ? t('ui.vouchers.batchActivated', { count: payload.data?.updated || 0 }) : t('ui.vouchers.batchDeactivated', { count: payload.data?.updated || 0 }));
      return true;
    } catch {
      setError(t('ui.vouchers.batchFailed'));
      showFeedback('error', t('ui.vouchers.batchTryAgain'));
      return false;
    } finally {
      setBatchBusy(false);
    }
  }

  async function confirmPendingAction() {
    if (!pendingAction) return;
    setActionBusy(true);
    const action = pendingAction;
    const succeeded = action.kind === 'toggle'
      ? await toggleActive(action.voucher)
      : await applyBatch(action.action);
    setActionBusy(false);
    if (succeeded) setPendingAction(null);
  }

  const confirmationCopy = pendingAction
    ? pendingAction.kind === 'toggle'
      ? voucherConfirmationCopy({ action: pendingAction.nextActive ? 'activate' : 'deactivate', code: pendingAction.voucher.code })
      : voucherConfirmationCopy({ action: pendingAction.action, count: pendingAction.count })
    : null;
  const uploadCopy = voucherConfirmationCopy({ action: 'upload' });
  const summaryMetrics = [
    { label: t('ui.status.active'), value: stats.active || 0, note: t('ui.vouchers.currentFilter'), tone: 'navy' as const },
    { label: t('ui.status.scheduled'), value: stats.scheduled || 0, note: t('ui.vouchers.currentFilter'), tone: 'muted' as const },
    { label: t('ui.status.expired'), value: stats.expired || 0, note: t('ui.vouchers.currentFilter'), tone: 'muted' as const },
    { label: t('ui.status.inactive'), value: stats.inactive || 0, note: t('ui.vouchers.currentFilter'), tone: 'muted' as const },
  ];
  const analyticsMetrics = [
    { label: t('ui.vouchers.metrics.views'), value: analyticsTotals.views },
    { label: t('ui.vouchers.metrics.entries'), value: analyticsTotals.entries },
    { label: t('ui.vouchers.metrics.applies'), value: analyticsTotals.applies },
    { label: t('ui.vouchers.metrics.redemptions'), value: analyticsTotals.redemptions },
    { label: t('ui.vouchers.metrics.customerReach'), value: analyticsTotals.uniqueCustomers },
    { label: t('ui.vouchers.salesGenerated'), value: formatMYR(analyticsTotals.revenue), tone: 'gold' as const },
    { label: t('ui.vouchers.discountCost'), value: formatMYR(analyticsTotals.discount), tone: 'gold' as const },
    { label: t('ui.vouchers.netRevenueImpact'), value: formatMYR(analyticsTotals.revenueImpact), tone: 'navy' as const },
  ];
  const bestVoucher = analytics[0];
  const selectedVoucherOutletImages = selectedVoucher
    ? outlets
      .filter((outlet) => (!selectedVoucher.outlets?.id || outlet.id === selectedVoucher.outlets.id) && Boolean(outlet.coverUrl))
      .slice(0, 4)
      .map((outlet) => ({ src: outlet.coverUrl!, alt: outlet.name }))
    : [];

  return (
    <div className="space-y-8 text-foreground">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-primary"><Percent size={15} /> {t('ui.vouchers.campaignControl')}</div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-950">{t('ui.vouchers.title')}</h1>
          <p className="mt-1 max-w-2xl text-sm text-gray-500">{t('ui.vouchers.description')}</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          {(isVendorOwner || isOutletManager) && <Button type="button" variant="outline" onClick={openUploadDialog} className="h-10 rounded-xl border-primary/20 px-4 font-semibold text-primary hover:border-primary/40 hover:bg-secondary"><Upload size={16} /> {t('ui.vouchers.uploadCsv')}</Button>}
          <Button type="button" onClick={() => setShowForm(true)} className="h-10 rounded-xl bg-primary px-4 font-semibold shadow-sm"><CirclePlus size={17} /> {t('ui.vouchers.createVoucher')}</Button>
        </div>
      </header>
      {bulkMessage && <div className="rounded-2xl border border-primary/10 bg-secondary/70 px-4 py-3 text-sm text-primary">{bulkMessage} <span className="ml-1 text-xs">{t('ui.vouchers.csvColumns')}</span></div>}

      <section data-voucher-workspace="summary" className="rounded-2xl border border-border bg-card p-3 shadow-sm">
        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{summaryMetrics.map((metric) => <VoucherMetricCard key={metric.label} {...metric} density="compact" />)}</div>
      </section>

      <div data-voucher-workspace="filters" className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-3 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex gap-1 overflow-x-auto rounded-xl bg-secondary p-1">{statuses.map((item) => <button key={item} type="button" onClick={() => { setStatus(item); setPagination((current) => ({ ...current, page: 1 })); }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 ${status === item ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>{t(`ui.vouchers.statuses.${item}`)}</button>)}</div><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={15} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder={t('ui.vouchers.searchPlaceholder')} className="h-10 w-full rounded-xl border border-border bg-background pl-9 pr-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 md:w-64" /></label></div>
      {isVendorOwner && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(vouchers.map((voucher) => voucher.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={requestBatchAction} actions={[{ value: 'activate', label: t('ui.vouchers.activateSelected') }, { value: 'deactivate', label: t('ui.vouchers.deactivateSelected') }]} busy={batchBusy || actionBusy} message={batchMessage} />}

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section data-voucher-workspace="list" className="overflow-hidden rounded-3xl border border-border bg-card shadow-sm">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-2xl bg-secondary" />)}</div> : vouchers.length === 0 ? <div className="px-6 py-16 text-center text-sm text-muted-foreground"><Percent className="mx-auto mb-3 text-primary opacity-30" size={34} /><p>{t('ui.vouchers.noMatches')}</p></div> : <><div className="border-b border-border bg-secondary/40 px-5 py-3 text-xs text-muted-foreground"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={vouchers.length > 0 && vouchers.every((voucher) => selectedIds.includes(voucher.id))} onChange={(event) => { setAllFilteredSelected(false); setSelectedIds(event.target.checked ? vouchers.map((voucher) => voucher.id) : []); }} /> {t('ui.vouchers.selectCurrentPage')}</label></div><div className="hidden grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] gap-4 border-b border-border bg-secondary/40 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground md:grid"><span></span><span>{t('ui.vouchers.code')}</span><span>{t('ui.vouchers.campaign')}</span><span>{t('ui.vouchers.discount')}</span><span>{t('ui.vouchers.usage')}</span><span>{t('ui.vouchers.status')}</span><span className="text-right">{t('ui.vouchers.action')}</span></div><div className="divide-y divide-border">{vouchers.map((voucher) => <article key={voucher.id} className="grid gap-3 px-4 py-4 transition hover:bg-secondary/40 md:grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(voucher.id)} onChange={() => toggleSelected(voucher.id)} aria-label={t('ui.vouchers.selectVoucher', { code: voucher.code })} /></div><div className="flex items-center gap-2"><span className="rounded-lg bg-secondary px-2 py-1 font-mono text-xs font-bold text-primary">{voucher.code}</span><button type="button" title={copiedCode === voucher.code ? t('ui.vouchers.copied') : t('ui.vouchers.copyCode')} aria-label={copiedCode === voucher.code ? t('ui.vouchers.codeCopied', { code: voucher.code }) : t('ui.vouchers.copyCodeValue', { code: voucher.code })} onClick={() => void copyCode(voucher.code)} className="rounded-lg p-1.5 text-muted-foreground hover:bg-secondary hover:text-primary">{copiedCode === voucher.code ? <Check size={13} /> : <Copy size={13} />}</button></div><div className="min-w-0"><button type="button" onClick={() => setSelectedVoucher(voucher)} className="block max-w-full truncate text-left font-semibold text-foreground hover:text-primary">{voucher.name}</button><p className="mt-1 truncate text-xs text-muted-foreground">{voucher.outlets?.name || t('ui.vouchers.allOutlets')}</p></div><div className="text-sm font-semibold text-foreground">{discountLabel(voucher)}<span className="mt-1 block text-[11px] font-normal text-muted-foreground">{t('ui.vouchers.minimumAmount', { amount: formatMYRNumber(Number(voucher.min_spend)) })}</span></div><div className="text-xs text-muted-foreground">{voucher.uses_count} {voucher.max_uses ? `/ ${voucher.max_uses}` : t('ui.vouchers.uses')}<span className="mt-1 block text-muted-foreground/70">{t('ui.vouchers.endsOn', { date: dateLabel(voucher.valid_until, locale, t('ui.vouchers.noEndDate')) })}</span></div><div><StatusBadge status={voucher.status} /></div><div className="flex justify-end gap-1"><Button type="button" variant="ghost" size="icon" title={t('ui.vouchers.viewVoucher')} onClick={() => setSelectedVoucher(voucher)} className="rounded-lg text-muted-foreground hover:bg-secondary hover:text-primary"><Eye size={16} /></Button><Button type="button" variant="ghost" size="icon" title={voucher.is_active ? t('ui.vouchers.deactivate') : t('ui.vouchers.activate')} aria-label={`${voucher.is_active ? t('ui.vouchers.deactivate') : t('ui.vouchers.activate')} ${voucher.code}`} onClick={() => requestToggle(voucher)} className={voucher.is_active ? 'rounded-lg text-red-500 hover:bg-red-50' : 'rounded-lg text-primary hover:bg-secondary'}>{voucher.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</Button></div></article>)}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadVouchers(page); }} /></>}</section>

      {isVendorOwner && <section data-voucher-workspace="performance" className="rounded-3xl border border-border bg-card p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div><div className="mb-2 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-primary"><Percent size={14} /> {t('ui.vouchers.campaignControl')}</div><p className="text-lg font-bold text-foreground">{t('ui.vouchers.performance')}</p><p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">{t('ui.vouchers.performanceDescription')}</p></div>
          <div className="flex flex-wrap gap-2"><select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value as typeof analyticsRange)} className="h-10 rounded-xl border border-border bg-background px-3 text-xs font-semibold text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"><option value="all">{t('ui.vouchers.allTime')}</option><option value="7d">{t('ui.vouchers.last7Days')}</option><option value="30d">{t('ui.vouchers.last30Days')}</option><option value="12m">{t('ui.vouchers.last12Months')}</option><option value="custom">{t('ui.vouchers.customDates')}</option></select><select value={analyticsOutlet} onChange={(event) => setAnalyticsOutlet(event.target.value)} className="h-10 max-w-48 rounded-xl border border-border bg-background px-3 text-xs text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"><option value="">{t('ui.vouchers.allOutlets')}</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select>{analyticsRange === 'custom' && <><input type="date" value={analyticsFrom} onFocus={primeAnalyticsDateRange} onChange={(event) => setAnalyticsFrom(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><input type="date" value={analyticsTo} min={analyticsFrom || undefined} onFocus={primeAnalyticsDateRange} onChange={(event) => setAnalyticsTo(event.target.value)} className="h-10 rounded-xl border border-border bg-background px-3 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></>}</div>
        </div>
        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(260px,0.7fr)]">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-2">{analyticsMetrics.map((metric) => <VoucherMetricCard key={metric.label} {...metric} density="compact" />)}</div>
          <article className="rounded-2xl border border-primary/15 bg-secondary/45 p-4">
            {bestVoucher ? <><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold uppercase tracking-[0.13em] text-primary">{t('ui.vouchers.bestPerformingPrefix')}</p><p className="mt-2 font-mono text-sm font-bold text-foreground">{bestVoucher.code}</p></div><span className="rounded-full bg-card px-2.5 py-1 text-xs font-semibold text-primary shadow-sm">{t('ui.vouchers.usesCount', { count: bestVoucher.redemptions })}</span></div><p className="mt-3 font-semibold text-foreground">{bestVoucher.name}</p><p className="mt-1 text-sm text-muted-foreground">{bestVoucher.outletName}</p><p className="mt-4 text-xs leading-5 text-muted-foreground">{bestVoucher.redemptionRate === null ? t('ui.vouchers.unlimitedUsage') : t('ui.vouchers.usageCap', { percent: bestVoucher.redemptionRate })} · {t('ui.vouchers.analyticsAmounts', { revenue: formatMYRNumber(bestVoucher.revenue), discount: formatMYRNumber(bestVoucher.discount), impact: formatMYRNumber(bestVoucher.revenueImpact) })}</p></> : <p className="text-sm text-muted-foreground">{t('ui.vouchers.noAnalyticsMatches')}</p>}
          </article>
        </div>
      </section>}

      {showForm && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><VoucherForm vendorId={vendorId} initialOutletId={isOutletManager ? user?.activeOutletIds?.[0] : requestedOutletId} isOutletManager={isOutletManager} onSuccess={() => { setShowForm(false); void Promise.all([loadVouchers(1), loadAnalytics()]); }} onClose={() => setShowForm(false)} /></div></div>}
      {selectedVoucher && <CenteredDetailModal eyebrow={t('ui.vouchers.voucherDetails')} title={selectedVoucher.name} subtitle={selectedVoucher.outlets?.name || t('ui.vouchers.allOutlets')} closeLabel={t('ui.vouchers.closeDetails')} onClose={() => setSelectedVoucher(null)} size="xl">
        <div className="mt-6">
          <VoucherTicket offer={{ brandName: selectedVoucher.outlets?.name || t('ui.vouchers.allOutlets'), name: selectedVoucher.name, code: selectedVoucher.code, codeLabel: t('ui.vouchers.code'), codeCopyLabels: { copy: t('ui.vouchers.copyCode'), copied: t('ui.vouchers.copied') }, discountLabel: discountLabel(selectedVoucher), minSpendLabel: t('ui.vouchers.minimumSpend', { amount: formatMYRNumber(Number(selectedVoucher.min_spend)) }), expiryLabel: t('ui.vouchers.validRange', { from: dateLabel(selectedVoucher.valid_from, locale, t('ui.vouchers.noEndDate')), until: dateLabel(selectedVoucher.valid_until, locale, t('ui.vouchers.noEndDate')) }), availabilityLabel: `${selectedVoucher.uses_count} ${selectedVoucher.max_uses ? `/ ${selectedVoucher.max_uses}` : t('ui.vouchers.uses')}`, scopeLabel: t('ui.vouchers.outletValue', { outlet: selectedVoucher.outlets?.name || t('ui.vouchers.allOutlets') }), identityLabel: t('ui.vouchers.campaignControl'), status: <StatusBadge status={selectedVoucher.status} />, images: selectedVoucherOutletImages, fallback: null }}>
            {null}
          </VoucherTicket>
        </div>
        {selectedVoucher.status === 'pending_review' && <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-900">
          <p className="font-semibold">{t('ui.vouchers.status')}</p>
          <p className="mt-1 text-xs leading-5 text-amber-800">{selectedVoucher.vendor_review_status === 'approved' ? t('ui.vouchers.awaitingSuperAdminReview') : t('ui.vouchers.awaitingVendorApproval')}</p>
        </div>}
        <div className="mt-6 flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row">
          <Button type="button" onClick={() => void copyCode(selectedVoucher.code)} className="flex-1 rounded-xl px-4 py-2.5 font-semibold">
            {copiedCode === selectedVoucher.code ? <Check size={15} /> : <Copy size={15} />}
            {copiedCode === selectedVoucher.code ? t('ui.vouchers.copied') : t('ui.vouchers.copyCode')}
          </Button>
          <Button type="button" variant="outline" onClick={() => requestToggle(selectedVoucher)} className={selectedVoucher.is_active ? 'rounded-xl border-red-200 px-4 py-2.5 font-semibold text-red-600 hover:bg-red-50 hover:text-red-700' : 'rounded-xl px-4 py-2.5 font-semibold text-muted-foreground'}>
            {selectedVoucher.is_active ? t('ui.vouchers.deactivate') : t('ui.vouchers.activate')}
          </Button>
        </div>
      </CenteredDetailModal>}
      {uploadOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="voucher-upload-title"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">{t('ui.vouchers.bulkCreation')}</p><h2 id="voucher-upload-title" className="mt-1 text-xl font-bold text-gray-950">{t('ui.vouchers.uploadVoucherCsv')}</h2><p className="mt-2 text-sm leading-6 text-gray-600">{uploadCopy.description}</p></div><button type="button" onClick={closeUploadDialog} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label={t('ui.vouchers.closeCsvUpload')}><X size={18} /></button></div><div className="mt-5 space-y-4"><button type="button" onClick={openCsvBuilder} className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-left hover:bg-amber-50"><span><span className="block text-sm font-semibold text-amber-900">{t('ui.vouchers.createCsvHere')}</span><span className="mt-1 block text-xs text-amber-800/75">{t('ui.vouchers.csvBuilderDescription')}</span></span><span className="text-xs font-bold text-amber-700">{t('ui.vouchers.openBuilder')}</span></button><div className="relative flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400"><span className="h-px flex-1 bg-gray-200" />{t('ui.vouchers.orUploadExisting')}<span className="h-px flex-1 bg-gray-200" /></div><label className="block text-sm font-semibold text-gray-700">{t('ui.vouchers.csvFile')}<input type="file" accept=".csv,text/csv" onChange={(event) => { setGeneratedCsv(null); setUploadFile(event.target.files?.[0] || null); }} className="mt-2 block w-full rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" /></label>{(uploadFile || generatedCsv) && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">{t('ui.vouchers.ready')} <span className="font-semibold text-gray-900">{generatedCsv ? 'created-vouchers.csv' : uploadFile?.name}</span></p>}<label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3"><input type="checkbox" checked={autoGenerate} onChange={(event) => setAutoGenerate(event.target.checked)} className="mt-0.5" /><span><span className="block text-sm font-semibold text-gray-800">{t('ui.vouchers.generateCodes')}</span><span className="mt-1 block text-xs leading-5 text-gray-500">{t('ui.vouchers.generateCodesDescription')}</span></span></label>{autoGenerate && <label className="block text-sm font-semibold text-gray-700">{t('ui.vouchers.codePrefix')}<input value={codePrefix} onChange={(event) => setCodePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))} className="mt-2 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 font-mono uppercase outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" placeholder={DEMO_VOUCHER_PREFIX} aria-describedby="voucher-prefix-help" /><span id="voucher-prefix-help" className="mt-1 block text-xs font-normal text-gray-500">{t('ui.vouchers.codePrefixHelp')}</span></label>}<p className="text-xs leading-5 text-gray-500">{t('ui.vouchers.csvFormatHelp')}</p></div><div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" onClick={closeUploadDialog} disabled={uploadBusy} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">{t('ui.vouchers.cancel')}</button><button type="button" onClick={() => void uploadCsv()} disabled={(!uploadFile && !generatedCsv) || uploadBusy || (autoGenerate && codePrefix.trim().length < 2)} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{uploadBusy ? t('ui.vouchers.uploading') : uploadCopy.confirmLabel}</button></div></div></div>}
      {vendorId && <VoucherCsvBuilder key={`${csvBuilderOpen ? 'open' : 'closed'}:${csvDraft?.id || 'new'}`} open={csvBuilderOpen} outlets={outlets} products={products} isOutletManager={isOutletManager} assignedOutletId={isOutletManager ? user?.activeOutletIds?.[0] : undefined} drafts={csvDrafts} initialDraft={csvDraft} onLoadDraft={loadCsvDraft} onSaveDraft={saveCsvDraft} onDeleteDraft={deleteCsvDraft} onBack={returnToUpload} onUseCsv={useBuiltCsv} />}
      <ActionConfirmationDialog open={Boolean(pendingAction)} title={confirmationCopy?.title || ''} description={confirmationCopy?.description || ''} confirmLabel={confirmationCopy?.confirmLabel || t('ui.vouchers.confirm')} tone={confirmationCopy?.tone} busy={actionBusy} onCancel={() => { if (!actionBusy) setPendingAction(null); }} onConfirm={() => void confirmPendingAction()} />
      {selectedVoucher && isVendorOwner && selectedVoucher.status === 'pending_review' && selectedVoucher.vendor_review_status === 'pending' && <div className="fixed inset-x-0 bottom-4 z-[70] mx-auto flex max-w-md gap-2 rounded-2xl border border-amber-200 bg-white p-3 shadow-2xl"><button type="button" onClick={() => { void reviewVoucher(selectedVoucher, 'approve'); setSelectedVoucher(null); }} className="inline-flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white">{t('ui.vouchers.approve')}</button><button type="button" onClick={() => { void reviewVoucher(selectedVoucher, 'reject'); setSelectedVoucher(null); }} className="inline-flex flex-1 items-center justify-center rounded-xl border border-red-200 bg-white px-4 py-2.5 text-sm font-semibold text-red-600">{t('ui.vouchers.reject')}</button></div>}
    </div>
  );
}
