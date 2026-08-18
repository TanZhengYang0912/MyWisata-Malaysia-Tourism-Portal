'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowRight, CirclePlus, Copy, Eye, Landmark, MapPinned, Pencil, Store, X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import OutletForm from '@/components/vendor/outlet-form';
import CompactFilterBar from '@/components/vendor/compact-filter-bar';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import OutletManagerPanel from '@/components/vendor/outlet-manager-panel';
import OutletPageBuilder from '@/components/vendor/outlet-page-builder';
import OutletShopPreview from '@/components/vendor/outlet-shop-preview';
import { outletLocation, outletShortName, outletIdLabel } from '@/lib/outlet-display';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { getOutletManagerEditorDestination, isOutletManagerShopEditMode, isOutletManagerShopMode } from '@/lib/vendor/outlet-manager-navigation';

interface OutletData { id: string; display_id?: string; name: string; slug: string; city: string | null; state: string | null; postcode?: string | null; country?: string | null; lat: number | null; lng: number | null; phone: string | null; email: string | null; status: string; review_status?: string; address: string | null; coverUrl?: string | null; productsCount: number; welcome_message?: string | null; welcome_enabled?: boolean; manager?: { id: string; fullName: string; email: string } | null; pendingInvitation?: { email: string; expiresAt: string } | null; }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

export default function VendorOutletsPage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showFeedback } = useActionFeedback();
  const [outlets, setOutlets] = useState<OutletData[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({ page: 1, pageSize: 10, total: 0, totalPages: 1 });
  const [filters, setFilters] = useState({ q: '', state: '', status: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOutlet, setEditingOutlet] = useState<OutletData | null>(null);
  const [selectedOutlet, setSelectedOutlet] = useState<OutletData | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');
  const vendorId = user?.activeVendorId;
  const isOwner = user?.roles.includes('vendor_owner') ?? false;
  const isOutletManager = user?.roles.includes('outlet_manager') ?? false;
  const managerMode = searchParams.get('mode');
  const managerShopMode = isOutletManagerShopMode(isOutletManager, managerMode);
  const managerShopEditMode = isOutletManagerShopEditMode(isOutletManager, searchParams.get('edit'));
  const canManageOutlet = isOwner || (user?.roles.includes('outlet_manager') ?? false);
  const [builderOutlet, setBuilderOutlet] = useState<OutletData | null>(null);

  const loadOutlets = useCallback(async (requestedPage = pagination.page) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: '10', q: filters.q, state: filters.state, status: filters.status });
    const response = await fetch(`/api/vendors/${vendorId}/outlets?${params}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message || t('ui.outlets.loadFailed')); setLoading(false); return; }
    setOutlets(payload.data?.items || []); setStates(payload.data?.availableStates || []); setPagination(payload.data?.pagination || { page: requestedPage, pageSize: 10, total: 0, totalPages: 1 }); setLoading(false);
  }, [filters, pagination.page, t, vendorId]);

  useEffect(() => { loadOutlets(1); }, [filters, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (managerShopMode && loading) return <div className="rounded-2xl border border-gray-100 bg-white p-8 text-sm text-gray-500">{t('ui.outlets.loadingShop')}</div>;
  if (managerShopMode && error) return <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>;
  if (managerShopMode && !outlets[0]) return <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6"><h1 className="text-xl font-bold text-gray-950">{t('ui.outlets.shopUnavailable')}</h1><p className="mt-2 text-sm text-gray-600">{t('ui.outlets.noAssignedOutlet')}</p></div>;
  if (managerShopMode && vendorId && outlets[0] && managerShopEditMode) return <OutletPageBuilder vendorId={vendorId} outletId={outlets[0].id} outletName={outletShortName(outlets[0].name)} onClose={() => router.push('/vendor/outlets?mode=shop')} />;
  if (managerShopMode && vendorId && outlets[0]) return <OutletShopPreview vendorId={vendorId} outlet={{ id: outlets[0].id, name: outletShortName(outlets[0].name), address: outlets[0].address, city: outlets[0].city, state: outlets[0].state }} onEdit={() => router.push(getOutletManagerEditorDestination(true))} />;

  async function closeOutlet(outletId: string) {
    if (!vendorId || !confirm(t('ui.outlets.closeConfirm'))) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/outlets/${outletId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || t('ui.outlets.closeFailed'); setError(message); showFeedback('error', message); return; }
      showFeedback('success', t('ui.outlets.closedSuccess'));
      setSelectedOutlet(null); loadOutlets(pagination.page);
    } catch { setError(t('ui.outlets.closeFailed')); showFeedback('error', t('ui.outlets.closeTryAgain')); }
  }

  function clearFilters() { setFilters({ q: '', state: '', status: '' }); }
  async function copyOutletId(outletId: string) { await navigator.clipboard?.writeText(outletId); }
  function toggleSelected(outletId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(outletId) ? current.filter((id) => id !== outletId) : [...current, outletId]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'outlets', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || t('ui.common.batchFailed')); return; }
    setBatchMessage(payload.data?.skipped ? t('ui.outlets.batchSummarySkipped', { updated: payload.data.updated, skipped: payload.data.skipped }) : t('ui.outlets.batchSummary', { count: payload.data?.updated || 0 }));
    setSelectedIds([]); setAllFilteredSelected(false); loadOutlets(1);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><MapPinned size={15} /> {t('ui.outlets.malaysiaNetwork')}</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">{t('ui.outlets.title')}</h1><p className="mt-1 text-sm text-gray-500">{t('ui.outlets.description')}</p></div>{isOwner && <button type="button" onClick={() => { setEditingOutlet(null); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"><CirclePlus size={17} /> {t('ui.outlets.add')}</button>}</header>

      <CompactFilterBar search={filters.q} onSearchChange={(value) => setFilters((current) => ({ ...current, q: value }))} placeholder={t('ui.outlets.searchPlaceholder')} selects={[{ value: filters.state, placeholder: t('ui.outlets.allStates'), options: states.map((state) => ({ value: state, label: state })), onChange: (value) => setFilters((current) => ({ ...current, state: value })) }, { value: filters.status, placeholder: t('ui.outlets.allStatuses'), options: [{ value: 'active', label: t('ui.status.active') }, { value: 'inactive', label: t('ui.status.inactive') }, { value: 'closed', label: t('ui.status.closed') }], onChange: (value) => setFilters((current) => ({ ...current, status: value })) }]} onClear={clearFilters} />
      {isOwner && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(outlets.map((outlet) => outlet.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'activate', label: t('ui.outlets.activateSelected') }, { value: 'close', label: t('ui.outlets.closeSelected') }]} busy={batchBusy} message={batchMessage} />}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}</div> : outlets.length === 0 ? <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center text-gray-400 shadow-sm"><Store className="mx-auto mb-3 opacity-30" size={34} /><p className="text-sm">{t('ui.outlets.noMatches')}</p><button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-primary hover:underline">{t('ui.common.clearFilters')}</button></div> : <>
        <div className="flex items-center justify-between text-xs text-gray-500"><span>{t('ui.outlets.resultCount', { count: pagination.total.toLocaleString() })}</span><span>{t('ui.outlets.perPage', { count: 10 })}</span></div>
        {isOwner && <div className="mb-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={outlets.length > 0 && outlets.every((outlet) => selectedIds.includes(outlet.id))} onChange={(event) => setSelectedIds(event.target.checked ? outlets.map((outlet) => outlet.id) : [])} /> {t('ui.outlets.selectCurrentPage')}</label></div>}<section className="grid gap-3 md:grid-cols-2">{outlets.map((outlet) => <article key={outlet.id} className="group flex min-w-0 gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md">{isOwner && <div className="pt-1"><input type="checkbox" checked={selectedIds.includes(outlet.id)} onChange={() => toggleSelected(outlet.id)} aria-label={t('ui.outlets.selectOutlet', { name: outlet.name })} /></div>}<CompactThumbnail src={outlet.coverUrl} alt={outlet.name} kind="outlet" size="md" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><button type="button" onClick={() => setSelectedOutlet(outlet)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-primary">{outletShortName(outlet.name)}</button><p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500"><MapPinned size={12} /> {outletLocation(outlet.city, outlet.state)}</p><p className="mt-1 font-mono text-[11px] text-gray-400">{outlet.display_id || outletIdLabel(outlet.id)}</p></div><StatusBadge status={outlet.status} /></div><div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3"><span className="text-xs text-gray-500"><strong className="text-gray-800">{outlet.productsCount}</strong> {t('ui.outlets.listings')}</span><div className="flex items-center gap-1"><button type="button" onClick={() => setSelectedOutlet(outlet)} title={t('ui.outlets.viewDetails')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"><Eye size={16} /></button>{isOwner && <button type="button" onClick={() => { setEditingOutlet(outlet); setShowForm(true); }} title={t('ui.outlets.editOutlet')} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"><Pencil size={16} /></button>}</div></div></div></article>)}</section><div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadOutlets(page); }} /></div></>}

      {isOwner && (showForm || editingOutlet) && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><OutletForm vendorId={vendorId} initialData={editingOutlet ? { id: editingOutlet.id, name: editingOutlet.name, address: editingOutlet.address || undefined, city: editingOutlet.city || undefined, state: editingOutlet.state || undefined, postcode: editingOutlet.postcode || undefined, country: editingOutlet.country || undefined, phone: editingOutlet.phone || undefined, email: editingOutlet.email || undefined, lat: editingOutlet.lat || undefined, lng: editingOutlet.lng || undefined, welcomeMessage: editingOutlet.welcome_message || undefined, welcomeEnabled: editingOutlet.welcome_enabled ?? true } : undefined} onSuccess={() => { setShowForm(false); setEditingOutlet(null); loadOutlets(pagination.page); }} onClose={() => { setShowForm(false); setEditingOutlet(null); }} /></div></div>}

      {selectedOutlet && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedOutlet(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">{t('ui.outlets.outletDetails')}</p><h2 className="mt-1 text-xl font-bold text-gray-950">{outletShortName(selectedOutlet.name)}</h2><p className="mt-1 text-xs text-gray-500">{outletLocation(selectedOutlet.city, selectedOutlet.state)}</p></div><button type="button" onClick={() => setSelectedOutlet(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-5"><CompactThumbnail src={selectedOutlet.coverUrl} alt={selectedOutlet.name} kind="outlet" size="md" /></div><div className="mt-5 space-y-3 text-sm"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{t('ui.outlets.outletId')}</p><div className="mt-1 flex items-center justify-between gap-2"><p className="break-all font-mono text-xs font-semibold text-gray-900">{selectedOutlet.display_id || selectedOutlet.id}</p><button type="button" onClick={() => copyOutletId(selectedOutlet.display_id || selectedOutlet.id)} title={t('ui.outlets.copyOutletId')} className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-white hover:text-primary"><Copy size={15} /></button></div></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{t('ui.outlets.location')}</p><p className="mt-1 font-semibold text-gray-900">{outletLocation(selectedOutlet.city, selectedOutlet.state)}</p><p className="mt-1 text-gray-500">{selectedOutlet.address || t('ui.outlets.noAddress')}</p></div>{isOwner && vendorId && <OutletManagerPanel vendorId={vendorId} outletId={selectedOutlet.id} manager={selectedOutlet.manager} pendingInvitation={selectedOutlet.pendingInvitation} onChanged={() => { setSelectedOutlet(null); loadOutlets(pagination.page); }} />}<div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{t('ui.outlets.listings')}</p><p className="mt-1 font-semibold text-gray-900">{selectedOutlet.productsCount}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">{t('ui.outlets.status')}</p><div className="mt-1"><StatusBadge status={selectedOutlet.status} /></div></div></div>{selectedOutlet.phone && <p className="text-gray-600">{t('ui.outlets.phone', { value: selectedOutlet.phone })}</p>}{selectedOutlet.email && <p className="text-gray-600">{t('ui.outlets.email', { value: selectedOutlet.email })}</p>}{selectedOutlet.lat && selectedOutlet.lng && <a className="inline-flex items-center gap-1 font-semibold text-primary hover:underline" href={'https://www.google.com/maps/dir/?api=1&destination=' + selectedOutlet.lat + ',' + selectedOutlet.lng} target="_blank" rel="noreferrer"><Landmark size={15} /> {t('ui.outlets.openDirections')} <ArrowRight size={15} /></a>}</div><div className="mt-7 flex flex-col gap-2"><button type="button" onClick={() => { setBuilderOutlet(selectedOutlet); setSelectedOutlet(null); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-primary/20 bg-secondary px-4 py-2.5 text-sm font-semibold text-primary">{t('ui.outlets.editShopPage')}</button><div className="flex gap-2">{isOwner && <button type="button" onClick={() => { setEditingOutlet(selectedOutlet); setSelectedOutlet(null); setShowForm(true); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><Pencil size={15} /> {t('ui.outlets.editOutlet')}</button>}{isOwner && selectedOutlet.status === 'active' && <button type="button" onClick={() => closeOutlet(selectedOutlet.id)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600">{t('ui.outlets.close')}</button>}</div></div></aside></div>}
      {builderOutlet && vendorId && canManageOutlet && <OutletPageBuilder vendorId={vendorId} outletId={builderOutlet.id} outletName={outletShortName(builderOutlet.name)} onClose={() => setBuilderOutlet(null)} />}
    </div>
  );
}
