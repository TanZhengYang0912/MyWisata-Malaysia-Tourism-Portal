'use client';

import { useCallback, useEffect, useState } from 'react';
import { Archive, ArrowRight, CirclePlus, Eye, PackageCheck, Pencil, RotateCcw, SlidersHorizontal, Utensils, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { toRM } from '@/lib/money';
import { StatusBadge } from '@/components/ui/badge';
import ProductForm from '@/components/vendor/product-form';
import VariantManager from '@/components/vendor/variant-manager';
import CompactFilterBar from '@/components/vendor/compact-filter-bar';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';

interface ProductData {
  id: string;
  outlet_id: string;
  name: string;
  description?: string | null;
  product_type: string;
  base_price: number;
  status: string;
  requires_booking: boolean;
  cover_url?: string | null;
  tags?: string[] | null;
  outlet?: { name?: string; city?: string; state?: string };
  variants?: any[];
  availableStock?: number;
}

interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

const TYPE_OPTIONS = [
  { value: 'food', label: 'Food & dining' }, { value: 'activity', label: 'Activities' }, { value: 'experience', label: 'Experiences' }, { value: 'product', label: 'Products' },
];

function typeLabel(value: string) { return TYPE_OPTIONS.find((option) => option.value === value)?.label || value; }
function imageKind(value: string): 'food' | 'experience' | 'product' { return value === 'food' ? 'food' : value === 'activity' || value === 'experience' ? 'experience' : 'product'; }

export default function VendorProductsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductData[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string }[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ q: '', productType: '', status: '', outletId: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductData | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');

  const vendorId = user?.activeVendorId;

  const loadProducts = useCallback(async (requestedPage = pagination.page) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: '10', q: filters.q, product_type: filters.productType, status: filters.status, outlet_id: filters.outletId });
    const response = await fetch(`/api/vendors/${vendorId}/products?${params}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message || 'Could not load products'); setLoading(false); return; }
    setProducts(payload.data?.items || []); setPagination(payload.data?.pagination || { page: requestedPage, pageSize: 10, total: 0, totalPages: 1 }); setLoading(false);
  }, [filters, pagination.page, vendorId]);

  useEffect(() => {
    if (!vendorId) return;
    fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=100`, { cache: 'no-store' }).then((response) => response.json()).then((payload) => setOutlets(payload.data?.items || payload.data || []));
  }, [vendorId]);

  useEffect(() => { loadProducts(1); }, [filters, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleDelete(productId: string) {
    if (!vendorId || !confirm('Archive this listing? It will no longer be visible to customers.')) return;
    const response = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: 'DELETE' });
    if (!response.ok) { const payload = await response.json(); setError(payload.error?.message || 'Could not archive listing'); return; }
    setSelectedProduct(null); loadProducts(pagination.page);
  }

  async function handleRestore(productId: string) {
    if (!vendorId) return;
    const response = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
    if (!response.ok) { const payload = await response.json(); setError(payload.error?.message || 'Could not restore listing'); return; }
    setSelectedProduct(null); loadProducts(pagination.page);
  }

  function toggleSelected(productId: string) {
    setAllFilteredSelected(false);
    setSelectedIds((current) => current.includes(productId) ? current.filter((id) => id !== productId) : [...current, productId]);
  }

  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const response = await fetch(`/api/vendors/${vendorId}/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'products', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters: { q: filters.q, productType: filters.productType, status: filters.status, outletId: filters.outletId } }) });
    const payload = await response.json();
    setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || 'Batch action failed'); return; }
    setBatchMessage(payload.data?.skipped ? payload.data.updated + ' updated, ' + payload.data.skipped + ' skipped by status.' : payload.data?.updated + ' listings updated.');
    setSelectedIds([]); setAllFilteredSelected(false); loadProducts(1);
  }

  function clearFilters() { setFilters({ q: '', productType: '', status: '', outletId: '' }); }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700"><Utensils size={15} /> Catalogue management</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Products & activities</h1><p className="mt-1 text-sm text-gray-500">Keep each Malaysian listing easy to scan and ready to book.</p></div><button type="button" onClick={() => { setEditingProduct(null); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><CirclePlus size={17} /> Add listing</button></header>

      <CompactFilterBar search={filters.q} onSearchChange={(value) => setFilters((current) => ({ ...current, q: value }))} placeholder="Search product ID, name or slug…" selects={[{ value: filters.productType, placeholder: 'All types', options: TYPE_OPTIONS, onChange: (value) => setFilters((current) => ({ ...current, productType: value })) }, { value: filters.status, placeholder: 'All statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }], onChange: (value) => setFilters((current) => ({ ...current, status: value })) }, { value: filters.outletId, placeholder: 'All outlets', options: outlets.map((outlet) => ({ value: outlet.id, label: outlet.name })), onChange: (value) => setFilters((current) => ({ ...current, outletId: value })) }]} onClear={clearFilters} />

      <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(products.map((product) => product.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'archive', label: 'Archive selected' }, { value: 'restore', label: 'Restore selected' }]} busy={batchBusy} message={batchMessage} />
      <div className="flex items-center justify-between text-xs text-gray-500"><span>{pagination.total.toLocaleString()} listings in your catalogue</span><span className="inline-flex items-center gap-1"><SlidersHorizontal size={14} /> 10 per page</span></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div> : products.length === 0 ? <div className="px-6 py-16 text-center text-gray-400"><PackageCheck className="mx-auto mb-3 opacity-30" size={34} /><p className="text-sm">No listings match these filters.</p><button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-emerald-700 hover:underline">Clear filters</button></div> : <>
          <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={products.length > 0 && products.every((product) => selectedIds.includes(product.id))} onChange={(event) => setSelectedIds(event.target.checked ? products.map((product) => product.id) : [])} /> Select current page</label></div><div className="hidden grid-cols-[32px_minmax(280px,2fr)_minmax(160px,1fr)_120px_110px_112px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>Listing</span><span>Outlet</span><span>Price</span><span>Status</span><span className="text-right">Action</span></div>
          <div className="divide-y divide-gray-100">{products.map((product) => <article key={product.id} className="grid gap-3 px-4 py-4 transition hover:bg-emerald-50/30 md:grid-cols-[32px_minmax(280px,2fr)_minmax(160px,1fr)_120px_110px_112px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} aria-label={'Select ' + product.name} /></div><div className="flex min-w-0 items-center gap-3"><CompactThumbnail src={product.cover_url} alt={product.name} kind={imageKind(product.product_type)} /><div className="min-w-0"><button type="button" onClick={() => setSelectedProduct(product)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-emerald-700">{product.name}</button><p className="mt-1 truncate text-xs text-gray-500">{typeLabel(product.product_type)} {product.requires_booking ? '· Booking required' : ''}</p></div></div><div className="pl-[4.25rem] text-xs text-gray-500 md:pl-0"><span className="font-medium text-gray-700">{product.outlet?.name || 'Unassigned outlet'}</span><span className="block mt-1">{product.outlet?.city || product.outlet?.state || 'Malaysia'}</span></div><div className="pl-[4.25rem] text-sm font-semibold text-gray-900 md:pl-0">{toRM(Number(product.base_price))}<span className="block mt-1 text-[11px] font-normal text-gray-400">{product.availableStock ? product.availableStock + ' in stock' : product.requires_booking ? 'Time slots' : 'Inventory'}</span></div><div className="pl-[4.25rem] md:pl-0"><StatusBadge status={product.status} /></div><div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3 md:border-0 md:pt-0"><button type="button" onClick={() => setSelectedProduct(product)} title="View details" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-emerald-700"><Eye size={16} /></button><button type="button" onClick={() => { setEditingProduct(product); setShowForm(true); }} title="Edit listing" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-emerald-700"><Pencil size={16} /></button>{product.status === 'archived' ? <button type="button" onClick={() => handleRestore(product.id)} title="Restore listing" className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"><RotateCcw size={16} /></button> : <button type="button" onClick={() => handleDelete(product.id)} title="Archive listing" className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Archive size={16} /></button>}</div></article>)}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadProducts(page); }} /></>}
      </section>

      {(showForm || editingProduct) && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><ProductForm vendorId={vendorId} initialData={editingProduct ? { id: editingProduct.id, outletId: editingProduct.outlet_id, name: editingProduct.name, description: editingProduct.description || undefined, productType: editingProduct.product_type as any, basePrice: editingProduct.base_price, requiresBooking: editingProduct.requires_booking, coverUrl: editingProduct.cover_url || undefined, tags: editingProduct.tags || undefined } : undefined} onSuccess={() => { setShowForm(false); setEditingProduct(null); loadProducts(pagination.page); }} onClose={() => { setShowForm(false); setEditingProduct(null); }} /></div></div>}

      {selectedProduct && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedProduct(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Listing details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedProduct.name}</h2></div><button type="button" onClick={() => setSelectedProduct(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-5"><CompactThumbnail src={selectedProduct.cover_url} alt={selectedProduct.name} kind={imageKind(selectedProduct.product_type)} size="md" /></div><div className="mt-5 grid grid-cols-2 gap-3 text-sm"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Type</p><p className="mt-1 font-semibold text-gray-900">{typeLabel(selectedProduct.product_type)}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Base price</p><p className="mt-1 font-semibold text-gray-900">{toRM(Number(selectedProduct.base_price))}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Outlet</p><p className="mt-1 font-semibold text-gray-900">{selectedProduct.outlet?.name || 'Unassigned'}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedProduct.status} /></div></div></div><p className="mt-5 text-sm leading-6 text-gray-600">{selectedProduct.description || 'No description added yet.'}</p>{selectedProduct.variants?.length ? <div className="mt-6"><p className="mb-2 text-sm font-semibold text-gray-900">Variants</p><div className="space-y-2">{selectedProduct.variants.map((variant: any) => <div key={variant.id} className="flex items-center justify-between rounded-lg border border-gray-100 px-3 py-2 text-sm"><span>{variant.name}</span><span className="text-gray-500">{Number(variant.price_offset) ? `${Number(variant.price_offset) > 0 ? '+' : ''}RM ${Number(variant.price_offset).toFixed(2)}` : 'Base price'}</span></div>)}</div></div> : null}<div className="mt-7 flex gap-2"><button type="button" onClick={() => { setEditingProduct(selectedProduct); setSelectedProduct(null); setShowForm(true); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Pencil size={15} /> Edit listing</button><button type="button" onClick={() => setSelectedProduct(null)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">Close</button></div></aside></div>}
    </div>
  );
}
