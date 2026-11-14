'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  CirclePlus,
  Copy,
  Eye,
  MapPinned,
  Navigation,
  Pencil,
  Store,
} from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import OutletForm from '@/components/vendor/outlet-form';
import { VendorListFilters } from '@/components/vendor/vendor-list-filters';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import { Pagination as SharedPagination } from '@/components/shared/pagination';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import OutletManagerPanel from '@/components/vendor/outlet-manager-panel';
import OutletPageBuilder from '@/components/vendor/outlet-page-builder';
import { HotelProfileEditor } from '@/components/vendor/hotel-profile-editor';
import OutletShopPreview from '@/components/vendor/outlet-shop-preview';
import CenteredDetailModal from '@/components/ui/centered-detail-modal';
import OutletActionGroup from '@/components/vendor/outlet-action-group';
import { VendorMobileRecordCard } from '@/components/vendor/mobile-record-card';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';
import {
  outletLocation,
  outletShortName,
  outletIdLabel,
} from '@/lib/outlet-display';
import { useActionFeedback } from '@/components/providers/action-feedback';
import {
  getOutletManagerEditorDestination,
  isOutletManagerShopEditMode,
  isOutletManagerShopMode,
} from '@/lib/vendor/outlet-manager-navigation';

interface OutletData {
  id: string;
  display_id?: string;
  name: string;
  slug: string;
  city: string | null;
  state: string | null;
  postcode?: string | null;
  country?: string | null;
  lat: number | null;
  lng: number | null;
  phone: string | null;
  email: string | null;
  status: string;
  review_status?: string;
  address: string | null;
  coverUrl?: string | null;
  productsCount: number;
  welcome_message?: string | null;
  welcome_enabled?: boolean;
  food_service_modes?: ("dine_in" | "takeaway")[] | null;
  badge_slugs?: string[] | null;
  accommodation_type_slugs?: string[] | null;
  isAccommodationOutlet?: boolean;
  operating_hours?: unknown;
  manager?: { id: string; fullName: string; email: string } | null;
  pendingInvitation?: { email: string; expiresAt: string } | null;
}
interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export default function VendorOutletsPage() {
  const { t } = useTranslation('vendor');
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showFeedback } = useActionFeedback();
  const [outlets, setOutlets] = useState<OutletData[]>([]);
  const [states, setStates] = useState<string[]>([]);
  const [pagination, setPagination] = useState<Pagination>({
    page: 1,
    pageSize: 10,
    total: 0,
    totalPages: 1,
  });
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
  const [pendingCloseOutlet, setPendingCloseOutlet] =
    useState<OutletData | null>(null);
  const [closeBusy, setCloseBusy] = useState(false);
  const [pendingReopenOutlet, setPendingReopenOutlet] =
    useState<OutletData | null>(null);
  const [reopenBusy, setReopenBusy] = useState(false);
  const [formDirty, setFormDirty] = useState(false);
  const [confirmDiscardOpen, setConfirmDiscardOpen] = useState(false);
  const vendorId = user?.activeVendorId;
  const isOwner = user?.roles.includes('vendor_owner') ?? false;
  const isOutletManager = user?.roles.includes('outlet_manager') ?? false;
  const managerMode = searchParams.get('mode');
  const managerShopMode = isOutletManagerShopMode(isOutletManager, managerMode);
  const managerShopEditMode = isOutletManagerShopEditMode(
    isOutletManager,
    searchParams.get('edit'),
  );
  const [builderOutlet, setBuilderOutlet] = useState<OutletData | null>(null);

  const loadOutlets = useCallback(
    async (requestedPage = pagination.page) => {
      if (!vendorId) return;
      setLoading(true);
      setError('');
      const params = new URLSearchParams({
        page: String(requestedPage),
        pageSize: '10',
        q: filters.q,
        state: filters.state,
        status: filters.status,
      });
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets?${params}`,
        { cache: 'no-store' },
      );
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error?.message || t('ui.outlets.loadFailed'));
        setLoading(false);
        return;
      }
      setOutlets(payload.data?.items || []);
      setStates(payload.data?.availableStates || []);
      setPagination(
        payload.data?.pagination || {
          page: requestedPage,
          pageSize: 10,
          total: 0,
          totalPages: 1,
        },
      );
      setLoading(false);
    },
    [filters, pagination.page, t, vendorId],
  );

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadOutlets(1);
  }, [filters, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (managerShopMode && loading)
    return (
      <div className="rounded-2xl border border-gray-100 dark:border-border bg-white dark:bg-card p-8 text-sm text-gray-500 dark:text-muted-foreground">
        {t('ui.outlets.loadingShop')}
      </div>
    );
  if (managerShopMode && error)
    return (
      <div className="rounded-2xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
        {error}
      </div>
    );
  if (managerShopMode && !outlets[0])
    return (
      <div className="rounded-2xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 p-6">
        <h1 className="text-xl font-bold text-gray-950 dark:text-foreground">
          {t('ui.outlets.shopUnavailable')}
        </h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-muted-foreground">
          {t('ui.outlets.noAssignedOutlet')}
        </p>
      </div>
    );
  if (managerShopMode && vendorId && outlets[0] && managerShopEditMode)
    return (
      <HotelProfileEditor vendorId={vendorId} outletId={outlets[0].id} outletName={outletShortName(outlets[0].name)} onClose={() => router.push('/vendor/outlets?mode=shop')}>
        {(builderOnClose) => <OutletPageBuilder
          vendorId={vendorId}
          outletId={outlets[0].id}
          outletName={outletShortName(outlets[0].name)}
          outletAddress={outlets[0].address}
          outletCity={outlets[0].city}
          outletState={outlets[0].state}
          outletPhone={outlets[0].phone}
          onClose={builderOnClose}
        />}
      </HotelProfileEditor>
    );
  if (managerShopMode && vendorId && outlets[0])
    return (
      <OutletShopPreview
        vendorId={vendorId}
        outlet={{
          id: outlets[0].id,
          name: outletShortName(outlets[0].name),
          address: outlets[0].address,
          city: outlets[0].city,
          state: outlets[0].state,
          operating_hours: outlets[0].operating_hours,
          isAccommodationOutlet: outlets[0].isAccommodationOutlet,
        }}
        onEdit={() => router.push(getOutletManagerEditorDestination(true))}
      />
    );

  async function closeOutlet() {
    if (!vendorId || !pendingCloseOutlet) return;
    setCloseBusy(true);
    try {
      const response = await fetch(
        `/api/vendors/${vendorId}/outlets/${pendingCloseOutlet.id}`,
        { method: 'DELETE' },
      );
      if (!response.ok) {
        const payload = await response.json();
        const message = payload.error?.message || t('ui.outlets.closeFailed');
        setError(message);
        showFeedback('error', message);
        return;
      }
      showFeedback('success', t('ui.outlets.closedSuccess'));
      setSelectedOutlet(null);
      setPendingCloseOutlet(null);
      loadOutlets(pagination.page);
    } catch {
      setError(t('ui.outlets.closeFailed'));
      showFeedback('error', t('ui.outlets.closeTryAgain'));
    } finally {
      setCloseBusy(false);
    }
  }

  async function reopenOutlet() {
    if (!vendorId || !pendingReopenOutlet || reopenBusy) return;
    setReopenBusy(true);
    try {
      // Reuses the owner-only, vendor-scoped batch "activate" transition.
      const response = await fetch(`/api/vendors/${vendorId}/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: 'outlets', action: 'activate', ids: [pendingReopenOutlet.id], selectAllFiltered: false, filters: {} }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.data?.updated) {
        const message = payload.error?.message || t('ui.outlets.reopenFailed');
        setError(message);
        showFeedback('error', message);
        return;
      }
      showFeedback('success', t('ui.outlets.reopened'));
      setSelectedOutlet(null);
      setPendingReopenOutlet(null);
      loadOutlets(pagination.page);
    } catch {
      setError(t('ui.outlets.reopenFailed'));
      showFeedback('error', t('ui.outlets.reopenFailed'));
    } finally {
      setReopenBusy(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setEditingOutlet(null);
    setFormDirty(false);
    setConfirmDiscardOpen(false);
  }

  function requestCloseForm() {
    if (formDirty) setConfirmDiscardOpen(true);
    else closeForm();
  }

  function openDetails(outlet: OutletData) {
    setSelectedOutlet(outlet);
  }

  function openEdit(outlet: OutletData | null) {
    setFormDirty(false);
    setEditingOutlet(outlet);
    setShowForm(true);
  }

  function statusSummary(outlet: OutletData) {
    if (outlet.status === 'active') return t('ui.outlets.statusSummaryActive');
    if (outlet.status === 'closed') return t('ui.outlets.statusSummaryClosed');
    if (outlet.review_status === 'pending_review') return t('ui.outlets.statusSummaryReview');
    return t('ui.outlets.statusSummaryInactive');
  }

  function statusLabel(status: string) {
    return t(`ui.status.${status}`, status.replace(/_/g, ' '));
  }

  function managerSummary(outlet: OutletData) {
    if (outlet.manager) return <span className="truncate text-foreground">{outlet.manager.fullName}</span>;
    if (outlet.pendingInvitation) return <span className="truncate text-muted-foreground">{t('ui.outlets.invitePending', { email: outlet.pendingInvitation.email })}</span>;
    return <span className="text-muted-foreground">{t('ui.outlets.noManager')}</span>;
  }

  function listingSummary(outlet: OutletData) {
    return outlet.productsCount > 0 ? (
      <span className="tabular-nums text-foreground">{outlet.productsCount} <span className="text-muted-foreground">{t('ui.outlets.listings')}</span></span>
    ) : (
      <span className="text-muted-foreground">{t('ui.outlets.noListings')}</span>
    );
  }

  function rowActions(outlet: OutletData) {
    return [
      {
        id: 'view-details',
        label: t('ui.outlets.viewDetails'),
        onSelect: () => openDetails(outlet),
        variant: 'secondary' as const,
        icon: Eye,
        ariaLabel: t('ui.outlets.viewDetailsFor', { name: outletShortName(outlet.name) }),
      },
      ...(isOwner
        ? [{
            id: 'edit-outlet',
            label: t('ui.outlets.editOutlet'),
            onSelect: () => openEdit(outlet),
            variant: 'tertiary' as const,
            icon: Pencil,
            ariaLabel: t('ui.outlets.editOutletNamed', { name: outletShortName(outlet.name) }),
          }]
        : []),
    ];
  }

  function clearFilters() {
    setFilters({ q: '', state: '', status: '' });
  }
  async function copyOutletId(outletId: string) {
    await navigator.clipboard?.writeText(outletId);
  }
  function toggleSelected(outletId: string) {
    setAllFilteredSelected(false);
    setSelectedIds((current) =>
      current.includes(outletId)
        ? current.filter((id) => id !== outletId)
        : [...current, outletId],
    );
  }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true);
    setBatchMessage('');
    const response = await fetch('/api/vendors/' + vendorId + '/batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        entity: 'outlets',
        action,
        ids: selectedIds,
        selectAllFiltered: allFilteredSelected,
        filters,
      }),
    });
    const payload = await response.json();
    setBatchBusy(false);
    if (!response.ok) {
      setError(payload.error?.message || t('ui.common.batchFailed'));
      return;
    }
    setBatchMessage(
      payload.data?.skipped
        ? t('ui.outlets.batchSummarySkipped', {
            updated: payload.data.updated,
            skipped: payload.data.skipped,
          })
        : t('ui.outlets.batchSummary', { count: payload.data?.updated || 0 }),
    );
    setSelectedIds([]);
    setAllFilteredSelected(false);
    loadOutlets(1);
  }

  return (
    <div className="space-y-5">
      <VendorPageHeader
        eyebrow={<><MapPinned size={15} aria-hidden="true" /> {t('ui.outlets.malaysiaNetwork')}</>}
        title={t('ui.outlets.title')}
        actions={isOwner && (
          <button
            type="button"
            onClick={() => openEdit(null)}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            <CirclePlus size={17} aria-hidden="true" /> {t('ui.outlets.add')}
          </button>
        )}
      />

      <VendorListFilters
        query={filters.q}
        onQueryChange={(value) => setFilters((current) => ({ ...current, q: value }))}
        placeholder={t('ui.outlets.searchPlaceholder')}
        chips={[
          ...(filters.state ? [{ key: 'state', label: filters.state, onRemove: () => setFilters((current) => ({ ...current, state: '' })) }] : []),
          ...(filters.status ? [{ key: 'status', label: t(`ui.status.${filters.status}`), onRemove: () => setFilters((current) => ({ ...current, status: '' })) }] : []),
        ]}
        onClearAll={clearFilters}
        drawerTitle={t('ui.listFilters.drawerTitle')}
      >
        <label className="block space-y-2 text-sm font-semibold text-foreground">
          <span>{t('ui.outlets.allStates')}</span>
          <select value={filters.state} onChange={(event) => setFilters((current) => ({ ...current, state: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
            <option value="">{t('ui.outlets.allStates')}</option>
            {states.map((state) => <option key={state} value={state}>{state}</option>)}
          </select>
        </label>
        <label className="block space-y-2 text-sm font-semibold text-foreground">
          <span>{t('ui.outlets.allStatuses')}</span>
          <select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-11 w-full rounded-xl border border-border bg-background px-3 text-sm font-normal outline-none focus:border-primary focus:ring-2 focus:ring-primary/15">
            <option value="">{t('ui.outlets.allStatuses')}</option>
            {['active', 'inactive', 'closed'].map((status) => <option key={status} value={status}>{t(`ui.status.${status}`)}</option>)}
          </select>
        </label>
      </VendorListFilters>
      {isOwner && (
        <BatchActionBar
          selectedCount={selectedIds.length}
          total={pagination.total}
          allFilteredSelected={allFilteredSelected}
          onSelectAllFiltered={() => {
            setAllFilteredSelected(true);
            setSelectedIds(outlets.map((outlet) => outlet.id));
          }}
          onClear={() => {
            setSelectedIds([]);
            setAllFilteredSelected(false);
            setBatchMessage('');
          }}
          onApply={applyBatch}
          actions={[
            { value: 'activate', label: t('ui.outlets.activateSelected') },
            { value: 'close', label: t('ui.outlets.closeSelected') },
          ]}
          busy={batchBusy}
          message={batchMessage}
        />
      )}
      {error && (
        <div role="alert" className="rounded-xl border border-red-200 dark:border-red-500/30 bg-red-50 dark:bg-red-500/10 px-4 py-3 text-sm text-red-700 dark:text-red-200">
          {error}
        </div>
      )}
      {loading ? (
        <div role="status" aria-live="polite" aria-label={t('ui.outlets.loading', 'Loading outlets')} className="overflow-hidden rounded-2xl border border-border bg-card">
          {Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="flex items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="h-12 w-12 shrink-0 rounded-xl bg-muted" />
              <div className="flex-1 space-y-2">
                <div className="h-3.5 w-40 rounded bg-muted" />
                <div className="h-3 w-24 rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : outlets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card px-6 py-16 text-center text-muted-foreground">
          <Store className="mx-auto mb-3 opacity-30" size={34} aria-hidden="true" />
          <p className="text-sm">{t('ui.outlets.noMatches')}</p>
          <button
            type="button"
            onClick={clearFilters}
            className="mt-3 text-sm font-semibold text-primary hover:underline"
          >
            {t('ui.common.clearFilters')}
          </button>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
            <span className="tabular-nums">
              {t('ui.outlets.resultCount', {
                count: pagination.total.toLocaleString(),
              })}
            </span>
            {isOwner && (
              <label className="inline-flex min-h-10 items-center gap-2 font-medium text-foreground">
                <input
                  type="checkbox"
                  aria-label={t('ui.outlets.selectCurrentPage')}
                  checked={
                    outlets.length > 0 &&
                    outlets.every((outlet) => selectedIds.includes(outlet.id))
                  }
                  onChange={(event) =>
                    setSelectedIds(
                      event.target.checked
                        ? outlets.map((outlet) => outlet.id)
                        : [],
                    )
                  }
                />{' '}
                {t('ui.outlets.selectCurrentPage')}
              </label>
            )}
          </div>

          {/* Desktop: one scannable list. Name, place, status, manager and listings are visible without opening anything. */}
          <section aria-label={t('ui.outlets.title')} className="hidden overflow-hidden rounded-2xl border border-border bg-card xl:block">
            <div role="row" className={`grid items-center gap-4 border-b border-border bg-muted/40 px-4 py-2.5 text-xs font-medium text-muted-foreground ${isOwner ? 'grid-cols-[1.25rem_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]' : 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]'}`}>
              {isOwner && <span aria-hidden="true" />}
              <span role="columnheader">{t('ui.outlets.columnOutlet')}</span>
              <span role="columnheader">{t('ui.outlets.columnManager')}</span>
              <span role="columnheader">{t('ui.outlets.columnListings')}</span>
              <span role="columnheader">{t('ui.outlets.columnStatus')}</span>
              <span className="sr-only">{t('ui.outlets.actions')}</span>
            </div>
            {outlets.map((outlet) => (
              <div
                key={outlet.id}
                role="row"
                className={`grid items-center gap-4 border-b border-border px-4 py-3 text-sm transition-colors last:border-0 hover:bg-muted/30 ${selectedIds.includes(outlet.id) ? 'bg-secondary/50' : ''} ${isOwner ? 'grid-cols-[1.25rem_minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]' : 'grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_auto]'}`}
              >
                {isOwner && (
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(outlet.id)}
                    onChange={() => toggleSelected(outlet.id)}
                    aria-label={t('ui.outlets.selectOutlet', { name: outlet.name })}
                  />
                )}
                <div className="flex min-w-0 items-center gap-3">
                  <CompactThumbnail src={outlet.coverUrl} alt={outlet.name} kind="outlet" size="md" />
                  <div className="min-w-0">
                    <button
                      type="button"
                      onClick={() => openDetails(outlet)}
                      className="block max-w-full truncate text-left font-semibold text-foreground hover:text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                    >
                      {outletShortName(outlet.name)}
                    </button>
                    <p className="truncate text-xs text-muted-foreground">
                      {outletLocation(outlet.city, outlet.state)}
                      <span className="font-mono"> · {outlet.display_id || outletIdLabel(outlet.id)}</span>
                    </p>
                  </div>
                </div>
                <div className="min-w-0 truncate">{managerSummary(outlet)}</div>
                <div className="min-w-0">{listingSummary(outlet)}</div>
                <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                  <StatusBadge status={outlet.status} label={statusLabel(outlet.status)} />
                  {outlet.review_status === 'pending_review' && <span className="text-xs text-muted-foreground">{t('ui.outlets.inReview')}</span>}
                </div>
                <OutletActionGroup ariaLabel={t('ui.outlets.outletActions', 'Outlet actions')} actions={rowActions(outlet)} />
              </div>
            ))}
          </section>

          {/* Below xl: one compact card per outlet, same information order. */}
          <section aria-label={t('ui.outlets.title')} className="grid gap-3 sm:grid-cols-2 xl:hidden">
            {outlets.map((outlet) => (
              <VendorMobileRecordCard
                key={outlet.id}
                header={
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {isOwner && (
                      <div className="pt-1">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(outlet.id)}
                          onChange={() => toggleSelected(outlet.id)}
                          aria-label={t('ui.outlets.selectOutlet', { name: outlet.name })}
                        />
                      </div>
                    )}
                    <CompactThumbnail src={outlet.coverUrl} alt={outlet.name} kind="outlet" size="md" />
                    <div className="min-w-0 flex-1">
                      <button
                        type="button"
                        onClick={() => openDetails(outlet)}
                        className="block max-w-full break-words text-left font-semibold text-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded"
                      >
                        {outletShortName(outlet.name)}
                      </button>
                      <p className="mt-0.5 break-words text-xs text-muted-foreground">{outletLocation(outlet.city, outlet.state)}</p>
                    </div>
                    <StatusBadge status={outlet.status} label={statusLabel(outlet.status)} />
                  </div>
                }
                footer={<OutletActionGroup ariaLabel={t('ui.outlets.outletActions', 'Outlet actions')} actions={rowActions(outlet)} />}
              >
                <dl className="grid grid-cols-2 gap-2 text-xs">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t('ui.outlets.columnManager')}</dt>
                    <dd className="mt-0.5 truncate text-sm">{managerSummary(outlet)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t('ui.outlets.columnListings')}</dt>
                    <dd className="mt-0.5 text-sm">{listingSummary(outlet)}</dd>
                  </div>
                </dl>
              </VendorMobileRecordCard>
            ))}
          </section>
          {pagination.totalPages > 1 && (
            <div className="overflow-hidden rounded-2xl border border-border bg-card">
              <SharedPagination
                currentPage={pagination.page}
                totalPages={pagination.totalPages}
                totalItems={pagination.total}
                pageSize={pagination.pageSize}
                onPageChange={(page) => {
                  setPagination((current) => ({ ...current, page }));
                  loadOutlets(page);
                }} className="mt-0 border-t border-border px-4 py-3" />
            </div>
          )}
        </>
      )}

      {isOwner && (showForm || editingOutlet) && vendorId && (
        <CenteredDetailModal
          title={t(editingOutlet ? 'outletForm.editTitle' : 'outletForm.addTitle')}
          subtitle={editingOutlet ? outletShortName(editingOutlet.name) : undefined}
          closeLabel={t('ui.outlets.close')}
          onClose={requestCloseForm}
          size="xl"
          layout="fixed"
          headerClassName="shrink-0 border-b border-border px-4 pb-3 pt-4 sm:px-6 sm:pt-5"
          className="!p-0"
          overlayClassName="z-50 !p-0 sm:!p-4"
        >
          <OutletForm
            vendorId={vendorId}
            showAccommodationTypes={editingOutlet?.isAccommodationOutlet}
            onDirtyChange={setFormDirty}
            initialData={
              editingOutlet
                ? {
                    id: editingOutlet.id,
                    name: editingOutlet.name,
                    address: editingOutlet.address || undefined,
                    city: editingOutlet.city || undefined,
                    state: editingOutlet.state || undefined,
                    postcode: editingOutlet.postcode || undefined,
                    country: editingOutlet.country || undefined,
                    phone: editingOutlet.phone || undefined,
                    email: editingOutlet.email || undefined,
                    lat: editingOutlet.lat || undefined,
                    lng: editingOutlet.lng || undefined,
                    welcomeMessage:
                      editingOutlet.welcome_message || undefined,
                    welcomeEnabled: editingOutlet.welcome_enabled ?? true,
                    foodServiceModes: editingOutlet.food_service_modes ?? ["dine_in", "takeaway"],
                    badgeSlugs: editingOutlet.badge_slugs ?? [],
                    accommodationTypeSlugs: editingOutlet.accommodation_type_slugs ?? [],
                  }
                : undefined
            }
            onSuccess={() => {
              closeForm();
              loadOutlets(pagination.page);
            }}
            onClose={requestCloseForm}
          />
        </CenteredDetailModal>
      )}
      <ActionConfirmationDialog
        open={confirmDiscardOpen}
        title={t('ui.outlets.unsavedTitle')}
        description={t('ui.outlets.unsavedBody')}
        confirmLabel={t('ui.outlets.discardChanges')}
        tone="danger"
        onCancel={() => setConfirmDiscardOpen(false)}
        onConfirm={closeForm}
      />

      {selectedOutlet && (
        <CenteredDetailModal
          eyebrow={t('ui.outlets.outletDetails')}
          title={outletShortName(selectedOutlet.name)}
          closeLabel={t('ui.outlets.closeDetails')}
          onClose={() => setSelectedOutlet(null)}
          size="lg"
        >
          {/* Summary: who/where/what state, read at a glance. */}
          <div className="mt-4 flex items-start gap-3">
            <CompactThumbnail
              src={selectedOutlet.coverUrl}
              alt={selectedOutlet.name}
              kind="outlet"
              size="md"
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge status={selectedOutlet.status} label={statusLabel(selectedOutlet.status)} />
                {selectedOutlet.review_status === 'pending_review' && <span className="text-xs text-muted-foreground">{t('ui.outlets.inReview')}</span>}
              </div>
              <p className="mt-1.5 text-sm font-medium text-foreground">
                {outletLocation(selectedOutlet.city, selectedOutlet.state)}
              </p>
              <div className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                <span className="break-all font-mono">{selectedOutlet.display_id || selectedOutlet.id}</span>
                <button
                  type="button"
                  aria-label={t('ui.outlets.copyOutletId')}
                  onClick={() =>
                    copyOutletId(selectedOutlet.display_id || selectedOutlet.id)
                  }
                  title={t('ui.outlets.copyOutletId')}
                  className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg hover:bg-muted hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <Copy size={14} aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>

          <section aria-labelledby="outlet-details-heading" className="mt-5">
            <h3 id="outlet-details-heading" className="text-sm font-semibold text-foreground">{t('ui.outlets.sectionDetails')}</h3>
            <dl className="mt-2 divide-y divide-border rounded-xl border border-border text-sm">
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
                <dt className="text-muted-foreground">{t('ui.outlets.addressLabel')}</dt>
                <dd className="break-words text-foreground">{selectedOutlet.address || <span className="text-muted-foreground">{t('ui.outlets.noAddress')}</span>}</dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
                <dt className="text-muted-foreground">{t('ui.outlets.listedProducts')}</dt>
                <dd className="tabular-nums text-foreground">{selectedOutlet.productsCount}</dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5" aria-label={t('ui.outlets.contactDetails')}>
                <dt className="text-muted-foreground">{t('ui.outlets.phoneLabel')}</dt>
                <dd className="break-words text-foreground">{selectedOutlet.phone ? <a className="hover:text-primary hover:underline" href={`tel:${selectedOutlet.phone}`}>{selectedOutlet.phone}</a> : <span className="text-muted-foreground">{t('ui.outlets.notProvided')}</span>}</dd>
              </div>
              <div className="grid grid-cols-[7rem_minmax(0,1fr)] gap-3 px-3 py-2.5">
                <dt className="text-muted-foreground">{t('ui.outlets.emailLabel')}</dt>
                <dd className="break-all text-foreground">{selectedOutlet.email ? <a className="hover:text-primary hover:underline" href={`mailto:${selectedOutlet.email}`}>{selectedOutlet.email}</a> : <span className="text-muted-foreground">{t('ui.outlets.notProvided')}</span>}</dd>
              </div>
            </dl>
            {selectedOutlet.lat && selectedOutlet.lng && (
              <a
                className="mt-2 inline-flex min-h-10 items-center gap-2 rounded-lg px-1 text-sm font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                href={
                  'https://www.google.com/maps/dir/?api=1&destination=' +
                  selectedOutlet.lat +
                  ',' +
                  selectedOutlet.lng
                }
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={15} aria-hidden="true" />
                {t('ui.outlets.getDirections')}
                <ArrowUpRight size={14} aria-hidden="true" />
              </a>
            )}
          </section>

          <div className="mt-4">
            <OutletActionGroup
              ariaLabel={t('ui.outlets.outletActions', 'Outlet actions')}
              layout="detail"
              actions={[
                ...(isOwner
                  ? [
                      {
                        id: 'edit-outlet',
                        label: t('ui.outlets.editOutletDetails'),
                        onSelect: () => {
                          const outlet = selectedOutlet;
                          setSelectedOutlet(null);
                          openEdit(outlet);
                        },
                        variant: 'primary' as const,
                        icon: Pencil,
                      },
                    ]
                  : isOutletManager
                    ? [
                        {
                          id: 'edit-shop-page',
                          label: t('ui.outlets.editShopPage'),
                          onSelect: () => {
                            setBuilderOutlet(selectedOutlet);
                            setSelectedOutlet(null);
                          },
                          variant: 'primary' as const,
                        },
                      ]
                    : []),
              ]}
            />
          </div>

          {isOwner && vendorId && (
            <section aria-labelledby="outlet-team-heading" className="mt-6">
              <h3 id="outlet-team-heading" className="text-sm font-semibold text-foreground">{t('ui.outlets.sectionTeam')}</h3>
              <div className="mt-2">
                <OutletManagerPanel
                  vendorId={vendorId}
                  outletId={selectedOutlet.id}
                  outletName={outletShortName(selectedOutlet.name)}
                  manager={selectedOutlet.manager}
                  pendingInvitation={selectedOutlet.pendingInvitation}
                  onChanged={() => {
                    setSelectedOutlet(null);
                    loadOutlets(pagination.page);
                  }}
                />
              </div>
            </section>
          )}

          {/* Operational state lives apart from editing so closing is never one mis-tap from "Edit". */}
          <section aria-labelledby="outlet-status-heading" className="mt-6 border-t border-border pt-4">
            <h3 id="outlet-status-heading" className="text-sm font-semibold text-foreground">{t('ui.outlets.sectionStatus')}</h3>
            <p className="mt-1 text-sm text-muted-foreground">{statusSummary(selectedOutlet)}</p>
            {isOwner && (selectedOutlet.status === 'active' || (selectedOutlet.status === 'closed' && selectedOutlet.review_status !== 'pending_review')) && (
              <div className="mt-3">
                <OutletActionGroup
                  ariaLabel={t('ui.outlets.sectionStatus')}
                  layout="detail"
                  actions={selectedOutlet.status === 'active'
                    ? [{
                        id: 'close-outlet',
                        label: t('ui.outlets.closeOutlet'),
                        onSelect: () => setPendingCloseOutlet(selectedOutlet),
                        variant: 'destructive' as const,
                      }]
                    : [{
                        id: 'reopen-outlet',
                        label: t('ui.outlets.reopenOutlet'),
                        onSelect: () => setPendingReopenOutlet(selectedOutlet),
                        variant: 'secondary' as const,
                      }]}
                />
              </div>
            )}
          </section>
        </CenteredDetailModal>
      )}
      <ActionConfirmationDialog
        open={Boolean(pendingCloseOutlet)}
        title={pendingCloseOutlet ? t('ui.outlets.closeConfirmTitle', { name: outletShortName(pendingCloseOutlet.name) }) : t('ui.outlets.closeOutlet')}
        description={t('ui.outlets.closeConsequences')}
        confirmLabel={t('ui.outlets.closeOutlet')}
        tone="danger"
        busy={closeBusy}
        onCancel={() => {
          if (!closeBusy) setPendingCloseOutlet(null);
        }}
        onConfirm={() => void closeOutlet()}
      />
      <ActionConfirmationDialog
        open={Boolean(pendingReopenOutlet)}
        title={pendingReopenOutlet ? t('ui.outlets.reopenConfirmTitle', { name: outletShortName(pendingReopenOutlet.name) }) : t('ui.outlets.reopenOutlet')}
        description={t('ui.outlets.reopenConsequences')}
        confirmLabel={t('ui.outlets.reopenOutlet')}
        busy={reopenBusy}
        onCancel={() => {
          if (!reopenBusy) setPendingReopenOutlet(null);
        }}
        onConfirm={() => void reopenOutlet()}
      />
      {builderOutlet && vendorId && isOutletManager && (
        <HotelProfileEditor vendorId={vendorId} outletId={builderOutlet.id} outletName={outletShortName(builderOutlet.name)} onClose={() => setBuilderOutlet(null)}>
          {(builderOnClose) => <OutletPageBuilder
            vendorId={vendorId}
            outletId={builderOutlet.id}
            outletName={outletShortName(builderOutlet.name)}
            outletAddress={builderOutlet.address}
            outletCity={builderOutlet.city}
            outletState={builderOutlet.state}
            outletPhone={builderOutlet.phone}
            onClose={builderOnClose}
          />}
        </HotelProfileEditor>
      )}
    </div>
  );
}
