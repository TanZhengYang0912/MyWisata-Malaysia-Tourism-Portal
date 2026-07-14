'use client';

import { useCallback, useEffect, useState } from 'react';
import { CirclePlus, Copy, Eye, Percent, Search, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import VoucherForm from '@/components/vendor/voucher-form';
import { StatusBadge } from '@/components/ui/badge';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { useActionFeedback } from '@/components/providers/action-feedback';

interface VoucherData { id: string; code: string; name: string; voucher_type: string; discount_value: number; min_spend: number; max_uses: number | null; uses_count: number; valid_from: string | null; valid_until: string | null; is_active: boolean; status: string; outlets?: { id?: string; name?: string; city?: string; state?: string } | null }
interface VoucherAnalytics { voucherId: string; code: string; name: string; outletName: string; redemptions: number; redemptionRate: number | null; discount: number; revenue: number; revenueImpact: number }
interface OutletOption { id: string; name: string }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
const statuses = ['all', 'active', 'scheduled', 'inactive', 'expired'];

function discountLabel(voucher: VoucherData) { return voucher.voucher_type === 'percent' ? `${voucher.discount_value}% off` : `RM ${Number(voucher.discount_value).toFixed(2)} off`; }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No end date'; }

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
  const [analyticsRange, setAnalyticsRange] = useState<'all' | '7d' | '30d' | '12m' | 'custom'>('30d');
  const [analyticsFrom, setAnalyticsFrom] = useState('');
  const [analyticsTo, setAnalyticsTo] = useState('');
  const [analyticsOutlet, setAnalyticsOutlet] = useState('');
  const [bulkMessage, setBulkMessage] = useState('');

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

  useEffect(() => { loadVouchers(1); }, [loadVouchers]);
  useEffect(() => {
    if (!vendorId) return;
    fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=100&sort=name`, { cache: 'no-store' }).then((response) => response.json()).then((payload) => setOutlets((payload.data?.items || []).map((outlet: OutletOption) => ({ id: outlet.id, name: outlet.name }))));
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
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/analytics?${params.toString()}`, { cache: 'no-store' });
    const payload = await response.json();
    if (response.ok) setAnalytics(payload.data || []);
  }, [analyticsFrom, analyticsOutlet, analyticsRange, analyticsTo, vendorId]);
  useEffect(() => { void loadAnalytics(); }, [loadAnalytics]);

  async function toggleActive(voucher: VoucherData) {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/vouchers/${voucher.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !voucher.is_active }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || 'Could not update voucher'; setError(message); showFeedback('error', message); return; }
      showFeedback('success', voucher.is_active ? 'Voucher deactivated.' : 'Voucher activated.');
      setSelectedVoucher(null); loadVouchers(pagination.page);
    } catch { setError('Could not update voucher.'); showFeedback('error', 'Could not update voucher. Please try again.'); }
  }

  async function copyCode(code: string) { await navigator.clipboard?.writeText(code); }
  async function uploadCsv(file: File) {
    if (!vendorId) return;
    const csv = await file.text();
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/bulk`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ csv }) });
    const payload = await response.json();
    if (!response.ok) { setBulkMessage(payload.error?.message || 'CSV upload failed'); return; }
    setBulkMessage(`${payload.data?.inserted || 0} vouchers uploaded for admin review.`); loadVouchers(1);
  }
  function toggleSelected(voucherId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(voucherId) ? current.filter((id) => id !== voucherId) : [...current, voucherId]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'vouchers', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters: { q, status } }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || 'Batch action failed'); return; }
    setBatchMessage(payload.data?.skipped ? payload.data.updated + ' updated, ' + payload.data.skipped + ' skipped.' : payload.data?.updated + ' vouchers updated.');
    setSelectedIds([]); setAllFilteredSelected(false); loadVouchers(1);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700"><Percent size={15} /> Campaign control</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Vouchers</h1><p className="mt-1 text-sm text-gray-500">Keep discounts visible, current and easy to switch off.</p></div><div className="flex gap-2"><label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-amber-200 bg-white px-4 py-2.5 text-sm font-semibold text-amber-700 hover:bg-amber-50"><input type="file" accept=".csv,text/csv" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadCsv(file); event.currentTarget.value = ''; }} /> Upload CSV</label><button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"><CirclePlus size={17} /> Create voucher</button></div></header>
      {bulkMessage && <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{bulkMessage} <span className="ml-1 text-xs">CSV columns: code, name, voucherType, discountValue, minSpend, maxUses, validFrom, validUntil.</span></div>}

      <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Active</p><p className="mt-1 text-2xl font-bold text-primary">{stats.active || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Scheduled</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.scheduled || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Expired</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.expired || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Inactive</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.inactive || 0}</p></div></div>

      <section className="rounded-2xl border border-amber-100 bg-amber-50/50 p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between"><div><p className="text-sm font-semibold text-gray-900">Voucher performance</p><p className="mt-1 text-xs text-gray-600">Redemption rate, discount cost and net revenue impact from Supabase order data.</p></div><div className="flex flex-wrap gap-2"><select value={analyticsRange} onChange={(event) => setAnalyticsRange(event.target.value as typeof analyticsRange)} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-xs font-semibold text-gray-700"><option value="all">All time</option><option value="7d">Last 7 days</option><option value="30d">Last 30 days</option><option value="12m">Last 12 months</option><option value="custom">Custom dates</option></select><select value={analyticsOutlet} onChange={(event) => setAnalyticsOutlet(event.target.value)} className="h-9 max-w-48 rounded-lg border border-amber-200 bg-white px-2 text-xs text-gray-700"><option value="">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outlet.name}</option>)}</select>{analyticsRange === 'custom' && <><input type="date" value={analyticsFrom} onChange={(event) => setAnalyticsFrom(event.target.value)} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-xs" /><input type="date" value={analyticsTo} min={analyticsFrom || undefined} onChange={(event) => setAnalyticsTo(event.target.value)} className="h-9 rounded-lg border border-amber-200 bg-white px-2 text-xs" /></>}</div></div><div className="mt-4 grid gap-2 sm:grid-cols-3"><div className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">Redemptions</p><p className="mt-1 font-bold text-gray-900">{analytics.reduce((sum, item) => sum + item.redemptions, 0)}</p></div><div className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">Discount cost</p><p className="mt-1 font-bold text-gray-900">RM {analytics.reduce((sum, item) => sum + item.discount, 0).toFixed(2)}</p></div><div className="rounded-xl bg-white px-3 py-2"><p className="text-[11px] text-gray-500">Net revenue impact</p><p className="mt-1 font-bold text-primary">RM {analytics.reduce((sum, item) => sum + item.revenueImpact, 0).toFixed(2)}</p></div></div><div className="mt-3 grid gap-2 md:grid-cols-2">{analytics.slice(0, 6).map((item) => <div key={item.voucherId} className="rounded-xl border border-amber-100 bg-white px-3 py-3 text-xs"><div className="flex justify-between gap-3"><span className="font-mono font-bold text-amber-700">{item.code}</span><span className="font-semibold text-gray-800">{item.redemptions} uses</span></div><p className="mt-1 text-gray-500">{item.outletName} · {item.redemptionRate === null ? 'Unlimited usage' : `${item.redemptionRate}% of usage cap`} · RM {item.discount.toFixed(2)} discount · RM {item.revenueImpact.toFixed(2)} net impact</p></div>)}{analytics.length === 0 && <p className="text-sm text-gray-500">No vouchers match this date and outlet filter.</p>}</div></section>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">{statuses.map((item) => <button key={item} type="button" onClick={() => { setStatus(item); setPagination((current) => ({ ...current, page: 1 })); }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold capitalize ${status === item ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{item}</button>)}</div><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search voucher code or campaign" className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-amber-500 md:w-64" /></label></div>
      <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(vouchers.map((voucher) => voucher.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'activate', label: 'Activate selected' }, { value: 'deactivate', label: 'Deactivate selected' }]} busy={batchBusy} message={batchMessage} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : vouchers.length === 0 ? <div className="px-6 py-16 text-center text-sm text-gray-400"><Percent className="mx-auto mb-3 opacity-30" size={34} /><p>No vouchers match this view.</p></div> : <><div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={vouchers.length > 0 && vouchers.every((voucher) => selectedIds.includes(voucher.id))} onChange={(event) => setSelectedIds(event.target.checked ? vouchers.map((voucher) => voucher.id) : [])} /> Select current page</label></div><div className="hidden grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>Code</span><span>Campaign</span><span>Discount</span><span>Usage</span><span>Status</span><span className="text-right">Action</span></div><div className="divide-y divide-gray-100">{vouchers.map((voucher) => <article key={voucher.id} className="grid gap-3 px-4 py-4 transition hover:bg-amber-50/30 md:grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(voucher.id)} onChange={() => toggleSelected(voucher.id)} aria-label={'Select ' + voucher.code} /></div><div className="flex items-center gap-2"><span className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-xs font-bold text-amber-700">{voucher.code}</span><button type="button" title="Copy code" onClick={() => copyCode(voucher.code)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-700"><Copy size={13} /></button></div><div className="min-w-0"><button type="button" onClick={() => setSelectedVoucher(voucher)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-amber-700">{voucher.name}</button><p className="mt-1 truncate text-xs text-gray-500">{voucher.outlets?.name || 'All outlets'}</p></div><div className="text-sm font-semibold text-gray-900">{discountLabel(voucher)}<span className="block mt-1 text-[11px] font-normal text-gray-400">Min RM {Number(voucher.min_spend).toFixed(2)}</span></div><div className="text-xs text-gray-600">{voucher.uses_count} {voucher.max_uses ? `/ ${voucher.max_uses}` : 'uses'}<span className="block mt-1 text-gray-400">Ends {dateLabel(voucher.valid_until)}</span></div><div><StatusBadge status={voucher.status} /></div><div className="flex justify-end gap-1"><button type="button" title="View voucher" onClick={() => setSelectedVoucher(voucher)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-amber-700"><Eye size={16} /></button><button type="button" title={voucher.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(voucher)} className={`rounded-lg p-2 ${voucher.is_active ? 'text-red-500 hover:bg-red-50' : 'text-primary hover:bg-secondary'}`}>{voucher.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></article>)}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadVouchers(page); }} /></>}</section>

      {showForm && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><VoucherForm vendorId={vendorId} onSuccess={() => { setShowForm(false); loadVouchers(1); }} onClose={() => setShowForm(false)} /></div></div>}
      {selectedVoucher && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedVoucher(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Voucher details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedVoucher.name}</h2></div><button type="button" onClick={() => setSelectedVoucher(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Code</p><p className="mt-1 font-mono text-2xl font-bold tracking-wider text-gray-950">{selectedVoucher.code}</p><p className="mt-1 text-gray-600">{discountLabel(selectedVoucher)}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Usage</p><p className="mt-1 font-semibold text-gray-900">{selectedVoucher.uses_count} {selectedVoucher.max_uses ? `/ ${selectedVoucher.max_uses}` : 'uses'}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedVoucher.status} /></div></div></div><p className="text-gray-600">Minimum spend: RM {Number(selectedVoucher.min_spend).toFixed(2)}</p><p className="text-gray-600">Valid: {dateLabel(selectedVoucher.valid_from)} – {dateLabel(selectedVoucher.valid_until)}</p><p className="text-gray-600">Outlet: {selectedVoucher.outlets?.name || 'All outlets'}</p></div><div className="mt-7 flex gap-2"><button type="button" onClick={() => copyCode(selectedVoucher.code)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white"><Copy size={15} /> Copy code</button><button type="button" onClick={() => toggleActive(selectedVoucher)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">{selectedVoucher.is_active ? 'Deactivate' : 'Activate'}</button></div></aside></div>}
    </div>
  );
}
