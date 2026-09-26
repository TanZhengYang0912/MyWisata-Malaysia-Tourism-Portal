'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowUpRight,
  CirclePlus,
  Copy,
  Eye,
  Landmark,
  MapPinned,
  Pencil,
  Store,
  TicketPercent,
} from 'lucide-react';
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
import CenteredDetailModal from '@/components/ui/centered-detail-modal';
import OutletActionGroup from '@/components/vendor/outlet-action-group';
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
  const vendorId = user?.activeVendorId;
  const isOwner = user?.roles.includes('vendor_owner') ?? false;
  const isOutletManager = user?.roles.includes('outlet_manager') ?? false;
  const managerMode = searchParams.get('mode');
  const managerShopMode = isOutletManagerShopMode(isOutletManager, managerMode);
  const managerShopEditMode = isOutletManagerShopEditMode(
    isOutletManager,
    searchParams.get('edit'),
  );
  const canManageOutlet =
    isOwner || (user?.roles.includes('outlet_manager') ?? false);
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
      <div className="rounded-2xl border border-gray-100 bg-white p-8 text-sm text-gray-500">
        {t('ui.outlets.loadingShop')}
      </div>
    );
  if (managerShopMode && error)
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
        {error}
      </div>
    );
  if (managerShopMode && !outlets[0])
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6">
        <h1 className="text-xl font-bold text-gray-950">
          {t('ui.outlets.shopUnavailable')}
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          {t('ui.outlets.noAssignedOutlet')}
        </p>
      </div>
    );
  if (managerShopMode && vendorId && outlets[0] && managerShopEditMode)
    return (
      <OutletPageBuilder
        vendorId={vendorId}
        outletId={outlets[0].id}
        outletName={outletShortName(outlets[0].name)}
        outletAddress={outlets[0].address}
        outletCity={outlets[0].city}
        outletState={outlets[0].state}
        outletPhone={outlets[0].phone}
        onClose={() => router.push('/vendor/outlets?mode=shop')}
      />
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
        }}
        onEdit={() => router.push(getOutletManagerEditorDestination(true))}
        onCreateVoucher={() =>
          router.push(
            `/vendor/vouchers?create=1&outletId=${encodeURIComponent(outlets[0].id)}`,
          )
        }
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
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary">
            <MapPinned size={15} /> {t('ui.outlets.malaysiaNetwork')}
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-950">
            {t('ui.outlets.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {t('ui.outlets.description')}
          </p>
        </div>
        {isOwner && (
          <button
            type="button"
            onClick={() => {
              setEditingOutlet(null);
              setShowForm(true);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"
          >
            <CirclePlus size={17} /> {t('ui.outlets.add')}
          </button>
        )}
      </header>

      <CompactFilterBar
        search={filters.q}
        onSearchChange={(value) =>
          setFilters((current) => ({ ...current, q: value }))
        }
        placeholder={t('ui.outlets.searchPlaceholder')}
        selects={[
          {
            value: filters.state,
            placeholder: t('ui.outlets.allStates'),
            options: states.map((state) => ({ value: state, label: state })),
            onChange: (value) =>
              setFilters((current) => ({ ...current, state: value })),
          },
          {
            value: filters.status,
            placeholder: t('ui.outlets.allStatuses'),
            options: [
              { value: 'active', label: t('ui.status.active') },
              { value: 'inactive', label: t('ui.status.inactive') },
              { value: 'closed', label: t('ui.status.closed') },
            ],
            onChange: (value) =>
              setFilters((current) => ({ ...current, status: value })),
          },
        ]}
        onClear={clearFilters}
      />
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
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 6 }).map((_, index) => (
            <div
              key={index}
              className="h-28 animate-pulse rounded-2xl bg-gray-100"
            />
          ))}
        </div>
      ) : outlets.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center text-gray-400 shadow-sm">
          <Store className="mx-auto mb-3 opacity-30" size={34} />
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
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-gray-500">
            <span>
              {t('ui.outlets.resultCount', {
                count: pagination.total.toLocaleString(),
              })}
            </span>
            <div className="flex flex-wrap items-center gap-3">
              <span>{t('ui.outlets.perPage', { count: 10 })}</span>
              {isOwner && (
                <label className="inline-flex items-center gap-2 font-semibold text-gray-700">
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
          </div>
          <section className="grid gap-3 md:grid-cols-2">
            {outlets.map((outlet) => (
              <article
                key={outlet.id}
                className="group flex min-w-0 gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-primary/20 hover:shadow-md"
              >
                {isOwner && (
                  <div className="pt-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(outlet.id)}
                      onChange={() => toggleSelected(outlet.id)}
                      aria-label={t('ui.outlets.selectOutlet', {
                        name: outlet.name,
                      })}
                    />
                  </div>
                )}
                <CompactThumbnail
                  src={outlet.coverUrl}
                  alt={outlet.name}
                  kind="outlet"
                  size="md"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedOutlet(outlet)}
                        className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                      >
                        {outletShortName(outlet.name)}
                      </button>
                      <p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500">
                        <MapPinned size={12} aria-hidden="true" />{' '}
                        {outletLocation(outlet.city, outlet.state)}
                      </p>
                      <p className="mt-1 font-mono text-[11px] text-gray-400">
                        {outlet.display_id || outletIdLabel(outlet.id)}
                      </p>
                    </div>
                    <StatusBadge status={outlet.status} />
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3">
                    <span className="text-xs text-gray-500">
                      {outlet.productsCount > 0 ? (
                        <>
                          <strong className="text-gray-800">
                            {outlet.productsCount}
                          </strong>{' '}
                          {t('ui.outlets.listings')}
                        </>
                      ) : (
                        <span className="font-medium text-gray-600">
                          {t('ui.outlets.noListings')}
                        </span>
                      )}
                    </span>
                    <OutletActionGroup
                      ariaLabel={t(
                        'ui.outlets.outletActions',
                        'Outlet actions',
                      )}
                      actions={[
                        ...(outlet.productsCount === 0 && canManageOutlet
                          ? [
                              {
                                id: 'manage-listings',
                                label: t('ui.outlets.manageListings'),
                                onSelect: () => router.push('/vendor/products'),
                                variant: 'primary' as const,
                              },
                            ]
                          : []),
                        {
                          id: 'view-details',
                          label: t('ui.outlets.viewDetails'),
                          onSelect: () => setSelectedOutlet(outlet),
                          variant: 'secondary' as const,
                          icon: Eye,
                          ariaLabel: t('ui.outlets.viewDetailsFor', {
                            name: outletShortName(outlet.name),
                          }),
                        },
                        ...(isOwner
                          ? [
                              {
                                id: 'edit-outlet',
                                label: t('ui.outlets.editOutlet'),
                                onSelect: () => {
                                  setEditingOutlet(outlet);
                                  setShowForm(true);
                                },
                                variant: 'tertiary' as const,
                                icon: Pencil,
                                ariaLabel: t('ui.outlets.editOutletNamed', {
                                  name: outletShortName(outlet.name),
                                }),
                              },
                            ]
                          : []),
                      ]}
                    />
                  </div>
                </div>
              </article>
            ))}
          </section>
          {pagination.totalPages > 1 && (
            <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <PaginationControls
                page={pagination.page}
                totalPages={pagination.totalPages}
                total={pagination.total}
                pageSize={pagination.pageSize}
                onPageChange={(page) => {
                  setPagination((current) => ({ ...current, page }));
                  loadOutlets(page);
                }}
              />
            </div>
          )}
        </>
      )}

      {isOwner && (showForm || editingOutlet) && vendorId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
            <OutletForm
              vendorId={vendorId}
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
                    }
                  : undefined
              }
              onSuccess={() => {
                setShowForm(false);
                setEditingOutlet(null);
                loadOutlets(pagination.page);
              }}
              onClose={() => {
                setShowForm(false);
                setEditingOutlet(null);
              }}
            />
          </div>
        </div>
      )}

      {selectedOutlet && (
        <CenteredDetailModal
          eyebrow={t('ui.outlets.outletDetails')}
          title={outletShortName(selectedOutlet.name)}
          subtitle={outletLocation(selectedOutlet.city, selectedOutlet.state)}
          closeLabel={t('ui.outlets.closeDetails')}
          onClose={() => setSelectedOutlet(null)}
          size="lg"
        >
          <div className="mt-6 grid gap-4 rounded-2xl border border-primary/10 bg-secondary/35 p-4 sm:grid-cols-[auto_1fr] sm:items-center">
            <CompactThumbnail
              src={selectedOutlet.coverUrl}
              alt={selectedOutlet.name}
              kind="outlet"
              size="md"
            />
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">
                {t('ui.outlets.location')}
              </p>
              <p className="mt-1 text-base font-semibold text-gray-950">
                {outletLocation(selectedOutlet.city, selectedOutlet.state)}
              </p>
              <p className="mt-1 text-sm text-gray-500">
                {selectedOutlet.address || t('ui.outlets.noAddress')}
              </p>
              <div className="mt-3 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-500">
                  {t('ui.outlets.status')}
                </span>
                <StatusBadge status={selectedOutlet.status} />
              </div>
            </div>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                {t('ui.outlets.outletId')}
              </p>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="break-all font-mono text-sm font-semibold text-gray-900">
                  {selectedOutlet.display_id || selectedOutlet.id}
                </p>
                <button
                  type="button"
                  aria-label={t('ui.outlets.copyOutletId')}
                  onClick={() =>
                    copyOutletId(selectedOutlet.display_id || selectedOutlet.id)
                  }
                  title={t('ui.outlets.copyOutletId')}
                  className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-white hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
                >
                  <Copy size={15} aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="rounded-xl bg-gray-50 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                {t('ui.outlets.listedProducts')}
              </p>
              <p className="mt-2 text-xl font-bold text-gray-950">
                {selectedOutlet.productsCount}
              </p>
            </div>
          </div>
          {isOwner && vendorId && (
            <div className="mt-4">
              <OutletManagerPanel
                vendorId={vendorId}
                outletId={selectedOutlet.id}
                manager={selectedOutlet.manager}
                pendingInvitation={selectedOutlet.pendingInvitation}
                onChanged={() => {
                  setSelectedOutlet(null);
                  loadOutlets(pagination.page);
                }}
              />
            </div>
          )}
          {(selectedOutlet.phone || selectedOutlet.email) && (
            <div className="mt-4 rounded-xl border border-gray-100 bg-white p-4 ring-1 ring-gray-100">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-gray-500">
                {t('ui.outlets.contactDetails')}
              </p>
              <div className="mt-2 grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                {selectedOutlet.phone && (
                  <p>
                    {t('ui.outlets.phone', { value: selectedOutlet.phone })}
                  </p>
                )}
                {selectedOutlet.email && (
                  <p className="break-all">
                    {t('ui.outlets.email', { value: selectedOutlet.email })}
                  </p>
                )}
              </div>
            </div>
          )}
          {selectedOutlet.lat && selectedOutlet.lng && (
            <a
              className="mt-4 inline-flex items-center gap-1 font-semibold text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40"
              href={
                'https://www.google.com/maps/dir/?api=1&destination=' +
                selectedOutlet.lat +
                ',' +
                selectedOutlet.lng
              }
              target="_blank"
              rel="noreferrer"
            >
              <Landmark size={15} aria-hidden="true" />{' '}
              {t('ui.outlets.getDirections')}{' '}
              <ArrowUpRight size={15} aria-hidden="true" />
            </a>
          )}
          <div className="mt-7 border-t border-gray-100 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              {t('ui.outlets.actions')}
            </p>
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
                          setEditingOutlet(selectedOutlet);
                          setSelectedOutlet(null);
                          setShowForm(true);
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
                {
                  id: 'create-voucher',
                  label: t('ui.outlets.createVoucher'),
                  onSelect: () => {
                    setSelectedOutlet(null);
                    router.push(
                      `/vendor/vouchers?create=1&outletId=${encodeURIComponent(selectedOutlet.id)}`,
                    );
                  },
                  variant: 'secondary' as const,
                  icon: TicketPercent,
                },
                ...(isOwner && selectedOutlet.status === 'active'
                  ? [
                      {
                        id: 'close-outlet',
                        label: t('ui.outlets.closeOutlet'),
                        onSelect: () => setPendingCloseOutlet(selectedOutlet),
                        variant: 'destructive' as const,
                      },
                    ]
                  : []),
              ]}
            />
          </div>
        </CenteredDetailModal>
      )}
      <ActionConfirmationDialog
        open={Boolean(pendingCloseOutlet)}
        title={t('ui.outlets.closeOutlet')}
        description={t('ui.outlets.closeConfirm')}
        confirmLabel={t('ui.outlets.closeOutlet')}
        tone="danger"
        busy={closeBusy}
        onCancel={() => {
          if (!closeBusy) setPendingCloseOutlet(null);
        }}
        onConfirm={() => void closeOutlet()}
      />
      {builderOutlet && vendorId && isOutletManager && (
        <OutletPageBuilder
          vendorId={vendorId}
          outletId={builderOutlet.id}
          outletName={outletShortName(builderOutlet.name)}
          outletAddress={builderOutlet.address}
          outletCity={builderOutlet.city}
          outletState={builderOutlet.state}
          outletPhone={builderOutlet.phone}
          onClose={() => setBuilderOutlet(null)}
        />
      )}
    </div>
  );
}
