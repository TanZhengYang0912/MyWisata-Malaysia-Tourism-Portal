'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, CirclePlus, Copy, Eye, Percent, Search, ToggleLeft, ToggleRight, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import VoucherForm from '@/components/vendor/voucher-form';
import { StatusBadge } from '@/components/ui/badge';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';

interface VoucherData { id: string; code: string; name: string; voucher_type: string; discount_value: number; min_spend: number; max_uses: number | null; uses_count: number; valid_from: string | null; valid_until: string | null; is_active: boolean; status: string; outlets?: { name?: string } | null }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
const statuses = ['all', 'active', 'scheduled', 'inactive', 'expired'];

function discountLabel(voucher: VoucherData) { return voucher.voucher_type === 'percent' ? `${voucher.discount_value}% off` : `RM ${Number(voucher.discount_value).toFixed(2)} off`; }
function dateLabel(value: string | null) { return value ? new Date(value).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }) : 'No end date'; }

export default function VendorVouchersPage() {
  const { user } = useAuth();
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

  async function toggleActive(voucher: VoucherData) {
    if (!vendorId) return;
    const response = await fetch(`/api/vendors/${vendorId}/vouchers/${voucher.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ isActive: !voucher.is_active }) });
    if (!response.ok) { const payload = await response.json(); setError(payload.error?.message || 'Could not update voucher'); return; }
    setSelectedVoucher(null); loadVouchers(pagination.page);
  }

  async function copyCode(code: string) { await navigator.clipboard?.writeText(code); }
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
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700"><Percent size={15} /> Campaign control</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Vouchers</h1><p className="mt-1 text-sm text-gray-500">Keep discounts visible, current and easy to switch off.</p></div><button type="button" onClick={() => setShowForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-amber-700"><CirclePlus size={17} /> Create voucher</button></header>

      <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Active</p><p className="mt-1 text-2xl font-bold text-emerald-700">{stats.active || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Scheduled</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.scheduled || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Expired</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.expired || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Inactive</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.inactive || 0}</p></div></div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex gap-1 overflow-x-auto rounded-xl bg-gray-100 p-1">{statuses.map((item) => <button key={item} type="button" onClick={() => { setStatus(item); setPagination((current) => ({ ...current, page: 1 })); }} className={`whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold capitalize ${status === item ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{item}</button>)}</div><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={q} onChange={(event) => setQ(event.target.value)} placeholder="Search voucher code or campaign" className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-amber-500 md:w-64" /></label></div>
      <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(vouchers.map((voucher) => voucher.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'activate', label: 'Activate selected' }, { value: 'deactivate', label: 'Deactivate selected' }]} busy={batchBusy} message={batchMessage} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : vouchers.length === 0 ? <div className="px-6 py-16 text-center text-sm text-gray-400"><Percent className="mx-auto mb-3 opacity-30" size={34} /><p>No vouchers match this view.</p></div> : <><div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={vouchers.length > 0 && vouchers.every((voucher) => selectedIds.includes(voucher.id))} onChange={(event) => setSelectedIds(event.target.checked ? vouchers.map((voucher) => voucher.id) : [])} /> Select current page</label></div><div className="hidden grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>Code</span><span>Campaign</span><span>Discount</span><span>Usage</span><span>Status</span><span className="text-right">Action</span></div><div className="divide-y divide-gray-100">{vouchers.map((voucher) => <article key={voucher.id} className="grid gap-3 px-4 py-4 transition hover:bg-amber-50/30 md:grid-cols-[32px_140px_minmax(210px,2fr)_150px_130px_110px_92px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(voucher.id)} onChange={() => toggleSelected(voucher.id)} aria-label={'Select ' + voucher.code} /></div><div className="flex items-center gap-2"><span className="rounded-lg bg-amber-50 px-2 py-1 font-mono text-xs font-bold text-amber-700">{voucher.code}</span><button type="button" title="Copy code" onClick={() => copyCode(voucher.code)} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-amber-700"><Copy size={13} /></button></div><div className="min-w-0"><button type="button" onClick={() => setSelectedVoucher(voucher)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-amber-700">{voucher.name}</button><p className="mt-1 truncate text-xs text-gray-500">{voucher.outlets?.name || 'All outlets'}</p></div><div className="text-sm font-semibold text-gray-900">{discountLabel(voucher)}<span className="block mt-1 text-[11px] font-normal text-gray-400">Min RM {Number(voucher.min_spend).toFixed(2)}</span></div><div className="text-xs text-gray-600">{voucher.uses_count} {voucher.max_uses ? `/ ${voucher.max_uses}` : 'uses'}<span className="block mt-1 text-gray-400">Ends {dateLabel(voucher.valid_until)}</span></div><div><StatusBadge status={voucher.status} /></div><div className="flex justify-end gap-1"><button type="button" title="View voucher" onClick={() => setSelectedVoucher(voucher)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-amber-700"><Eye size={16} /></button><button type="button" title={voucher.is_active ? 'Deactivate' : 'Activate'} onClick={() => toggleActive(voucher)} className={`rounded-lg p-2 ${voucher.is_active ? 'text-red-500 hover:bg-red-50' : 'text-emerald-700 hover:bg-emerald-50'}`}>{voucher.is_active ? <ToggleRight size={17} /> : <ToggleLeft size={17} />}</button></div></article>)}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadVouchers(page); }} /></>}</section>

      {showForm && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><VoucherForm vendorId={vendorId} onSuccess={() => { setShowForm(false); loadVouchers(1); }} onClose={() => setShowForm(false)} /></div></div>}
      {selectedVoucher && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedVoucher(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Voucher details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedVoucher.name}</h2></div><button type="button" onClick={() => setSelectedVoucher(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-amber-50 p-4"><p className="text-xs text-amber-700">Code</p><p className="mt-1 font-mono text-2xl font-bold tracking-wider text-gray-950">{selectedVoucher.code}</p><p className="mt-1 text-gray-600">{discountLabel(selectedVoucher)}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Usage</p><p className="mt-1 font-semibold text-gray-900">{selectedVoucher.uses_count} {selectedVoucher.max_uses ? `/ ${selectedVoucher.max_uses}` : 'uses'}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedVoucher.status} /></div></div></div><p className="text-gray-600">Minimum spend: RM {Number(selectedVoucher.min_spend).toFixed(2)}</p><p className="text-gray-600">Valid: {dateLabel(selectedVoucher.valid_from)} – {dateLabel(selectedVoucher.valid_until)}</p><p className="text-gray-600">Outlet: {selectedVoucher.outlets?.name || 'All outlets'}</p></div><div className="mt-7 flex gap-2"><button type="button" onClick={() => copyCode(selectedVoucher.code)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white"><Copy size={15} /> Copy code</button><button type="button" onClick={() => toggleActive(selectedVoucher)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">{selectedVoucher.is_active ? 'Deactivate' : 'Activate'}</button></div></aside></div>}
    </div>
  );
}
