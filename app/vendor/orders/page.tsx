'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, Eye, PackageCheck, Search, ShoppingBag, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';

interface OrderItemData { id: string; order_id: string; product_name: string; variant_name: string | null; slot_starts_at: string | null; quantity: number; line_total: number; fulfil_status: string; created_at: string; outlets?: { name?: string; city?: string; state?: string }; products?: { cover_url?: string | null } | Array<{ cover_url?: string | null }>; orders?: { id?: string; status?: string; paid_at?: string | null; completed_at?: string | null; created_at?: string; users?: { full_name?: string; email?: string } | Array<{ full_name?: string; email?: string }> } }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

function customerFor(item: OrderItemData) { const customer = Array.isArray(item.orders?.users) ? item.orders?.users[0] : item.orders?.users; return customer || {}; }
function imageFor(item: OrderItemData) { const product = Array.isArray(item.products) ? item.products[0] : item.products; return product?.cover_url; }
function dateLabel(value?: string | null) { return value ? new Date(value).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function VendorOrdersPage() {
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const [items, setItems] = useState<OrderItemData[]>([]);
  const [selectedItem, setSelectedItem] = useState<OrderItemData | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ q: '', fulfilStatus: '', orderStatus: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');

  const loadOrders = useCallback(async (page = 1) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10', q: filters.q, fulfil_status: filters.fulfilStatus, order_status: filters.orderStatus, from: filters.from, to: filters.to });
      const response = await fetch(`/api/vendors/${vendorId}/orders?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Could not load orders');
      setItems(payload.data?.items || []); setPagination(payload.data?.pagination || { page, pageSize: 10, total: 0, totalPages: 1 });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not load orders'); }
    finally { setLoading(false); }
  }, [filters, vendorId]);

  useEffect(() => { loadOrders(1); }, [loadOrders]);

  async function updateFulfil(item: OrderItemData, status: 'ready' | 'fulfilled') {
    if (!vendorId) return;
    const response = await fetch(`/api/vendors/${vendorId}/orders/${item.id}/fulfil`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
    if (!response.ok) { const payload = await response.json(); setError(payload.error?.message || 'Could not update fulfilment'); return; }
    setSelectedItem(null); loadOrders(pagination.page);
  }

  function clearFilters() { setFilters({ q: '', fulfilStatus: '', orderStatus: '', from: '', to: '' }); }
  function toggleSelected(itemId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(itemId) ? current.filter((id) => id !== itemId) : [...current, itemId]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'orders', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || 'Batch action failed'); return; }
    setBatchMessage(payload.data?.skipped ? payload.data.updated + ' updated, ' + payload.data.skipped + ' skipped by status.' : payload.data?.updated + ' order items updated.');
    setSelectedIds([]); setAllFilteredSelected(false); loadOrders(1);
  }

  return (
    <div className="space-y-5">
      <header><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-blue-700"><ShoppingBag size={15} /> Fulfilment desk</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Orders</h1><p className="mt-1 text-sm text-gray-500">See what needs attention first, then open a drawer for the details.</p></header>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"><div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1"><button type="button" onClick={() => setFilters((current) => ({ ...current, fulfilStatus: '' }))} className={`rounded-lg px-3 py-2 text-xs font-semibold ${!filters.fulfilStatus ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>All items</button>{['pending', 'ready', 'fulfilled', 'cancelled'].map((status) => <button key={status} type="button" onClick={() => setFilters((current) => ({ ...current, fulfilStatus: status }))} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filters.fulfilStatus === status ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{status}</button>)}</div><div className="grid gap-2 sm:grid-cols-2 md:flex"><label className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder="Search order ID, product or customer" className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-blue-500 md:w-64" /></label><select value={filters.orderStatus} onChange={(event) => setFilters((current) => ({ ...current, orderStatus: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-blue-500"><option value="">All order states</option>{['paid', 'completed', 'pending_payment', 'cancelled', 'refunded'].map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-xs text-gray-600" /><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-xs text-gray-600" /></div>{(filters.q || filters.fulfilStatus || filters.orderStatus || filters.from || filters.to) && <button type="button" onClick={clearFilters} className="self-start text-xs font-semibold text-blue-700 hover:underline">Clear filters</button>}</div>
      <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(items.map((item) => item.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'ready', label: 'Mark ready' }, { value: 'fulfilled', label: 'Fulfil selected' }]} busy={batchBusy} message={batchMessage} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : items.length === 0 ? <div className="px-6 py-16 text-center text-sm text-gray-400"><PackageCheck className="mx-auto mb-3 opacity-30" size={34} /><p>No orders match these filters.</p></div> : <><div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={items.length > 0 && items.every((item) => selectedIds.includes(item.id))} onChange={(event) => setSelectedIds(event.target.checked ? items.map((item) => item.id) : [])} /> Select current page</label><span>{pagination.total.toLocaleString()} order items · 10 per page</span></div><div className="hidden grid-cols-[32px_minmax(220px,1.7fr)_minmax(150px,1.2fr)_minmax(140px,1fr)_110px_110px_90px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>Item</span><span>Customer</span><span>Outlet</span><span>Total</span><span>Status</span><span className="text-right">Action</span></div><div className="divide-y divide-gray-100">{items.map((item) => { const customer = customerFor(item); return <article key={item.id} className="grid gap-3 px-4 py-4 transition hover:bg-blue-50/30 md:grid-cols-[32px_minmax(220px,1.7fr)_minmax(150px,1.2fr)_minmax(140px,1fr)_110px_110px_90px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(item.id)} onChange={() => toggleSelected(item.id)} aria-label={'Select ' + item.product_name} /></div><div className="flex min-w-0 items-center gap-3"><CompactThumbnail src={imageFor(item)} alt={item.product_name} kind="product" /><div className="min-w-0"><button type="button" onClick={() => setSelectedItem(item)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-blue-700">{item.quantity}× {item.product_name}</button><p className="mt-1 truncate text-xs text-gray-500">{item.variant_name || 'Standard'} · {dateLabel(item.slot_starts_at || item.created_at)}</p></div></div><div className="pl-[4.25rem] text-xs md:pl-0"><p className="truncate font-medium text-gray-800">{customer.full_name || 'Guest'}</p><p className="mt-1 truncate text-gray-500">{customer.email || 'No email'}</p></div><p className="pl-[4.25rem] text-xs text-gray-600 md:pl-0">{item.outlets?.name || 'Malaysia outlet'}<span className="block mt-1 text-gray-400">#{item.order_id.slice(0, 8)}</span></p><p className="pl-[4.25rem] text-sm font-semibold text-gray-900 md:pl-0">RM {Number(item.line_total).toFixed(2)}</p><div className="pl-[4.25rem] md:pl-0"><StatusBadge status={item.fulfil_status} /><span className="mt-1 block text-[11px] text-gray-400">Order {item.orders?.status || 'unknown'}</span></div><div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3 md:border-0 md:pt-0"><button type="button" title="View order" onClick={() => setSelectedItem(item)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-blue-700"><Eye size={16} /></button>{item.fulfil_status === 'pending' && item.orders?.status === 'paid' && <button type="button" title="Mark ready" onClick={() => updateFulfil(item, 'ready')} className="rounded-lg p-2 text-blue-700 hover:bg-blue-50"><Check size={16} /></button>}{(item.fulfil_status === 'pending' || item.fulfil_status === 'ready') && ['paid', 'completed'].includes(item.orders?.status || '') && <button type="button" title="Fulfil" onClick={() => updateFulfil(item, 'fulfilled')} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"><PackageCheck size={16} /></button>}</div></article>; })}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadOrders(page); }} /></>}</section>

      {selectedItem && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedItem(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-blue-700">Order item</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedItem.product_name}</h2></div><button type="button" onClick={() => setSelectedItem(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 flex items-center gap-3 rounded-xl bg-blue-50 p-4"><CompactThumbnail src={imageFor(selectedItem)} alt={selectedItem.product_name} kind="product" size="md" /><div><p className="font-semibold text-gray-900">{selectedItem.quantity}× {selectedItem.product_name}</p><p className="mt-1 text-xs text-gray-500">Order #{selectedItem.order_id.slice(0, 8)}</p></div></div><div className="mt-4 space-y-3 text-sm"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Customer</p><p className="mt-1 font-semibold text-gray-900">{customerFor(selectedItem).full_name || 'Guest'}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Total</p><p className="mt-1 font-semibold text-gray-900">RM {Number(selectedItem.line_total).toFixed(2)}</p></div></div><p className="text-gray-600">Email: {customerFor(selectedItem).email || 'No email'}</p><p className="text-gray-600">Outlet: {selectedItem.outlets?.name || 'Malaysia outlet'}</p><p className="text-gray-600">Purchased: {dateLabel(selectedItem.created_at)}</p><div className="flex items-center justify-between rounded-xl border border-gray-100 p-4"><span className="text-gray-500">Fulfilment</span><StatusBadge status={selectedItem.fulfil_status} /></div></div><div className="mt-7 flex gap-2">{selectedItem.fulfil_status === 'pending' && selectedItem.orders?.status === 'paid' && <button type="button" onClick={() => updateFulfil(selectedItem, 'ready')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-semibold text-white"><Check size={15} /> Mark ready</button>}{(selectedItem.fulfil_status === 'pending' || selectedItem.fulfil_status === 'ready') && ['paid', 'completed'].includes(selectedItem.orders?.status || '') && <button type="button" onClick={() => updateFulfil(selectedItem, 'fulfilled')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><PackageCheck size={15} /> Fulfil</button>}<button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">Close</button></div></aside></div>}
    </div>
  );
}
