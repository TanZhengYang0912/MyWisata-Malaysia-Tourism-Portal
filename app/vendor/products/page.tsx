'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Archive, CirclePlus, Copy, Eye, PackageCheck, Pencil, RotateCcw, SlidersHorizontal, Utensils } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useAuth } from '@/hooks/use-auth';
import { toRM } from '@/lib/money';
import { StatusBadge } from '@/components/ui/badge';
import ProductForm from '@/components/vendor/product-form';
import ProductDetailsPage from '@/components/vendor/product-details-page';
import CompactFilterBar from '@/components/vendor/compact-filter-bar';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { outletLocation, outletShortName, outletIdLabel } from '@/lib/outlet-display';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { ShareButton } from '@/components/shared/share-button';
import { productImageUrl } from '@/lib/storage/product-image';

interface ProductData {
  id: string;
  display_id?: string;
  outlet_id: string;
  name: string;
  description?: string | null;
  product_type: string;
  base_price: number;
  status: string;
  review_status?: string;
  category_id?: string | null;
  requires_booking: boolean;
  cover_url?: string | null;
  tags?: string[] | null;
  default_capacity?: number | null;
  digital_asset_url?: string | null;
  digital_asset_name?: string | null;
  digital_asset_type?: string | null;
  digital_asset_size?: number | null;
  media_assets?: { id: string; url: string; alt_text?: string | null; sort_order?: number | null }[];
  outlet?: { id?: string; name?: string; city?: string; state?: string };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variants?: any[];
  availableStock?: number;
  lowStockThreshold?: number;
}

interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

const TYPE_OPTIONS = [
  { value: 'food', label: 'Food & dining' }, { value: 'activity', label: 'Activities' }, { value: 'experience', label: 'Experiences' }, { value: 'product', label: 'Products' }, { value: 'digital', label: 'Digital products' }, { value: 'service', label: 'Services' },
];

function typeLabel(value: string) { return TYPE_OPTIONS.find((option) => option.value === value)?.label || value; }
function imageKind(value: string): 'food' | 'experience' | 'product' { return value === 'food' ? 'food' : value === 'activity' || value === 'experience' ? 'experience' : 'product'; }

export default function VendorProductsPage() {
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string; city?: string | null; state?: string | null }[]>([]);
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
  const [copiedProductId, setCopiedProductId] = useState<string | null>(null);

  const vendorId = user?.activeVendorId;
  const isOwner = user?.roles.includes('vendor_owner') ?? false;
  const canManageOutlet = isOwner || (user?.roles.includes('outlet_manager') ?? false);
  const scopedOutlet = outlets.find((outlet) => outlet.id === user?.activeOutletIds?.[0]) || outlets[0];
  const tableGridClass = isOwner
    ? 'md:grid-cols-[32px_minmax(280px,2fr)_minmax(160px,1fr)_120px_110px_112px]'
    : 'md:grid-cols-[minmax(300px,2fr)_minmax(180px,1.1fr)_120px_110px_112px]';
  const filterSelects = [
    { value: filters.productType, placeholder: 'All types', options: TYPE_OPTIONS, onChange: (value: string) => setFilters((current) => ({ ...current, productType: value })) },
    { value: filters.status, placeholder: 'All statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'archived', label: 'Archived' }], onChange: (value: string) => setFilters((current) => ({ ...current, status: value })) },
    ...(isOwner ? [{ value: filters.outletId, placeholder: 'All outlets', options: outlets.map((outlet) => ({ value: outlet.id, label: `${outletShortName(outlet.name)} · ${outlet.city || outlet.state || 'Malaysia'}` })), onChange: (value: string) => setFilters((current) => ({ ...current, outletId: value })) }] : []),
  ];

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

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadProducts(1); }, [filters, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!vendorId) return;
    const channel = supabase
      .channel(`vendor-inventory-${vendorId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'inventory' }, () => { void loadProducts(pagination.page); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [vendorId, supabase, loadProducts, pagination.page]);

  async function handleDelete(productId: string) {
    if (!vendorId || !confirm('Archive this listing? It will no longer be visible to customers.')) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || 'Could not archive listing'; setError(message); showFeedback('error', message); return; }
      showFeedback('success', 'Product archived successfully.');
      setSelectedProduct(null); loadProducts(pagination.page);
    } catch { setError('Could not archive listing.'); showFeedback('error', 'Could not archive listing. Please try again.'); }
  }

  async function handleRestore(productId: string) {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || 'Could not restore listing'; setError(message); showFeedback('error', message); return; }
      showFeedback('success', 'Product restored successfully.');
      setSelectedProduct(null); loadProducts(pagination.page);
    } catch { setError('Could not restore listing.'); showFeedback('error', 'Could not restore listing. Please try again.'); }
  }

  async function copyProductId(productId: string) {
    try {
      await navigator.clipboard.writeText(productId);
      setCopiedProductId(productId);
      window.setTimeout(() => setCopiedProductId((current) => current === productId ? null : current), 1600);
    } catch {
      setError('Could not copy product ID');
    }
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
      {selectedProduct ? <ProductDetailsPage
        product={selectedProduct}
        vendorId={vendorId || ''}
        canManageOutlet={canManageOutlet}
        productTypeLabel={typeLabel(selectedProduct.product_type)}
        productImageKind={imageKind(selectedProduct.product_type)}
        outletFallback={scopedOutlet}
        productOptions={products.filter((product) => product.id !== selectedProduct.id && product.outlet_id === selectedProduct.outlet_id).map((product) => ({ id: product.id, name: product.name, base_price: Number(product.base_price) }))}
        copiedProductId={copiedProductId}
        onCopyProductId={copyProductId}
        onBack={() => setSelectedProduct(null)}
        onEdit={() => { setEditingProduct(selectedProduct); setShowForm(true); }}
        onUpdate={() => { setSelectedProduct(null); loadProducts(pagination.page); }}
      /> : <>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><Utensils size={15} /> Catalogue management</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Products & activities</h1><p className="mt-1 text-sm text-gray-500">Keep each Malaysian listing easy to scan and ready to book.</p>{!isOwner && <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-primary/10 bg-secondary px-3 py-2 text-xs text-primary"><span className="font-semibold uppercase tracking-[0.12em] text-primary">Assigned outlet</span><span className="truncate font-semibold">{outletShortName(user?.activeOutletName || scopedOutlet?.name)}</span><span className="shrink-0 font-mono text-[10px] text-primary">{outletIdLabel(user?.activeOutletIds?.[0] || scopedOutlet?.id)}</span></div>}</div>{canManageOutlet && <button type="button" onClick={() => { setEditingProduct(null); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"><CirclePlus size={17} /> Add listing</button>}</header>

      <CompactFilterBar search={filters.q} onSearchChange={(value) => setFilters((current) => ({ ...current, q: value }))} placeholder="Search product ID, name or slug…" selects={filterSelects} onClear={clearFilters} />

      {canManageOutlet && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(products.map((product) => product.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'archive', label: 'Archive selected' }, { value: 'restore', label: 'Restore selected' }]} busy={batchBusy} message={batchMessage} />}
      <div className="flex items-center justify-between text-xs text-gray-500"><span>{pagination.total.toLocaleString()} listings in your catalogue</span><span className="inline-flex items-center gap-1"><SlidersHorizontal size={14} /> 10 per page</span></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div> : products.length === 0 ? <div className="px-6 py-16 text-center text-gray-400"><PackageCheck className="mx-auto mb-3 opacity-30" size={34} /><p className="text-sm">No listings match these filters.</p><button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-primary hover:underline">Clear filters</button></div> : <>
          {canManageOutlet && <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={products.length > 0 && products.every((product) => selectedIds.includes(product.id))} onChange={(event) => setSelectedIds(event.target.checked ? products.map((product) => product.id) : [])} /> Select current page</label></div>}<div className={`hidden ${tableGridClass} gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid`}>{isOwner && <span></span>}<span>Listing</span><span>{isOwner ? 'Outlet' : 'Assigned outlet'}</span><span>Price</span><span>Status</span><span className="text-right">Action</span></div>
          <div className="divide-y divide-gray-100">{products.map((product) => <article key={product.id} className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/30 ${tableGridClass} md:items-center md:gap-4 md:px-5`}>{isOwner && <div><input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} aria-label={'Select ' + product.name} /></div>}<div className="flex min-w-0 items-center gap-3"><CompactThumbnail src={productImageUrl(product.cover_url)} alt={product.name} kind={imageKind(product.product_type)} /><div className="min-w-0"><button type="button" onClick={() => setSelectedProduct(product)} className="block max-w-full text-left font-semibold leading-5 text-gray-900 hover:text-primary line-clamp-2">{product.name}</button>                  <p className="mt-1 truncate text-xs text-gray-500">{typeLabel(product.product_type)} {product.requires_booking ? '· Booking required' : ''}</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      copyProductId(product.display_id || product.id);
                    }}
                    title="Copy product ID"
                    className="mt-1 group/id inline-flex items-center gap-1 font-mono text-[10px] text-gray-400 hover:text-primary transition-colors focus:outline-none"
                  >
                    <span>{product.display_id || product.id}</span>
                    {copiedProductId === (product.display_id || product.id) ? (
                      <span className="font-semibold text-primary">· Copied!</span>
                    ) : (
                      <Copy size={10} className="opacity-0 group-hover/id:opacity-100 transition-opacity" />
                    )}
                  </button></div></div><div className="pl-[4.25rem] text-xs text-gray-500 md:pl-0"><span className="block truncate font-medium text-gray-700">{outletShortName(product.outlet?.name || user?.activeOutletName)}</span><span className="mt-1 block truncate">{outletLocation(product.outlet?.city, product.outlet?.state)}</span><span className="mt-1 block font-mono text-[10px] text-gray-400">{outletIdLabel(product.outlet?.id || product.outlet_id || user?.activeOutletIds?.[0])}</span></div><div className="pl-[4.25rem] text-sm font-semibold text-gray-900 md:pl-0">{toRM(Number(product.base_price))}<span className={`mt-1 block text-[11px] font-semibold ${product.requires_booking ? 'text-gray-400' : product.availableStock === 0 ? 'text-red-600' : product.availableStock !== undefined && product.availableStock <= (product.lowStockThreshold ?? 5) ? 'text-amber-700' : 'text-primary'}`}>{product.requires_booking ? 'Time slots' : product.availableStock === 0 ? 'Out of stock' : `${product.availableStock} in stock${product.availableStock !== undefined && product.availableStock <= (product.lowStockThreshold ?? 5) ? ' · Low stock' : ''}`}</span></div><div className="pl-[4.25rem] md:pl-0"><StatusBadge status={product.status} /></div><div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3 md:border-0 md:pt-0"><button type="button" onClick={() => setSelectedProduct(product)} title="View details" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"><Eye size={16} /></button><ShareButton compact shareType="product" contentId={product.id} title={product.name} plainOnly />{canManageOutlet && <><button type="button" onClick={() => { setEditingProduct(product); setShowForm(true); }} title="Edit listing" className="rounded-lg p-2 text-gray-500 hover:bg-secondary hover:text-primary"><Pencil size={16} /></button>{product.status === 'archived' ? <button type="button" onClick={() => handleRestore(product.id)} title="Restore listing" className="rounded-lg p-2 text-primary hover:bg-secondary"><RotateCcw size={16} /></button> : <button type="button" onClick={() => handleDelete(product.id)} title="Archive listing" className="rounded-lg p-2 text-red-500 hover:bg-red-50"><Archive size={16} /></button>}</>}</div></article>)}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadProducts(page); }} /></>}
      </section>
      </>}

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {canManageOutlet && (showForm || editingProduct) && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><ProductForm vendorId={vendorId} outletIds={isOwner ? undefined : user?.activeOutletIds} initialData={editingProduct ? { id: editingProduct.id, outletId: editingProduct.outlet_id, categoryId: editingProduct.category_id || undefined, name: editingProduct.name, description: editingProduct.description || undefined, productType: editingProduct.product_type as any, basePrice: editingProduct.base_price, requiresBooking: editingProduct.requires_booking, coverUrl: productImageUrl(editingProduct.cover_url) || undefined, tags: editingProduct.tags || undefined, submissionMode: 'review', gallery: editingProduct.media_assets?.map((media) => ({ url: media.url, alt: media.alt_text || undefined })), defaultCapacity: editingProduct.default_capacity || undefined, digitalAssetUrl: editingProduct.digital_asset_url || undefined, digitalAssetName: editingProduct.digital_asset_name || undefined, digitalAssetType: editingProduct.digital_asset_type || undefined, digitalAssetSize: editingProduct.digital_asset_size || undefined } : undefined} onSuccess={() => { setShowForm(false); setEditingProduct(null); setSelectedProduct(null); loadProducts(pagination.page); }} onClose={() => { setShowForm(false); setEditingProduct(null); }} /></div></div>}
    </div>
  );
}
