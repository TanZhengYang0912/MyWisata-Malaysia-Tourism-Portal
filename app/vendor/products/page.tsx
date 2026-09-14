'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, CirclePlus, Copy, Download, Eye, MapPin, PackageCheck, Pencil, RotateCcw, SlidersHorizontal, Star, Store, Utensils, X } from 'lucide-react';
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
import { useAppDialog } from '@/components/providers/app-dialog';
import { ShareButton } from '@/components/shared/share-button';
import { productImageUrl } from '@/lib/storage/product-image';
import { exportToCsv, type CsvColumn } from '@/lib/export-csv';

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
  ticket_entry_policy?: 'single_entry' | 'group_entry' | 'multi_entry';
  ticket_entry_limit?: number;
  ticket_validity_days?: number | null;
  cover_url?: string | null;
  tags?: string[] | null;
  default_capacity?: number | null;
  digital_asset_url?: string | null;
  digital_asset_name?: string | null;
  digital_asset_type?: string | null;
  digital_asset_size?: number | null;
  media_assets?: { id: string; url: string; alt_text?: string | null; sort_order?: number | null }[];
  outlet?: { id?: string; name?: string; city?: string; state?: string };
  outlets?: Array<{ id: string; display_id?: string; name: string; short_name: string; city?: string | null; state?: string | null }>;
  outlets_count?: number;
  rating?: number;
  reviews?: number;
  is_featured?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  variants?: any[];
  availableStock?: number;
  lowStockThreshold?: number;
}

interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

const TYPE_OPTIONS = [
  { value: 'food', label: 'productForm.types.food' }, { value: 'activity', label: 'productForm.types.activity' }, { value: 'experience', label: 'productForm.types.experience' }, { value: 'product', label: 'productForm.types.product' }, { value: 'digital', label: 'productForm.types.digital' }, { value: 'service', label: 'productForm.types.service' },
];

const SORT_OPTIONS = [
  { value: 'newest', label: 'ui.products.sortNewest' },
  { value: 'rating', label: 'ui.products.sortHighestRated' },
  { value: 'reviews', label: 'ui.products.sortMostReviews' },
  { value: 'outlets', label: 'ui.products.sortMostOutlets' },
  { value: 'price_high', label: 'ui.products.sortPriceHigh' },
  { value: 'price_low', label: 'ui.products.sortPriceLow' },
  { value: 'name', label: 'ui.products.sortName' },
];

function typeLabel(value: string, translate: (key: string) => string) {
  const option = TYPE_OPTIONS.find((item) => item.value === value);
  return option ? translate(option.label) : value;
}
function imageKind(value: string): 'food' | 'experience' | 'product' { return value === 'food' ? 'food' : value === 'activity' || value === 'experience' ? 'experience' : 'product'; }

export default function VendorProductsPage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
  const { confirm } = useAppDialog();
  const supabase = useMemo(() => createClient(), []);
  const [products, setProducts] = useState<ProductData[]>([]);
  const [outlets, setOutlets] = useState<{ id: string; name: string; city?: string | null; state?: string | null }[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ q: '', productType: '', status: '', outletId: '', sort: 'newest', featured: false });
  const [featuredIds, setFeaturedIds] = useState<string[]>([]);
  const [togglingFeaturedId, setTogglingFeaturedId] = useState<string | null>(null);
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
  const [viewingOutletsProduct, setViewingOutletsProduct] = useState<ProductData | null>(null);

  const vendorId = user?.activeVendorId;
  const isOwner = user?.roles.includes('vendor_owner') ?? false;
  const isOutletManager = user?.roles.includes('outlet_manager') ?? false;
  const canManageOutlet = !isOwner && isOutletManager;
  const canViewProductDetails = isOwner || canManageOutlet;
  const scopedOutlet = outlets.find((outlet) => outlet.id === user?.activeOutletIds?.[0]) || outlets[0];
  const tableGridClass = canManageOutlet
    ? 'xl:min-w-[1020px] xl:grid-cols-[32px_minmax(280px,2fr)_minmax(200px,1.2fr)_130px_110px_160px]'
    : 'xl:min-w-[960px] xl:grid-cols-[minmax(280px,2fr)_minmax(200px,1.2fr)_130px_110px_140px]';
  const filterSelects = [
    { value: filters.productType, placeholder: 'ui.products.allTypes', options: TYPE_OPTIONS, onChange: (value: string) => setFilters((current) => ({ ...current, productType: value })) },
    { value: filters.status, placeholder: 'ui.products.allStatuses', options: [{ value: 'active', label: 'ui.status.active' }, { value: 'inactive', label: 'ui.status.inactive' }, { value: 'archived', label: 'ui.status.archived' }], onChange: (value: string) => setFilters((current) => ({ ...current, status: value })) },
    ...(isOwner ? [{ value: filters.outletId, placeholder: 'ui.products.allOutlets', options: outlets.map((outlet) => ({ value: outlet.id, label: `${outletShortName(outlet.name)} · ${outlet.city || outlet.state || 'Malaysia'}` })), onChange: (value: string) => setFilters((current) => ({ ...current, outletId: value })) }] : []),
    { value: filters.sort, placeholder: 'ui.products.sortBy', options: SORT_OPTIONS, onChange: (value: string) => setFilters((current) => ({ ...current, sort: value })) },
  ];

  const loadFeaturedIds = useCallback(async () => {
    if (!vendorId) return;
    try {
      const res = await fetch(`/api/vendors/${vendorId}/featured-products`, { cache: 'no-store' });
      const payload = await res.json();
      if (payload.data?.featuredProductIds) {
        setFeaturedIds(payload.data.featuredProductIds);
      }
    } catch {
      // ignore
    }
  }, [vendorId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadFeaturedIds();
  }, [loadFeaturedIds]);

  async function toggleFeatured(productId: string) {
    if (!vendorId || !isOwner) return;
    const isFeatured = featuredIds.includes(productId);
    if (!isFeatured && featuredIds.length >= 4) {
      showFeedback('error', t('ui.products.featuredLimitReached'));
      return;
    }

    const nextFeatured = isFeatured
      ? featuredIds.filter((id) => id !== productId)
      : [...featuredIds, productId];

    setTogglingFeaturedId(productId);
    setFeaturedIds(nextFeatured);
    setProducts((current) =>
      current.map((p) => (p.id === productId ? { ...p, is_featured: !isFeatured } : p))
    );

    try {
      const res = await fetch(`/api/vendors/${vendorId}/featured-products`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productIds: nextFeatured }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setFeaturedIds(featuredIds);
        setProducts((current) =>
          current.map((p) => (p.id === productId ? { ...p, is_featured: isFeatured } : p))
        );
        showFeedback('error', payload.error?.message || t('ui.common.failed'));
        return;
      }
      showFeedback(
        'success',
        isFeatured
          ? t('ui.products.featuredRemoved')
          : t('ui.products.featuredAdded', { count: nextFeatured.length })
      );
    } catch {
      setFeaturedIds(featuredIds);
      setProducts((current) =>
        current.map((p) => (p.id === productId ? { ...p, is_featured: isFeatured } : p))
      );
      showFeedback('error', t('ui.common.failed'));
    } finally {
      setTogglingFeaturedId(null);
    }
  }

  const loadProducts = useCallback(async (requestedPage = pagination.page) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({
      page: String(requestedPage),
      pageSize: '10',
      q: filters.q,
      product_type: filters.productType,
      status: filters.status,
      outlet_id: filters.outletId,
      sort: filters.sort,
      ...(filters.featured ? { featured: 'true' } : {}),
    });
    const response = await fetch(`/api/vendors/${vendorId}/products?${params}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message || t('ui.products.loadFailed')); setLoading(false); return; }
    setProducts(payload.data?.items || []); setPagination(payload.data?.pagination || { page: requestedPage, pageSize: 10, total: 0, totalPages: 1 }); setLoading(false);
  }, [filters, pagination.page, t, vendorId]);

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
    if (!vendorId || !(await confirm(t('ui.products.archiveConfirm')))) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('ui.products.archiveFailed'); setError(message); showFeedback('error', message); return; }
      showFeedback('success', t('ui.products.archived'));
      setSelectedProduct(null); loadProducts(pagination.page);
    } catch { setError(t('ui.products.archiveFailed')); showFeedback('error', t('ui.products.archiveTryAgain')); }
  }

  async function handleRestore(productId: string) {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/products/${productId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'active' }) });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('ui.products.restoreFailed'); setError(message); showFeedback('error', message); return; }
      showFeedback('success', t('ui.products.restored'));
      setSelectedProduct(null); loadProducts(pagination.page);
    } catch { setError(t('ui.products.restoreFailed')); showFeedback('error', t('ui.products.restoreTryAgain')); }
  }

  async function copyProductId(productId: string) {
    try {
      await navigator.clipboard.writeText(productId);
      setCopiedProductId(productId);
      window.setTimeout(() => setCopiedProductId((current) => current === productId ? null : current), 1600);
    } catch {
      setError(t('ui.products.copyFailed'));
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
    if (!response.ok) { setError(payload.error?.message || t('ui.common.batchFailed')); return; }
    setBatchMessage(payload.data?.skipped
      ? t('ui.products.batchSummarySkipped', { updated: payload.data.updated, skipped: payload.data.skipped })
      : t('ui.products.batchSummary', { count: payload.data?.updated || 0 }));
    setSelectedIds([]); setAllFilteredSelected(false); loadProducts(1);
  }

  const stats = useMemo(() => {
    const active = products.filter((p) => p.status === 'active').length;
    const lowStockOrBooking = products.filter(
      (p) => p.requires_booking || (p.availableStock !== undefined && p.availableStock <= (p.lowStockThreshold ?? 5))
    ).length;
    const archived = products.filter((p) => p.status === 'archived').length;
    return {
      active,
      lowStockOrBooking,
      archived,
      outletCount: outlets.length,
    };
  }, [products, outlets]);

  function handleExportProducts() {
    const columns: CsvColumn<ProductData>[] = [
      { header: 'Product ID', accessor: (p) => p.display_id || p.id },
      { header: 'Name', accessor: (p) => p.name },
      { header: 'Type', accessor: (p) => p.product_type },
      { header: 'Outlet', accessor: (p) => p.outlet?.name || '' },
      { header: 'Base Price (RM)', accessor: (p) => Number(p.base_price).toFixed(2) },
      { header: 'Stock / Booking', accessor: (p) => p.requires_booking ? 'Booking' : String(p.availableStock ?? 0) },
      { header: 'Status', accessor: (p) => p.status },
    ];
    exportToCsv(`products-${new Date().toISOString().slice(0, 10)}`, columns, products);
  }

  function clearFilters() { setFilters({ q: '', productType: '', status: '', outletId: '', sort: 'newest', featured: false }); }

  return (
    <div className="space-y-5">
      {selectedProduct ? <ProductDetailsPage
        product={selectedProduct}
        vendorId={vendorId || ''}
        canManageOutlet={canManageOutlet}
        canViewDetails={canViewProductDetails}
        productTypeLabel={typeLabel(selectedProduct.product_type, t)}
        productImageKind={imageKind(selectedProduct.product_type)}
        outletFallback={scopedOutlet}
        outlets={selectedProduct.outlets}
        productOptions={products.filter((product) => product.id !== selectedProduct.id && product.outlet_id === selectedProduct.outlet_id).map((product) => ({ id: product.id, name: product.name, base_price: Number(product.base_price) }))}
        copiedProductId={copiedProductId}
        onCopyProductId={copyProductId}
        onBack={() => setSelectedProduct(null)}
        onEdit={() => { setEditingProduct(selectedProduct); setShowForm(true); }}
        onUpdate={() => { setSelectedProduct(null); loadProducts(pagination.page); }}
      /> : <>
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <Utensils size={15} /> {t('ui.products.catalogueManagement')}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">{t('ui.products.title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('ui.products.description')}</p>
          {isOwner && (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs text-amber-900">
              <span className="font-semibold uppercase tracking-[0.1em] text-amber-800 shrink-0">{t('ui.products.catalogueManagement')}</span>
              <span className="text-amber-400">·</span>
              <span className="text-amber-900">{t('ui.products.vendorReadOnlyNotice')}</span>
            </div>
          )}
          {!isOwner && (
            <div className="mt-3 inline-flex max-w-full items-center gap-2 rounded-xl border border-primary/10 bg-secondary px-3 py-2 text-xs text-primary">
              <span className="font-semibold uppercase tracking-[0.12em] text-primary">{t('ui.products.assignedOutlet')}</span>
              <span className="truncate font-semibold">{outletShortName(user?.activeOutletName || scopedOutlet?.name)}</span>
              <span className="shrink-0 font-mono text-[10px] text-primary">{outletIdLabel(user?.activeOutletIds?.[0] || scopedOutlet?.id)}</span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportProducts}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50"
          >
            <Download size={16} /> {t('ui.common.exportCsv')}
          </button>
          {canManageOutlet && (
            <button
              type="button"
              onClick={() => { setEditingProduct(null); setShowForm(true); }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
            >
              <CirclePlus size={17} /> {t('ui.products.addListing')}
            </button>
          )}
        </div>
      </header>

      {/* Top 4 KPI Summary Cards */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4">
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t('ui.status.active')}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.active}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t('ui.products.attentionNeeded')}
          </p>
          <p className="mt-1 text-2xl font-bold text-amber-600">{stats.lowStockOrBooking}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t('ui.status.archived')}
          </p>
          <p className="mt-1 text-2xl font-bold text-gray-900">{stats.archived}</p>
        </div>
        <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
            {t('ui.products.outletsManaged')}
          </p>
          <p className="mt-1 text-2xl font-bold text-primary">{stats.outletCount}</p>
        </div>
      </section>

      {/* Quick Status & Featured Tabs */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-gray-200 pb-2">
        {[
          { key: 'all', label: t('ui.products.allStatuses'), active: !filters.status && !filters.featured, onClick: () => setFilters((curr) => ({ ...curr, status: '', featured: false })) },
          ...(isOwner ? [{
            key: 'featured',
            label: t('ui.products.featuredTab', { count: featuredIds.length }),
            active: filters.featured,
            onClick: () => setFilters((curr) => ({ ...curr, status: '', featured: true })),
          }] : []),
          { key: 'active', label: t('ui.status.active'), active: filters.status === 'active' && !filters.featured, onClick: () => setFilters((curr) => ({ ...curr, status: 'active', featured: false })) },
          { key: 'archived', label: t('ui.status.archived'), active: filters.status === 'archived' && !filters.featured, onClick: () => setFilters((curr) => ({ ...curr, status: 'archived', featured: false })) },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={tab.onClick}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              tab.active
                ? 'bg-primary text-white shadow-sm'
                : 'text-gray-600 hover:bg-gray-100'
            }`}
          >
            {tab.key === 'featured' && <Star size={12} className={tab.active ? 'fill-white text-white' : 'fill-amber-500 text-amber-500'} />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Featured Selection Banner for Vendor Owner */}
      {isOwner && (
        <div className="flex flex-col gap-3 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-orange-50/40 to-amber-50/70 p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-500 text-white shadow-sm">
              <Star size={20} className="fill-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-gray-900">{t('ui.products.featuredBannerTitle', { count: featuredIds.length })}</h3>
                <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {featuredIds.length} / 4
                </span>
              </div>
              <p className="mt-0.5 text-xs text-gray-600">{t('ui.products.featuredBannerDesc')}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFilters((curr) => ({ ...curr, featured: !curr.featured, status: '' }))}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                filters.featured
                  ? 'bg-amber-600 text-white shadow-sm hover:bg-amber-700'
                  : 'border border-amber-300 bg-white text-amber-900 hover:bg-amber-50'
              }`}
            >
              {filters.featured ? t('ui.products.allStatuses') : t('ui.products.featuredTab', { count: featuredIds.length })}
            </button>
          </div>
        </div>
      )}

      <CompactFilterBar search={filters.q} onSearchChange={(value) => setFilters((current) => ({ ...current, q: value }))} placeholder={t('ui.products.searchPlaceholder')} selects={filterSelects} onClear={clearFilters} />

      {canManageOutlet && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(products.map((product) => product.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'archive', label: t('ui.products.archiveSelected') }, { value: 'restore', label: t('ui.products.restoreSelected') }]} busy={batchBusy} message={batchMessage} />}
      <div className="flex items-center justify-between text-xs text-gray-500"><span>{t('ui.products.resultCount', { count: pagination.total.toLocaleString() })}</span><span className="inline-flex items-center gap-1"><SlidersHorizontal size={14} /> {t('ui.products.perPage', { count: 10 })}</span></div>
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div> : products.length === 0 ? <div className="px-6 py-16 text-center text-gray-400"><PackageCheck className="mx-auto mb-3 opacity-30" size={34} /><p className="text-sm">{t('ui.products.noMatches')}</p><button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-primary hover:underline">{t('ui.common.clearFilters')}</button></div> : <>
          {canManageOutlet && <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={products.length > 0 && products.every((product) => selectedIds.includes(product.id))} onChange={(event) => setSelectedIds(event.target.checked ? products.map((product) => product.id) : [])} /> {t('ui.products.selectCurrentPage')}</label></div>}
          <div className="overflow-x-auto">
            <div className={`hidden ${tableGridClass} gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 xl:grid`}>
              {canManageOutlet && <span></span>}
              <span>{t('ui.products.listingColumn')}</span>
              <span>{isOwner ? t('ui.products.outletColumn') : t('ui.products.assignedOutlet')}</span>
              <span>{t('ui.products.priceColumn')}</span>
              <span>{t('ui.products.statusColumn')}</span>
              <span className="text-right">{t('ui.products.actionColumn')}</span>
            </div>
            <div className="divide-y divide-gray-100">
              {products.map((product) => (
                <article key={product.id} className={`grid gap-3 px-4 py-4 transition hover:bg-secondary/30 ${tableGridClass} xl:items-center xl:gap-4 xl:px-5`}>
                  {canManageOutlet && (
                    <div>
                      <input type="checkbox" checked={selectedIds.includes(product.id)} onChange={() => toggleSelected(product.id)} aria-label={t('ui.products.selectListing', { name: product.name })} />
                    </div>
                  )}

                  {/* LISTING column: Thumbnail + Name + Type/Booking + Ratings + Product ID with copy button */}
                  <div className="flex min-w-0 items-center gap-3">
                    <CompactThumbnail src={productImageUrl(product.cover_url)} alt={product.name} kind={imageKind(product.product_type)} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button type="button" onClick={() => setSelectedProduct(product)} className="text-left font-semibold leading-5 text-gray-900 hover:text-primary line-clamp-2">
                          {product.name}
                        </button>
                        {featuredIds.includes(product.id) && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                            <Star size={10} className="fill-amber-500 text-amber-500" />
                            {t('ui.products.featuredBadge')}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 flex-wrap text-xs text-gray-500">
                        <span className="truncate">
                          {typeLabel(product.product_type, t)} {product.requires_booking ? t('ui.products.bookingRequired') : ''}
                        </span>
                        {product.rating !== undefined && product.rating > 0 ? (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900 border border-amber-200/60">
                            <Star size={11} className="fill-amber-500 text-amber-500" />
                            {product.rating.toFixed(1)}
                            <span className="text-[10px] text-gray-500">({product.reviews})</span>
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">· {t('ui.products.noReviewsYet')}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          copyProductId(product.display_id || product.id);
                        }}
                        title={t('ui.products.copyProductId')}
                        className="mt-0.5 group/id inline-flex items-center gap-1 font-mono text-[10px] text-gray-400 hover:text-primary transition-colors focus:outline-none"
                      >
                        <span>{product.display_id || product.id}</span>
                        {copiedProductId === (product.display_id || product.id) ? (
                          <span className="font-semibold text-primary">{t('ui.products.copied')}</span>
                        ) : (
                          <Copy size={10} className="opacity-0 group-hover/id:opacity-100 transition-opacity" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* OUTLET column: Outlet name, city/state, outlet ID or multi-outlet coverage */}
                  <div className="text-xs text-gray-500">
                    {product.outlets && product.outlets.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setViewingOutletsProduct(product)}
                        className="group/outlets text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-xl p-1.5 -m-1.5 transition hover:bg-emerald-50/70 w-full max-w-[230px]"
                        title={t('ui.products.clickToViewAllOutlets', { count: product.outlets.length })}
                      >
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800 text-[11px] group-hover/outlets:border-emerald-300 group-hover/outlets:bg-emerald-100 transition-colors">
                            <Store size={11} className="text-emerald-700" />
                            {product.outlets.length === outlets.length && outlets.length > 1
                              ? t('ui.products.allOutletsAvailable', { count: product.outlets.length })
                              : t('ui.products.multiOutletAvailable', { count: product.outlets.length })}
                          </span>
                        </div>
                        <span className="mt-1 block font-medium text-gray-700 truncate group-hover/outlets:text-primary transition-colors" title={product.outlets.map((o) => o.short_name || o.name).join(', ')}>
                          {product.outlets.map((o) => o.short_name || o.name).join(' · ')}
                        </span>
                        <span className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-700 underline underline-offset-2 decoration-emerald-300 group-hover/outlets:text-emerald-900">
                          {t('ui.products.clickToViewAllOutlets', { count: product.outlets.length })}
                        </span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setViewingOutletsProduct(product)}
                        className="group/outlets text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/20 rounded-xl p-1.5 -m-1.5 transition hover:bg-gray-50 w-full max-w-[230px]"
                      >
                        <span className="block truncate font-medium text-gray-700 group-hover/outlets:text-primary transition-colors">{outletShortName(product.outlet?.name || user?.activeOutletName)}</span>
                        <span className="mt-0.5 block truncate text-[11px] text-gray-500">{outletLocation(product.outlet?.city, product.outlet?.state)}</span>
                        <span className="mt-0.5 block font-mono text-[10px] text-gray-400">{outletIdLabel(product.outlet?.id || product.outlet_id || user?.activeOutletIds?.[0])}</span>
                      </button>
                    )}
                  </div>

                  {/* TOTAL / PRICE column: Price + Stock / Time slots */}
                  <div className="text-xs">
                    <span className="block text-sm font-semibold text-gray-900">
                      {toRM(Number(product.base_price))}
                    </span>
                    <span className={`mt-0.5 block text-[11px] font-semibold ${product.requires_booking ? 'text-gray-400' : product.availableStock === 0 ? 'text-red-600' : product.availableStock !== undefined && product.availableStock <= (product.lowStockThreshold ?? 5) ? 'text-amber-700' : 'text-primary'}`}>
                      {product.requires_booking ? t('ui.products.timeSlots') : product.availableStock === 0 ? t('ui.products.outOfStock') : t('ui.products.stockCount', { count: product.availableStock, low: product.availableStock !== undefined && product.availableStock <= (product.lowStockThreshold ?? 5) ? t('ui.products.lowStockSuffix') : '' })}
                    </span>
                  </div>

                  {/* STATUS column: StatusBadge */}
                  <div>
                    <StatusBadge status={product.status} />
                  </div>

                  {/* ACTION column: Star toggle (featured on storefront), View details, Share, Edit, Archive/Restore */}
                  <div className="flex items-center justify-end gap-1">
                    {isOwner && (
                      <button
                        type="button"
                        disabled={togglingFeaturedId === product.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void toggleFeatured(product.id);
                        }}
                        title={
                          featuredIds.includes(product.id)
                            ? t('ui.products.removeFromFeatured')
                            : t('ui.products.addToFeatured')
                        }
                        className={`rounded-lg p-2 transition ${
                          featuredIds.includes(product.id)
                            ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                            : 'text-gray-400 hover:bg-amber-50 hover:text-amber-700'
                        }`}
                      >
                        <Star size={16} className={featuredIds.includes(product.id) ? 'fill-amber-500 text-amber-500' : ''} />
                      </button>
                    )}
                    <button type="button" onClick={() => setSelectedProduct(product)} title={t('ui.products.viewDetails')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary transition">
                      <Eye size={16} />
                    </button>
                    <ShareButton compact shareType="product" contentId={product.id} title={product.name} plainOnly />
                    {canManageOutlet && (
                      <>
                        <button type="button" onClick={() => { setEditingProduct(product); setShowForm(true); }} title={t('ui.products.editListing')} className="rounded-lg p-2 text-gray-500 hover:bg-secondary hover:text-primary transition">
                          <Pencil size={16} />
                        </button>
                        {product.status === 'archived' ? (
                          <button type="button" onClick={() => handleRestore(product.id)} title={t('ui.products.restoreListing')} className="rounded-lg p-2 text-primary hover:bg-secondary transition">
                            <RotateCcw size={16} />
                          </button>
                        ) : (
                          <button type="button" onClick={() => handleDelete(product.id)} title={t('ui.products.archiveListing')} className="rounded-lg p-2 text-red-500 hover:bg-red-50 transition">
                            <Archive size={16} />
                          </button>
                        )}
                      </>
                    )}
                  </div>
                </article>
              ))}
            </div>
          </div>
          <PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadProducts(page); }} />
        </>}
      </section>
      </>}

      {/* Covered Outlets Modal */}
      {viewingOutletsProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/40 p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black/5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-6 py-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700">
                  <Store size={18} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-gray-950">
                    {t('ui.products.coveredOutletsTitle', {
                      count: viewingOutletsProduct.outlets?.length || 1,
                    })}
                  </h3>
                  <p className="text-xs text-gray-500 line-clamp-1">{viewingOutletsProduct.name}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingOutletsProduct(null)}
                aria-label={t('ui.products.closeOutletsModal')}
                className="rounded-xl p-1.5 text-gray-400 hover:bg-gray-200/60 hover:text-gray-700 transition"
              >
                <X size={18} />
              </button>
            </div>

            <div className="max-h-[60vh] overflow-y-auto p-6 space-y-3">
              <p className="text-xs text-gray-600">
                {t('ui.products.coveredOutletsDesc')}
              </p>

              <div className="space-y-2">
                {(() => {
                  const displayOutlets = viewingOutletsProduct.outlets && viewingOutletsProduct.outlets.length > 0
                    ? viewingOutletsProduct.outlets
                    : viewingOutletsProduct.outlet
                    ? [{
                        id: viewingOutletsProduct.outlet.id || viewingOutletsProduct.outlet_id,
                        name: viewingOutletsProduct.outlet.name || '',
                        short_name: viewingOutletsProduct.outlet.name || '',
                        city: viewingOutletsProduct.outlet.city || null,
                        state: viewingOutletsProduct.outlet.state || null,
                      }]
                    : outlets.filter((o) => o.id === viewingOutletsProduct.outlet_id);

                  if (displayOutlets.length === 0) {
                    return (
                      <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-center text-xs text-gray-500">
                        {outletShortName(viewingOutletsProduct.outlet?.name || user?.activeOutletName)}
                      </div>
                    );
                  }

                  return displayOutlets.map((outlet, idx) => (
                    <div
                      key={outlet.id || idx}
                      className="flex items-start justify-between gap-3 rounded-xl border border-gray-200/80 bg-white p-3.5 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/30 transition"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-gray-900">
                            {outlet.name}
                          </span>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-xs text-gray-500">
                          <MapPin size={13} className="text-gray-400 shrink-0" />
                          <span>{outletLocation(outlet.city ?? undefined, outlet.state ?? undefined)}</span>
                        </div>
                      </div>
                      <span className="shrink-0 font-mono text-xs font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md">
                        {outletIdLabel(outlet.id)}
                      </span>
                    </div>
                  ));
                })()}
              </div>
            </div>

            <div className="border-t border-gray-100 bg-gray-50/50 px-6 py-3.5 flex justify-end">
              <button
                type="button"
                onClick={() => setViewingOutletsProduct(null)}
                className="rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-gray-800 transition"
              >
                {t('ui.products.closeOutletsModal')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      {canManageOutlet && (showForm || editingProduct) && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><ProductForm vendorId={vendorId} outletIds={isOwner ? undefined : user?.activeOutletIds} initialData={editingProduct ? { id: editingProduct.id, outletId: editingProduct.outlet_id, categoryId: editingProduct.category_id || undefined, name: editingProduct.name, description: editingProduct.description || undefined, productType: editingProduct.product_type as any, basePrice: editingProduct.base_price, requiresBooking: editingProduct.requires_booking, ticketEntryPolicy: editingProduct.ticket_entry_policy ?? 'single_entry', ticketEntryLimit: editingProduct.ticket_entry_limit ?? 1, ticketValidityDays: editingProduct.ticket_validity_days ?? undefined, coverUrl: productImageUrl(editingProduct.cover_url) || undefined, tags: editingProduct.tags || undefined, submissionMode: 'review', gallery: editingProduct.media_assets?.map((media) => ({ url: media.url, alt: media.alt_text || undefined })), defaultCapacity: editingProduct.default_capacity || undefined, digitalAssetUrl: editingProduct.digital_asset_url || undefined, digitalAssetName: editingProduct.digital_asset_name || undefined, digitalAssetType: editingProduct.digital_asset_type || undefined, digitalAssetSize: editingProduct.digital_asset_size || undefined } : undefined} onSuccess={() => { setShowForm(false); setEditingProduct(null); setSelectedProduct(null); loadProducts(pagination.page); }} onClose={() => { setShowForm(false); setEditingProduct(null); }} /></div></div>}
    </div>
  );
}
