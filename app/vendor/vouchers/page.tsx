'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, CirclePlus, Copy, Eye, Percent, Search, ToggleLeft, ToggleRight, Upload, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import VoucherForm from '@/components/vendor/voucher-form';
import { StatusBadge } from '@/components/ui/badge';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { useActionFeedback } from '@/components/providers/action-feedback';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';
import VoucherCsvBuilder, { type VoucherCsvDraftRecord } from '@/components/vendor/voucher-csv-builder';
import { voucherConfirmationCopy, voucherDiscountLabel } from '@/lib/vendor/voucher-ui';
import { buildVoucherCsv } from '@/lib/vendor/voucher-csv-builder';
import { parseVoucherCsv } from '@/lib/vendor/voucher-csv';
import type { VoucherCsvDraftDocument } from '@/lib/vendor/voucher-csv-draft';

interface VoucherData { id: string; code: string; name: string; voucher_type: string; discount_value: number; min_spend: number; max_uses: number | null; uses_count: number; valid_from: string | null; valid_until: string | null; is_active: boolean; status: string; buy_quantity?: number | null; free_quantity?: number | null; product_id?: string | null; outlets?: { id?: string; name?: string; city?: string; state?: string } | null }
interface VoucherAnalytics { voucherId: string; code: string; name: string; outletName: string; views: number; entries: number; applies: number; redemptions: number; uniqueCustomers: number; redemptionRate: number | null; discount: number; revenue: number; revenueImpact: number }
interface OutletOption { id: string; name: string }
interface ProductOption { id: string; name: string }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
const statuses = ['all', 'active', 'scheduled', 'inactive', 'expired'];

function discountLabel(voucher: VoucherData) { return voucherDiscountLabel({ voucherType: voucher.voucher_type, discountValue: voucher.discount_value, buyQuantity: voucher.buy_quantity, freeQuantity: voucher.free_quantity }); }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No end date'; }

type PendingAction =
  | { kind: 'toggle'; voucher: VoucherData; nextActive: boolean }
  | { kind: 'batch'; action: 'activate' | 'deactivate'; count: number }
  | null;

export default function VendorVouchersPage() {
  const { user } = useAuth();
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
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load vouchers');
      setVouchers(payload.data?.items || []); setPagination(payload.data?.pagination || { page, pageSize: 10, total: 0, totalPages: 1 }); setStats(payload.data?.stats || {});
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not load vouchers'); }
    finally { setLoading(false); }
  }, [q, status, vendorId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadVouchers(1); }, [loadVouchers]);
  useEffect(() => {
    if (!vendorId) return;
    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=100&sort=name`, { cache: 'no-store' }),
      fetch(`/api/vendors/${vendorId}/products?page=1&pageSize=24&sort=name`, { cache: 'no-store' }),
    ])
      .then(async ([outletResponse, productResponse]) => {
        const [outletPayload, productPayload] = await Promise.all([outletResponse.json(), productResponse.json()]);
        if (!outletResponse.ok) throw new Error(outletPayload.error?.message || 'Could not load outlets');
        if (!productResponse.ok) throw new Error(productPayload.error?.message || 'Could not load products');
        setOutlets((outletPayload.data?.items || []).map((outlet: OutletOption) => ({ id: outlet.id, name: outlet.name })));
        setProducts((productPayload.data?.items || []).map((product: ProductOption) => ({ id: product.id, name: product.name })));
      })
      .catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Could not load voucher options'));
  }, [vendorId]);
  const loadAnalytics = useCallback(async () => {
    if (!vendorId) return;
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
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load voucher analytics');
      setAnalytics(payload.data || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load voucher analytics');
    }
  }, [analyticsFrom, analyticsOutlet, analyticsRange, analyticsTo, vendorId]);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  async function toggleActive(voucher: VoucherData) {
    if (!vendorId) return false;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/${voucher.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !voucher.is_active }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || 'Could not update voucher'; setError(message); showFeedback('error', message); return false; }
      showFeedback('success', voucher.is_active ? 'Voucher deactivated.' : 'Voucher activated.');
      setSelectedVoucher(null);
      await Promise.all([loadVouchers(pagination.page), loadAnalytics()]);
      return true;
    } catch { setError('Could not update voucher.'); showFeedback('error', 'Could not update voucher. Please try again.'); return false; }
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
      showFeedback('success', `${code} copied to clipboard.`);
    } catch {
      setError('Could not copy the voucher code. Please select and copy it manually.');
      showFeedback('error', 'Could not copy the voucher code.');
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
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load saved CSV drafts');
      setCsvDrafts(payload.data || []);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load saved CSV drafts');
    }
  }

  async function loadCsvDraft(id: string) {
    if (!vendorId) return null;
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/drafts?id=${encodeURIComponent(id)}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || 'Could not load saved CSV draft');
    const loaded = payload.data as VoucherCsvDraftRecord;
    setCsvDraft(loaded);
    return loaded;
  }

  async function saveCsvDraft(input: { id?: string; document: VoucherCsvDraftDocument; expectedDraftVersion?: number }) {
    if (!vendorId) return null;
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/drafts`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || 'Could not save CSV draft');
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
      showFeedback('error', payload.error?.message || 'Could not discard CSV draft');
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
        setBulkMessage('Add a 2–20 character prefix because this file contains blank code cells.');
        return false;
      }
      const codePrefix = autoGenerate && prefix.length >= 2 ? prefix : undefined;
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv, codePrefix }) });
      const payload = await response.json();
      if (!response.ok) {
        const failed = payload.error?.details?.failed as { row: number; errors: string[] }[] | undefined;
        const message = `${payload.error?.message || 'CSV upload failed'}${failed?.length ? ` Failed rows: ${failed.map((item) => `#${item.row} ${item.errors.join(', ')}`).join(' · ')}` : ''}`;
        setBulkMessage(message);
        showFeedback('error', payload.error?.message || 'CSV upload failed');
        return false;
      }
      const failed = payload.data?.failed as { row: number; errors: string[] }[] | undefined;
      const generated = payload.data?.generated ? ` ${payload.data.generated} codes generated with prefix ${codePrefix}.` : '';
      setBulkMessage(`${payload.data?.inserted || 0} vouchers uploaded for admin review.${generated}${failed?.length ? ` Failed rows: ${failed.map((item) => `#${item.row} ${item.errors.join(', ')}`).join(' · ')}` : ''}`);
      showFeedback('success', `${payload.data?.inserted || 0} vouchers uploaded.`);
      setUploadOpen(false);
      setUploadFile(null);
      setGeneratedCsv(null);
      if (importDraftId) {
        const draftCleared = await deleteCsvDraft(importDraftId);
        if (!draftCleared) showFeedback('error', 'Voucher upload succeeded, but the saved draft could not be cleared.');
        setImportDraftId(undefined);
      }
      await Promise.all([loadVouchers(1), loadAnalytics()]);
      return true;
    } catch {
      setBulkMessage('CSV upload failed. Please check the file and try again.');
      showFeedback('error', 'CSV upload failed. Please try again.');
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
      if (!response.ok) { const message = payload.error?.message || 'Batch action failed'; setError(message); showFeedback('error', message); return false; }
      setBatchMessage(payload.data?.skipped ? payload.data.updated + ' updated, ' + payload.data.skipped + ' skipped.' : payload.data?.updated + ' vouchers updated.');
      setSelectedIds([]); setAllFilteredSelected(false);
      await Promise.all([loadVouchers(1), loadAnalytics()]);
      showFeedback('success', `${payload.data?.updated || 0} vouchers ${action === 'activate' ? 'activated' : 'deactivated'}.`);
      return true;
    } catch {
      setError('Batch action failed. Please try again.');
      showFeedback('error', 'Batch action failed. Please try again.');
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

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700"><Percent size={15} /> Campaign control</div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">Vouchers</h1>
          <p className="mt-1 text-sm text-gray-500">Keep discounts visible, current and easy to switch off.</p>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <button type="button" onClick={openUploadDialog} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 text-sm font-semibold text-amber-700 hover:bg-amber-50"><Upload size={16} /> Upload CSV</button>
          <button type="button" onClick={() => setShowForm(true)} className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"><CirclePlus size={17} /> Create voucher</button>
        </div>
      </header>
      {bulkMessage && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{bulkMessage} <span className="ml-1 text-xs">CSV columns: code (optional with prefix), name, voucherType, discountValue, minSpend, maxUses, perCustomerLimit, validFrom, validUntil, outletId, productId.</span></div>}

      <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Active</p><p className="mt-1 text-2xl font-bold text-primary">{stats.active || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Scheduled</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.scheduled || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Expired</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.expired || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Inactive</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.inactive || 0}</p></div></div>

      <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-semibold text-gray-900">Voucher performance</p><p className="mt-1 text-xs text-gray-600">Track the customer funnel, sales generated and discount impact from Supabase order data.</p></div>
          <div className="flex flex-wrap gap-2"><select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value as typeof analyticsRange)} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-gray-700"><option value="all">All time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="12m">Last 12 months</option><option value="custom">Custom dates</option></select><select value={analyticsOutlet} onChange={(event) => setAnalyticsOutlet(event.target.value)} className="h-9 max-w-48 rounded-lg border border-amber-200 bg-white px-2 text-xs text-gray-700"><option value="">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select>{analyticsRange === 'custom' && <><input type="date" value={analyticsFrom} onChange={(event) => setAnalyticsFrom(event.target.value)} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-xs" /><input type="date" value={analyticsTo} min={analyticsFrom || undefined} onChange={(event) => setAnalyticsTo(event.target.value)} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-xs" /></>}</div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
          {[['Views', analyticsTotals.views], ['Entries', analyticsTotals.entries], ['Applies', analyticsTotals.applies], ['Redemptions', analyticsTotals.redemptions], ['Customer reach', analyticsTotals.uniqueCustomers]].map(([label, value]) => <div key={label} className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">{label}</p><p className="mt-1 font-bold text-gray-900">{value}</p></div>)}
          <div className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">Sales generated</p><p className="mt-1 font-bold text-gray-900">RM {analyticsTotals.revenue.toFixed(2)}</p></div>
          <div className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">Discount cost</p><p className="mt-1 font-bold text-gray-900">RM {analyticsTotals.discount.toFixed(2)}</p></div>
          <div className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">Net revenue impact</p><p className="mt-1 font-bold text-primary">RM {analyticsTotals.revenueImpact.toFixed(2)}</p></div>
        </div>
        <div className="mt-3 grid gap-2 md:grid-cols-2">{analytics.slice(0, 6).map((item, index) => <div key={item.voucherId} className="rounded-xl border border-amber-100 bg-white px-3 py-3 text-xs"><div className="flex justify-between gap-3"><span className="font-mono font-bold text-amber-700">{index === 0 ? 'Best performing voucher · ' : ''}{item.code}</span><span className="font-semibold text-gray-800">{item.redemptions} uses</span></div><p className="mt-1 text-gray-500">{item.name} · {item.outletName} · {item.redemptionRate === null ? 'Unlimited usage' : `${item.redemptionRate}% of usage cap`} · RM {item.revenue.toFixed(2)} sales · RM {item.discount.toFixed(2)} discount · RM {item.revenueImpact.toFixed(2)} net impact</p></div>)}{analytics.length === 0 && <p className="text-sm text-gray-500">No vouchers match this date and outlet filter.</p>}</div>
      </section>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">{statuses.map((item) => <button key={item} type="button" onClick={() => { setStatus(item); setPagination((current) => ({ ...current, page: 1 })); }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold capitalize ${status === item ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{item}</button>)}</div><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search voucher code or campaign" className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-amber-500 md:w-64" /></label></div>
      <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(vouchers.map((voucher) => voucher.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={requestBatchAction} actions={[{ value: 'activate', label: 'Activate selected' }, { value: 'deactivate', label: 'Deactivate selected' }]} busy={batchBusy || actionBusy} message={batchMessage} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : vouchers.length === 0 ? <div className="px-6 py-16 text-center text-sm text-gray-400"><Percent className="mx-auto mb-3 opacity-30" size={34} /><p>No vouchers match this view.</p></div> : <><div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={vouchers.length > 0 && vouchers.every((voucher) => selectedIds.includes(voucher.id))} onChange={(event) => { setAllFilteredSelected(false); setSelectedIds(event.target.checked ? vouchers.map((voucher) => voucher.id) : []); }} /> Select current page</label></div><div className="hidden grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>Code</span><span>Campaign</span><span>Discount</span><span>Usage</span><span>Status</span><span className="text-right">Action</span></div><div className="divide-y divide-gray-100">{vouchers.map((voucher) => <article key={voucher.id} className="grid gap-3 px-4 py-4 transition hover:bg-amber-50/30 md:grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(voucher.id)} onChange={() => toggleSelected(voucher.id)} aria-label={'Select ' + voucher.code} /></div><div className="flex items-center gap-2"><span className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-xs font-bold text-amber-700">{voucher.code}</span><button type="button" title={copiedCode === voucher.code ? 'Copied' : 'Copy code'} aria-label={copiedCode === voucher.code ? `${voucher.code} copied` : `Copy ${voucher.code}`} onClick={() => void copyCode(voucher.code)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-700">{copiedCode === voucher.code ? <Check size={13} /> : <Copy size={13} />}</button></div><div className="min-w-0"><button type="button" onClick={() => setSelectedVoucher(voucher)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-amber-700">{voucher.name}</button><p className="mt-1 truncate text-xs text-gray-500">{voucher.outlets?.name || 'All outlets'}</p></div><div className="text-sm font-semibold text-gray-900">{discountLabel(voucher)}<span className="block mt-1 text-[11px] font-normal text-gray-400">Min RM {Number(voucher.min_spend).toFixed(2)}</span></div><div className="text-xs text-gray-600">{voucher.uses_count} {voucher.max_uses ? `/ ${voucher.max_uses}` : 'uses'}<span className="block mt-1 text-gray-400">Ends {dateLabel(voucher.valid_until)}</span></div><div><StatusBadge status={voucher.status} /></div><div className="flex justify-end gap-1"><button type="button" title="View voucher" onClick={() => setSelectedVoucher(voucher)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-amber-700"><Eye size={16} /></button><button type="button" title={voucher.is_active ? 'Deactivate' : 'Activate'} aria-label={`${voucher.is_active ? 'Deactivate' : 'Activate'} ${voucher.code}`} onClick={() => requestToggle(voucher)} className={`rounded-lg p-2 ${voucher.is_active ? 'text-red-500 hover:bg-red-50' : 'text-primary hover:bg-secondary'}`}>{voucher.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></article>)}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadVouchers(page); }} /></>}</section>

      {showForm && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><VoucherForm vendorId={vendorId} onSuccess={() => { setShowForm(false); void Promise.all([loadVouchers(1), loadAnalytics()]); }} onClose={() => setShowForm(false)} /></div></div>}
      {selectedVoucher && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedVoucher(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Voucher details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedVoucher.name}</h2></div><button type="button" onClick={() => setSelectedVoucher(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close voucher details"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Code</p><p className="mt-1 font-mono text-2xl font-bold tracking-wider text-gray-950">{selectedVoucher.code}</p><p className="mt-1 text-gray-600">{discountLabel(selectedVoucher)}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Usage</p><p className="mt-1 font-semibold text-gray-900">{selectedVoucher.uses_count} {selectedVoucher.max_uses ? `/ ${selectedVoucher.max_uses}` : 'uses'}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedVoucher.status} /></div></div></div><p className="text-gray-600">Minimum spend: RM {Number(selectedVoucher.min_spend).toFixed(2)}</p><p className="text-gray-600">Valid: {dateLabel(selectedVoucher.valid_from)} – {dateLabel(selectedVoucher.valid_until)}</p><p className="text-gray-600">Outlet: {selectedVoucher.outlets?.name || 'All outlets'}</p></div><div className="mt-7 flex gap-2"><button type="button" onClick={() => void copyCode(selectedVoucher.code)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white">{copiedCode === selectedVoucher.code ? <Check size={15} /> : <Copy size={15} />} {copiedCode === selectedVoucher.code ? 'Copied' : 'Copy code'}</button><button type="button" onClick={() => requestToggle(selectedVoucher)} className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${selectedVoucher.is_active ? 'border-red-200 text-red-600 hover:bg-red-50' : 'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>{selectedVoucher.is_active ? 'Deactivate' : 'Activate'}</button></div></aside></div>}
      {uploadOpen && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-950/45 p-4" role="dialog" aria-modal="true" aria-labelledby="voucher-upload-title"><div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Bulk creation</p><h2 id="voucher-upload-title" className="mt-1 text-xl font-bold text-gray-950">Upload voucher CSV</h2><p className="mt-2 text-sm leading-6 text-gray-600">{uploadCopy.description}</p></div><button type="button" onClick={closeUploadDialog} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100" aria-label="Close CSV upload"><X size={18} /></button></div><div className="mt-5 space-y-4"><button type="button" onClick={openCsvBuilder} className="flex w-full items-center justify-between rounded-xl border border-amber-200 bg-amber-50/60 px-4 py-3 text-left hover:bg-amber-50"><span><span className="block text-sm font-semibold text-amber-900">Create CSV here</span><span className="mt-1 block text-xs text-amber-800/75">Fill voucher fields with dropdowns. No column names or UUIDs needed.</span></span><span className="text-xs font-bold text-amber-700">Open builder →</span></button><div className="relative flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gray-400"><span className="h-px flex-1 bg-gray-200" />Or upload an existing file<span className="h-px flex-1 bg-gray-200" /></div><label className="block text-sm font-semibold text-gray-700">CSV file<input type="file" accept=".csv,text/csv" onChange={(event) => { setGeneratedCsv(null); setUploadFile(event.target.files?.[0] || null); }} className="mt-2 block w-full rounded-xl border border-dashed border-amber-300 bg-amber-50/50 px-3 py-3 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-amber-600 file:px-3 file:py-2 file:text-xs file:font-semibold file:text-white" /></label>{(uploadFile || generatedCsv) && <p className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">Ready: <span className="font-semibold text-gray-900">{generatedCsv ? 'created-vouchers.csv' : uploadFile?.name}</span></p>}<label className="flex items-start gap-3 rounded-xl border border-gray-200 p-3"><input type="checkbox" checked={autoGenerate} onChange={(event) => setAutoGenerate(event.target.checked)} className="mt-0.5" /><span><span className="block text-sm font-semibold text-gray-800">Generate missing codes automatically</span><span className="mt-1 block text-xs leading-5 text-gray-500">Existing code cells are preserved. Blank code cells will become PREFIX001, PREFIX002, and so on.</span></span></label>{autoGenerate && <label className="block text-sm font-semibold text-gray-700">Prefix for blank codes<input value={codePrefix} onChange={(event) => setCodePrefix(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20))} className="mt-2 h-10 w-full rounded-xl border border-amber-200 bg-white px-3 font-mono uppercase outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-100" placeholder="TRAVEL" aria-describedby="voucher-prefix-help" /><span id="voucher-prefix-help" className="mt-1 block text-xs font-normal text-gray-500">Example: TRAVEL001, TRAVEL002. Use 2–20 letters or numbers.</span></label>}<p className="text-xs leading-5 text-gray-500">If you create the CSV here, fields are already formatted for upload. Existing files still need the required columns shown in the template.</p></div><div className="mt-6 flex justify-end gap-2 border-t border-gray-100 pt-4"><button type="button" onClick={closeUploadDialog} disabled={uploadBusy} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600 hover:bg-gray-50">Cancel</button><button type="button" onClick={() => void uploadCsv()} disabled={(!uploadFile && !generatedCsv) || uploadBusy || (autoGenerate && codePrefix.trim().length < 2)} className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50">{uploadBusy ? 'Uploading…' : uploadCopy.confirmLabel}</button></div></div></div>}
      {vendorId && <VoucherCsvBuilder key={`${csvBuilderOpen ? 'open' : 'closed'}:${csvDraft?.id || 'new'}`} open={csvBuilderOpen} outlets={outlets} products={products} drafts={csvDrafts} initialDraft={csvDraft} onLoadDraft={loadCsvDraft} onSaveDraft={saveCsvDraft} onDeleteDraft={deleteCsvDraft} onBack={returnToUpload} onUseCsv={useBuiltCsv} />}
      <ActionConfirmationDialog open={Boolean(pendingAction)} title={confirmationCopy?.title || ''} description={confirmationCopy?.description || ''} confirmLabel={confirmationCopy?.confirmLabel || 'Confirm'} tone={confirmationCopy?.tone} busy={actionBusy} onCancel={() => { if (!actionBusy) setPendingAction(null); }} onConfirm={() => void confirmPendingAction()} />
    </div>
  );
}
