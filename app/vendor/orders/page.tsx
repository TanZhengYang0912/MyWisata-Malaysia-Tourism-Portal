'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Download, Eye, PackageCheck, Search, ShoppingBag, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useDebounce } from '@/hooks/use-debounce';
import { exportToCsv, type CsvColumn } from '@/lib/export-csv';

interface OrderItemData { id: string; order_id: string; product_name: string; variant_name: string | null; slot_starts_at: string | null; quantity: number; line_total: number; fulfil_status: string; created_at: string; outlets?: { id?: string; name?: string; city?: string; state?: string }; products?: { cover_url?: string | null } | Array<{ cover_url?: string | null }>; }
interface VendorOrderData { id: string; display_id?: string; status: string; paid_at?: string | null; completed_at?: string | null; created_at: string; users?: { full_name?: string; email?: string } | Array<{ full_name?: string; email?: string }>; vendor_total: number; vendor_items: OrderItemData[]; outlets_summary: string; vendor_fulfil_status: string; product_summary: string; }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

import { productImageUrl } from '@/lib/storage/product-image';
import { formatMYR } from "@/lib/i18n/format";

function customerFor(order: VendorOrderData) { const customer = Array.isArray(order.users) ? order.users[0] : order.users; return customer || {}; }
function imageFor(item: OrderItemData) { const product = Array.isArray(item.products) ? item.products[0] : item.products; return productImageUrl(product?.cover_url) || undefined; }
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function dateLabel(value?: string | null) { return value ? new Date(value).toLocaleString('en-MY', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'; }

export default function VendorOrdersPage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
  const vendorId = user?.activeVendorId;
  const [items, setItems] = useState<VendorOrderData[]>([]);
  const [selectedItem, setSelectedItem] = useState<VendorOrderData | null>(null);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ q: '', fulfilStatus: '', orderStatus: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');

  const debouncedQ = useDebounce(filters.q, 300);

  const loadOrders = useCallback(async (page = 1) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: '10', q: debouncedQ, fulfil_status: filters.fulfilStatus, order_status: filters.orderStatus, from: filters.from, to: filters.to });
      const response = await fetch(`/api/vendors/${vendorId}/orders?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || t('ui.orders.loadFailed'));
      setItems(payload.data?.items || []); setPagination(payload.data?.pagination || { page, pageSize: 10, total: 0, totalPages: 1 });
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : t('ui.orders.loadFailed')); }
    finally { setLoading(false); }
  }, [debouncedQ, filters.fulfilStatus, filters.orderStatus, filters.from, filters.to, t, vendorId]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadOrders(1); }, [loadOrders]);

  function handleExportOrders() {
    if (!items.length) return;
    const columns: CsvColumn<VendorOrderData>[] = [
      { header: 'Order ID', accessor: (o) => o.display_id || o.id },
      { header: 'Customer', accessor: (o) => customerFor(o).full_name || 'Guest' },
      { header: 'Email', accessor: (o) => customerFor(o).email || '' },
      { header: 'Products', accessor: (o) => o.product_summary },
      { header: 'Outlets', accessor: (o) => o.outlets_summary },
      { header: 'Total (MYR)', accessor: (o) => formatMYR(Number(o.vendor_total)) },
      { header: 'Fulfilment Status', accessor: (o) => o.vendor_fulfil_status },
      { header: 'Order Status', accessor: (o) => o.status },
      { header: 'Date', accessor: (o) => new Date(o.created_at).toLocaleString() },
    ];
    exportToCsv(`orders-${new Date().toISOString().split('T')[0]}`, columns, items);
  }

  async function updateFulfilOrder(order: VendorOrderData, status: 'ready' | 'fulfilled') {
    if (!vendorId) return;
    const itemIds = order.vendor_items.map(i => i.id);
    try {
      const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'orders', action: status, ids: itemIds, selectAllFiltered: false, filters: {} }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('ui.orders.updateFailed'); setError(message); showFeedback('error', message); return; }
      showFeedback('success', status === 'ready' ? t('ui.orders.orderMarkedReady') : t('ui.orders.orderFulfilled'));
      setSelectedItem(null); loadOrders(pagination.page);
    } catch { setError(t('ui.orders.updateFailed')); showFeedback('error', t('ui.orders.updateTryAgain')); }
  }

  async function updateFulfilItem(itemId: string, status: 'ready' | 'fulfilled') {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/orders/${itemId}/fulfil`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('ui.orders.updateFailed'); setError(message); showFeedback('error', message); return; }
      showFeedback('success', status === 'ready' ? t('ui.orders.itemMarkedReady') : t('ui.orders.itemFulfilled'));
    // If updating a single item, we reload and maybe we should keep the drawer open, but for now we'll reload which might refresh the drawer data.
    // Actually, to refresh drawer we need to fetch the single order, but loadOrders works.
    loadOrders(pagination.page);
    // Optimistically update the selectedItem state so UI doesn't jump
      setSelectedItem((curr) => {
      if (!curr) return null;
      return { ...curr, vendor_items: curr.vendor_items.map((i) => i.id === itemId ? { ...i, fulfil_status: status } : i) };
      });
    } catch { setError(t('ui.orders.updateFailed')); showFeedback('error', t('ui.orders.updateTryAgain')); }
  }

  function clearFilters() { setFilters({ q: '', fulfilStatus: '', orderStatus: '', from: '', to: '' }); }
  function toggleSelected(orderId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(orderId) ? current.filter((id) => id !== orderId) : [...current, orderId]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    // Extract item IDs from selected orders
    const selectedOrders = items.filter(o => selectedIds.includes(o.id));
    const itemIds = selectedOrders.flatMap(o => o.vendor_items.map(i => i.id));

    const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'orders', action, ids: itemIds, selectAllFiltered: allFilteredSelected, filters }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || t('ui.common.batchFailed')); return; }
    setBatchMessage(payload.data?.skipped ? t('ui.orders.batchSummarySkipped', { updated: payload.data.updated, skipped: payload.data.skipped }) : t('ui.orders.batchSummary', { count: payload.data?.updated || 0 }));
    setSelectedIds([]); setAllFilteredSelected(false); loadOrders(1);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><ShoppingBag size={15} /> {t('ui.orders.fulfilmentDesk')}</div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">{t('ui.orders.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('ui.orders.description')}</p>
        </div>
        <button
          type="button"
          onClick={handleExportOrders}
          disabled={loading || items.length === 0}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-40"
        >
          <Download size={16} /> {t('actions.exportCsv')}
        </button>
      </header>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"><div className="flex flex-wrap gap-1 rounded-xl bg-gray-100 p-1"><button type="button" onClick={() => setFilters((current) => ({ ...current, fulfilStatus: '' }))} className={`rounded-lg px-3 py-2 text-xs font-semibold ${!filters.fulfilStatus ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{t('ui.orders.allItems')}</button>{['pending', 'ready', 'fulfilled', 'cancelled'].map((status) => <button key={status} type="button" onClick={() => setFilters((current) => ({ ...current, fulfilStatus: status }))} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize ${filters.fulfilStatus === status ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}>{t(`ui.status.${status}`)}</button>)}</div><div className="grid gap-2 sm:grid-cols-2 md:flex"><label className="relative sm:col-span-2"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder={t('ui.orders.searchPlaceholder')} className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-primary md:w-64" /></label><select value={filters.orderStatus} onChange={(event) => setFilters((current) => ({ ...current, orderStatus: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-primary"><option value="">{t('ui.orders.allOrderStates')}</option>{['paid', 'completed', 'pending_payment', 'cancelled', 'refunded'].map((status) => <option key={status} value={status}>{t(`ui.status.${status}`)}</option>)}</select><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-xs text-gray-600" /><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-xs text-gray-600" /></div>{(filters.q || filters.fulfilStatus || filters.orderStatus || filters.from || filters.to) && <button type="button" onClick={clearFilters} className="self-start text-xs font-semibold text-primary hover:underline">{t('ui.common.clearFilters')}</button>}</div>
      <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(items.map((item) => item.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'ready', label: t('ui.orders.markReady') }, { value: 'fulfilled', label: t('ui.orders.fulfilSelected') }]} busy={batchBusy} message={batchMessage} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">{loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : items.length === 0 ? <div className="px-6 py-16 text-center text-sm text-gray-400"><PackageCheck className="mx-auto mb-3 opacity-30" size={34} /><p>{t('ui.orders.noMatches')}</p></div> : <><div className="flex items-center justify-between border-b border-gray-100 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={items.length > 0 && items.every((order) => selectedIds.includes(order.id))} onChange={(event) => setSelectedIds(event.target.checked ? items.map((order) => order.id) : [])} /> {t('ui.orders.selectCurrentPage')}</label><span>{t('ui.orders.pageSummary', { count: pagination.total.toLocaleString(), perPage: 10 })}</span></div><div className="hidden grid-cols-[32px_minmax(150px,1.2fr)_minmax(220px,1.7fr)_minmax(140px,1fr)_110px_110px_90px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>{t('ui.orders.customerColumn')}</span><span>{t('ui.orders.itemsColumn')}</span><span>{t('ui.orders.outletColumn')}</span><span>{t('ui.orders.totalColumn')}</span><span>{t('ui.orders.statusColumn')}</span><span className="text-right">{t('ui.orders.actionColumn')}</span></div><div className="divide-y divide-gray-100">{items.map((order) => { const customer = customerFor(order); return <article key={order.id} className="grid gap-3 px-4 py-4 transition hover:bg-secondary/30 md:grid-cols-[32px_minmax(150px,1.2fr)_minmax(220px,1.7fr)_minmax(140px,1fr)_110px_110px_90px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(order.id)} onChange={() => toggleSelected(order.id)} aria-label={t('ui.orders.selectOrder', { id: order.id })} /></div><div className="min-w-0"><p className="truncate font-medium text-gray-800">{customer.full_name || t('ui.orders.guest')}</p><p className="mt-1 truncate text-xs text-gray-500">{order.display_id || `#${order.id.slice(0, 8)}`}</p></div><div className="flex min-w-0 items-center gap-3">{order.vendor_items.length > 0 && <div className="flex items-center gap-1">{order.vendor_items.slice(0, 2).map((item, i) => <CompactThumbnail key={i} src={imageFor(item)} alt={item.product_name} kind="product" />)}{order.vendor_items.length > 2 && <span className="ml-1 text-xs font-medium text-gray-400">+{order.vendor_items.length - 2}</span>}</div>}<div className="min-w-0"><button type="button" onClick={() => setSelectedItem(order)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-primary">{t('ui.orders.itemCount', { count: order.vendor_items.length })}</button><p className="mt-1 truncate text-xs text-gray-500">{order.product_summary}</p></div></div><p className="pl-[4.25rem] text-xs text-gray-600 md:pl-0">{order.outlets_summary}</p><p className="pl-[4.25rem] text-sm font-semibold text-gray-900 md:pl-0">{formatMYR(Number(order.vendor_total))}</p><div className="pl-[4.25rem] md:pl-0"><StatusBadge status={order.vendor_fulfil_status} /><span className="mt-1 block text-[11px] text-gray-400">{t('ui.orders.orderStatus', { status: order.status || t('ui.orders.unknown') })}</span></div><div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3 md:border-0 md:pt-0"><button type="button" title={t('ui.orders.viewDetails')} onClick={() => setSelectedItem(order)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"><Eye size={16} /></button>{order.vendor_fulfil_status === 'pending' && order.status === 'paid' && <button type="button" title={t('ui.orders.markReady')} onClick={() => updateFulfilOrder(order, 'ready')} className="rounded-lg p-2 text-primary hover:bg-secondary"><Check size={16} /></button>}{(order.vendor_fulfil_status === 'pending' || order.vendor_fulfil_status === 'ready') && ['paid', 'completed'].includes(order.status || '') && <button type="button" title={t('ui.orders.fulfil')} onClick={() => updateFulfilOrder(order, 'fulfilled')} className="rounded-lg p-2 text-primary hover:bg-secondary"><PackageCheck size={16} /></button>}</div></article>; })}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadOrders(page); }} /></>}</section>

      {selectedItem && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedItem(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('ui.orders.orderDetails')}</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedItem.display_id || `#${selectedItem.id.slice(0, 8)}`}</h2></div><button type="button" onClick={() => setSelectedItem(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 flex flex-col gap-4"><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">{t('ui.orders.customerColumn')}</p><p className="mt-1 font-semibold text-gray-900">{customerFor(selectedItem).full_name || t('ui.orders.guest')}</p><p className="text-xs text-gray-500">{customerFor(selectedItem).email || t('ui.orders.noEmail')}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">{t('ui.orders.totalYourItems')}</p><p className="mt-1 font-semibold text-gray-900">{formatMYR(Number(selectedItem.vendor_total))}</p></div></div><div className="flex items-center justify-between rounded-xl border border-gray-100 p-4"><span className="text-gray-500 text-sm">{t('ui.orders.overallFulfilment')}</span><StatusBadge status={selectedItem.vendor_fulfil_status} /></div></div><div className="mt-6"><h3 className="font-semibold text-gray-900 mb-3 text-sm">{t('ui.orders.orderItems')}</h3><div className="space-y-3">{selectedItem.vendor_items.map((i) => <div key={i.id} className="flex flex-col gap-3 rounded-xl border border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><CompactThumbnail src={imageFor(i)} alt={i.product_name} kind="product" /><div><p className="font-semibold text-gray-900">{i.quantity}× {i.product_name}</p><p className="mt-1 text-xs text-gray-500">{i.variant_name || t('ui.orders.standard')} · {i.outlets?.name}</p></div></div><div className="flex items-center gap-3"><StatusBadge status={i.fulfil_status} />{i.fulfil_status === 'pending' && selectedItem.status === 'paid' && <button type="button" onClick={() => updateFulfilItem(i.id, 'ready')} className="rounded-lg p-2 text-primary hover:bg-secondary" title={t('ui.orders.markReady')}><Check size={16} /></button>}{(i.fulfil_status === 'pending' || i.fulfil_status === 'ready') && ['paid', 'completed'].includes(selectedItem.status || '') && <button type="button" onClick={() => updateFulfilItem(i.id, 'fulfilled')} className="rounded-lg p-2 text-primary hover:bg-secondary" title={t('ui.orders.fulfil')}><PackageCheck size={16} /></button>}</div></div>)}</div></div><div className="mt-7 flex gap-2">{selectedItem.vendor_fulfil_status === 'pending' && selectedItem.status === 'paid' && <button type="button" onClick={() => updateFulfilOrder(selectedItem, 'ready')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><Check size={15} /> {t('ui.orders.markOrderReady')}</button>}{(selectedItem.vendor_fulfil_status === 'pending' || selectedItem.vendor_fulfil_status === 'ready') && ['paid', 'completed'].includes(selectedItem.status || '') && <button type="button" onClick={() => updateFulfilOrder(selectedItem, 'fulfilled')} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><PackageCheck size={15} /> {t('ui.orders.fulfilOrder')}</button>}<button type="button" onClick={() => setSelectedItem(null)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">{t('ui.orders.close')}</button></div></aside></div>}
    </div>
  );
}
