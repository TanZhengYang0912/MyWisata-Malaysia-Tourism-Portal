'use client';

import { use, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, CalendarDays, Check, ChevronDown, Clock, ImagePlus, Loader2, MapPin, PartyPopper, Plus, Search, Trash2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { useDebounce } from '@/hooks/use-debounce';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useAppDialog } from '@/components/providers/app-dialog';
import { formatDate, formatMYR } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { formatDateTime } from '@/lib/i18n/format';
import { formatEventDateRange, formatEventHours } from '@/lib/promotion-campaigns/locations';
import type { PromotionCampaignPublic } from '@/lib/promotion-campaigns/types';
import { EventListingsManager, type RegistrationListing } from './event-listings-manager';
import { PickupSlotsManager, type PickupSlot } from './pickup-slots-manager';
import { EventStaffManager } from './event-staff-manager';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';

type ItemKind = 'product' | 'service';

interface ProductPick {
  key: string;
  kind: 'existing' | 'new';
  productId: string | null;
  name: string;
  /** Event price for this location; NaN while the input is empty. */
  price: number;
  imageUrl: string | null;
  itemKind: ItemKind;
  /** How many the vendor brings per day; NaN while the input is empty. */
  dailyQuantity: number;
}

interface Registration {
  id: string;
  campaignId: string;
  locationId: string;
  stallNumber: string;
  requestedStallNumber?: string | null;
  stallDescription: string;
  stallPosterUrl: string;
  status: 'pending' | 'approved' | 'rejected' | 'changes_requested' | 'withdrawn' | 'removed';
  closedReason?: string | null;
  rejectionReason: string | null;
  changesRequestedReason: string | null;
  products: RegistrationListing[];
  pickupSlots: PickupSlot[];
}

interface ProductSearchResult {
  id: string;
  name: string;
  base_price: number;
  cover_url: string | null;
}

interface RegistrationDraft {
  savedAt: string;
  form: { stallNumber: string; stallDescription: string; stallPosterUrl: string | null };
  picks: ProductPick[];
  newProductName: string;
  newProductPrice: string;
  newProductImage: string | null;
}

/** JSON turns empty (NaN) inputs into null, and older drafts lack type and daily quantity. */
function normalizePick(pick: ProductPick): ProductPick {
  return {
    ...pick,
    price: pick.price ?? Number.NaN,
    itemKind: pick.itemKind ?? 'product',
    dailyQuantity: pick.dailyQuantity ?? Number.NaN,
  };
}

const isWholeQuantity = (value: number) => Number.isInteger(value) && value >= 1 && value <= 10000;

function eventDraftStorageKey(vendorId: string, campaignId: string, locationId: string) {
  return `vendor-event-registration-draft:${vendorId}:${campaignId}:${locationId}`;
}

/** Today's date in Malaysia (YYYY-MM-DD), to tell which locations have already ended. */
function malaysiaToday(now: number) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(now);
}

const EMPTY_FORM = { stallNumber: '', stallDescription: '', stallPosterUrl: '' as string | null };

export default function VendorEventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, i18n } = useTranslation('vendor');
  const [clock, setClock] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { user, isEventVendor } = useAuth();
  const { showFeedback } = useActionFeedback();
  const vendorId = user?.activeVendorId;
  // Event staff links are owner-only (the API rejects outlet managers).
  const isVendorOwner = user?.roles.some((role) => role === 'vendor_owner' || role === 'event_vendor') ?? false;

  const [campaign, setCampaign] = useState<PromotionCampaignPublic | null>(null);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [chosenLocationId, setChosenLocationId] = useState<string | null>(null);
  const hasMultipleLocations = (campaign?.locations.length ?? 0) > 1;
  const LocationSummaryBody = hasMultipleLocations ? 'span' : 'div';
  const selectedLocation = hasMultipleLocations
    ? campaign?.locations.find((location) => location.id === chosenLocationId)
    : campaign?.locations[0];
  const selectedLocationId = selectedLocation?.id ?? null;
  const registration = registrations.find((entry) => entry.locationId === selectedLocationId) ?? null;
  const today = malaysiaToday(clock);
  const canResubmit = registration?.status === 'changes_requested'
    && Boolean(selectedLocation?.intake?.approvalsCloseAt && Date.parse(selectedLocation.intake.approvalsCloseAt) > clock);
  const selectedLocationCanAcceptApplications = Boolean(selectedLocation
    && selectedLocation.endsOn >= today
    && selectedLocation.intake?.applicationsOpen
    && (!selectedLocation.intake.applicationsCloseAt || Date.parse(selectedLocation.intake.applicationsCloseAt) > clock));
  const canSubmitRegistration = selectedLocationCanAcceptApplications || canResubmit;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [picks, setPicks] = useState<ProductPick[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const { prompt } = useAppDialog();
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<ProductSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [productDropdownOpen, setProductDropdownOpen] = useState(false);
  const [newProductName, setNewProductName] = useState('');
  const [newProductPrice, setNewProductPrice] = useState('');
  const [newProductImage, setNewProductImage] = useState<string | null>(null);
  const [draftBanner, setDraftBanner] = useState<{ savedAt: string } | null>(null);
  const draftSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);
    try {
      const [campaignsResponse, registrationsResponse] = await Promise.all([
        fetch('/api/customer/promotion-campaigns', { cache: 'no-store' }),
        fetch(`/api/vendors/${vendorId}/campaign-registrations`, { cache: 'no-store' }),
      ]);
      const campaignsBody = await campaignsResponse.json() as { data?: { campaigns?: PromotionCampaignPublic[] }; error?: { message?: string } };
      if (!campaignsResponse.ok || !campaignsBody.data) throw new Error(campaignsBody.error?.message ?? t('ui.events.loadError'));
      const found = (campaignsBody.data.campaigns ?? []).find((c) => c.id === id) ?? null;
      setCampaign(found);

      const registrationsBody = await registrationsResponse.json() as { data?: { registrations?: Registration[] } };
      setRegistrations(registrationsResponse.ok ? (registrationsBody.data?.registrations ?? []).filter((r) => r.campaignId === id) : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.events.loadError'));
    } finally {
      setLoading(false);
    }
  }, [vendorId, id, t]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  useEffect(() => {
    if (!vendorId || !selectedLocationId) return;
    const raw = window.localStorage.getItem(eventDraftStorageKey(vendorId, id, selectedLocationId));
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as RegistrationDraft;
      // Restore the saved-draft banner from browser storage for this vendor and location.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (parsed?.savedAt) setDraftBanner({ savedAt: parsed.savedAt });
    } catch {
      window.localStorage.removeItem(eventDraftStorageKey(vendorId, id, selectedLocationId));
    }
  }, [vendorId, id, selectedLocationId]);

  useEffect(() => {
    if (!vendorId || !editing || !selectedLocationId) return;
    if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current);
    draftSaveTimeoutRef.current = setTimeout(() => {
      const draft: RegistrationDraft = { savedAt: new Date().toISOString(), form, picks, newProductName, newProductPrice, newProductImage };
      window.localStorage.setItem(eventDraftStorageKey(vendorId, id, selectedLocationId), JSON.stringify(draft));
    }, 600);
    return () => { if (draftSaveTimeoutRef.current) clearTimeout(draftSaveTimeoutRef.current); };
  }, [vendorId, id, selectedLocationId, editing, form, picks, newProductName, newProductPrice, newProductImage]);

  function resumeDraft() {
    if (!vendorId || !selectedLocationId) return;
    const raw = window.localStorage.getItem(eventDraftStorageKey(vendorId, id, selectedLocationId));
    setDraftBanner(null);
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as RegistrationDraft;
      setForm(parsed.form ?? EMPTY_FORM);
      setPicks((parsed.picks ?? []).map(normalizePick));
      setNewProductName(parsed.newProductName ?? '');
      setNewProductPrice(parsed.newProductPrice ?? '');
      setNewProductImage(parsed.newProductImage ?? null);
      setEditing(true);
    } catch {
      window.localStorage.removeItem(eventDraftStorageKey(vendorId, id, selectedLocationId));
    }
  }

  function clearDraft() {
    if (vendorId && selectedLocationId) window.localStorage.removeItem(eventDraftStorageKey(vendorId, id, selectedLocationId));
  }

  function discardDraft() {
    clearDraft();
    setDraftBanner(null);
  }

  function selectLocation(locationId: string) {
    if (locationId === selectedLocationId) return;
    setChosenLocationId(locationId);
    setEditing(false);
    setDraftBanner(null);
  }

  const focusFormHeading = useCallback((heading: HTMLHeadingElement | null) => heading?.focus(), []);

  function startForm(existing?: Registration) {
    if (existing) {
      setForm({ stallNumber: existing.requestedStallNumber ?? '', stallDescription: existing.stallDescription, stallPosterUrl: existing.stallPosterUrl });
      setPicks(existing.products.map((product) => ({
        key: product.id,
        kind: product.productId ? 'existing' : 'new',
        productId: product.productId,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        itemKind: product.itemKind,
        dailyQuantity: product.dailyQuantity,
      })));
    } else {
      setForm(EMPTY_FORM);
      setPicks([]);
    }
    setNewProductName('');
    setNewProductPrice('');
    setNewProductImage(null);
    setEditing(true);
  }

  async function handlePosterChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !vendorId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions/upload`, { method: 'POST', body: formData });
      const body = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !body.data?.url) throw new Error(body.error?.message ?? t('ui.events.uploadError'));
      setForm((prev) => ({ ...prev, stallPosterUrl: body.data!.url! }));
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.events.uploadError'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  async function handleNewProductImageChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file || !vendorId) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const response = await fetch(`/api/vendors/${vendorId}/event-promotions/upload`, { method: 'POST', body: formData });
      const body = await response.json() as { data?: { url?: string }; error?: { message?: string } };
      if (!response.ok || !body.data?.url) throw new Error(body.error?.message ?? t('ui.events.uploadError'));
      setNewProductImage(body.data!.url!);
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.events.uploadError'));
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  }

  const debouncedSearchQuery = useDebounce(searchQuery, 300);

  const loadProductOptions = useCallback(async (query: string) => {
    if (!vendorId) return;
    setSearching(true);
    try {
      const params = new URLSearchParams({ pageSize: '20', sort: 'name' });
      if (query.trim()) params.set('q', query.trim());
      const response = await fetch(`/api/vendors/${vendorId}/products?${params.toString()}`, { cache: 'no-store' });
      const body = await response.json() as { data?: { items?: ProductSearchResult[] } };
      setSearchResults(response.ok ? body.data?.items ?? [] : []);
    } finally {
      setSearching(false);
    }
  }, [vendorId]);

  useEffect(() => {
    if (!productDropdownOpen) return;
    // Search the catalogue when the picker opens or its debounced query changes.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadProductOptions(debouncedSearchQuery);
  }, [productDropdownOpen, debouncedSearchQuery, loadProductOptions]);

  function addExistingProduct(product: ProductSearchResult) {
    if (picks.some((pick) => pick.productId === product.id)) return;
    setPicks((prev) => [...prev, { key: `existing-${product.id}`, kind: 'existing', productId: product.id, name: product.name, price: Number(product.base_price), imageUrl: product.cover_url, itemKind: 'product', dailyQuantity: Number.NaN }]);
  }

  function addNewProduct() {
    const price = Number(newProductPrice);
    if (!newProductName.trim() || !Number.isFinite(price) || price < 0) return;
    setPicks((prev) => [...prev, { key: `new-${Date.now()}`, kind: 'new', productId: null, name: newProductName.trim(), price, imageUrl: newProductImage, itemKind: 'product', dailyQuantity: Number.NaN }]);
    setNewProductName('');
    setNewProductPrice('');
    setNewProductImage(null);
  }

  function removePick(key: string) {
    setPicks((prev) => prev.filter((pick) => pick.key !== key));
  }

  function updatePick(key: string, patch: Partial<ProductPick>) {
    setPicks((prev) => prev.map((pick) => (pick.key === key ? { ...pick, ...patch } : pick)));
  }

  async function withdraw(registrationId: string) {
    if (!vendorId) return;
    const reason = await prompt(t('ui.events.withdraw.prompt'));
    if (reason === null) return;
    if (reason.trim().length < 5) {
      showFeedback('error', t('ui.events.withdraw.reasonRequired'));
      return;
    }
    setWithdrawing(true);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/campaign-registrations/${registrationId}/withdraw`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t('ui.events.withdraw.error'));
      showFeedback('success', t('ui.events.withdraw.done'));
      await load();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.events.withdraw.error'));
    } finally {
      setWithdrawing(false);
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!vendorId || !selectedLocationId || submitting) return;
    if (!form.stallPosterUrl) {
      showFeedback('error', t('ui.events.posterRequired'));
      return;
    }
    if (picks.length === 0) {
      showFeedback('error', t('ui.events.productsRequired'));
      return;
    }
    if (picks.some((pick) => !Number.isFinite(pick.price) || pick.price < 0 || !isWholeQuantity(pick.dailyQuantity))) {
      showFeedback('error', t('ui.events.listing.incomplete'));
      return;
    }
    setSubmitting(true);
    try {
      const products = picks.map((pick) => {
        const listing = { price: Math.round(pick.price * 100) / 100, dailyQuantity: pick.dailyQuantity, itemKind: pick.itemKind };
        return pick.kind === 'existing'
          ? { kind: 'existing' as const, productId: pick.productId!, ...listing }
          : { kind: 'new' as const, name: pick.name, imageUrl: pick.imageUrl, ...listing };
      });
      const payload = {
        stallNumber: form.stallNumber.trim(),
        stallDescription: form.stallDescription.trim(),
        stallPosterUrl: form.stallPosterUrl,
        products,
      };
      const response = registration
        ? await fetch(`/api/vendors/${vendorId}/campaign-registrations/${registration.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
        })
        : await fetch(`/api/vendors/${vendorId}/campaign-registrations`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...payload, locationId: selectedLocationId }),
        });
      const body = await response.json() as { error?: { message?: string } };
      if (!response.ok) throw new Error(body.error?.message ?? t('ui.events.submitError'));
      showFeedback('success', registration ? t('ui.events.resubmitSuccess') : t('ui.events.submitSuccess'));
      clearDraft();
      setEditing(false);
      await load();
    } catch (err) {
      showFeedback('error', err instanceof Error ? err.message : t('ui.events.submitError'));
    } finally {
      setSubmitting(false);
    }
  }

  if (!vendorId) {
    return <div className="p-8 text-sm text-muted-foreground">{t('ui.events.noVendor')}</div>;
  }

  return (
    <div className="w-full space-y-6">
      <VendorPageHeader eyebrow={<><PartyPopper size={15} aria-hidden="true" /> {t('navigationSections.promotion')}</>} title={t('ui.events.title')} />

      <Link href="/vendor/events" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" /> {t('ui.events.backToEvents')}
      </Link>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('ui.events.loading')}</p>
      ) : error || !campaign ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error ?? t('ui.events.notFound')}</p>
      ) : (
        <>
          {(() => {
            // Event phase from the campaign's own dates in Malaysia time.
            const startsOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(campaign.startsAt));
            const endsOn = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur' }).format(new Date(campaign.endsAt));
            const phase = today < startsOn ? 'upcoming' : today > endsOn ? 'ended' : 'live';
            const joinedCount = campaign.locations.filter((location) => registrations.some((entry) => entry.locationId === location.id)).length;
            const isLongDescription = campaign.description.length > 280;
            const phaseClassName = phase === 'live'
              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200'
              : phase === 'upcoming'
                ? 'bg-highlight-yellow text-highlight-yellow-foreground'
                : 'bg-muted text-muted-foreground';
            return (
              <section aria-labelledby="event-detail-title" className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
                {/* Hero: the event's own poster carries the title; without one a brand panel keeps the same hierarchy. */}
                <div className={`relative isolate flex min-h-52 flex-col justify-end p-5 sm:min-h-64 sm:p-7 ${campaign.posterUrl ? 'text-white' : 'bg-primary text-primary-foreground'}`}>
                  {campaign.posterUrl && (
                    <>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={campaign.posterUrl} alt="" className="absolute inset-0 -z-10 size-full object-cover" />
                      <div aria-hidden="true" className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/40 to-black/5" />
                    </>
                  )}
                  <span className={`mb-3 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-bold ${phaseClassName}`}>{t(`ui.events.phase.${phase}`)}</span>
                  <h2 id="event-detail-title" className="max-w-3xl text-balance text-2xl font-bold leading-tight sm:text-3xl">{campaign.title}</h2>
                  {campaign.summary && campaign.summary !== campaign.description && (
                    <p className="mt-2 max-w-2xl text-sm opacity-90">{campaign.summary}</p>
                  )}
                </div>

                <dl className="grid grid-cols-1 divide-y divide-border border-b border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  <div className="flex items-start gap-3 px-5 py-4">
                    <CalendarDays size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-muted-foreground">{t('ui.events.facts.dates')}</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{formatDate(campaign.startsAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })} – {formatDate(campaign.endsAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })}</dd>
                      {campaign.operatingHours && <dd className="mt-0.5 text-xs text-muted-foreground">{campaign.operatingHours}</dd>}
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-5 py-4">
                    <MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-muted-foreground">{t('ui.events.locations.title')}</dt>
                      <dd className="mt-0.5 text-sm font-semibold text-foreground">{t('ui.events.locations.count', { count: campaign.locations.length })}</dd>
                    </div>
                  </div>
                  <div className="flex items-start gap-3 px-5 py-4">
                    <Check size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                    <div className="min-w-0">
                      <dt className="text-xs font-semibold text-muted-foreground">{t('ui.events.facts.yourStalls')}</dt>
                      <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">{t('ui.events.locations.joined', { joined: joinedCount, total: campaign.locations.length })}</dd>
                    </div>
                  </div>
                </dl>

                {campaign.description && (
                  <div className="px-5 py-4 sm:px-7">
                    <p className={`max-w-3xl whitespace-pre-line text-sm leading-6 text-foreground/85 ${isLongDescription && !descriptionExpanded ? 'line-clamp-3' : ''}`}>{campaign.description}</p>
                    {isLongDescription && (
                      <button type="button" aria-expanded={descriptionExpanded} onClick={() => setDescriptionExpanded((value) => !value)} className="mt-1.5 text-sm font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                        {descriptionExpanded ? t('ui.events.showLess') : t('ui.events.readMore')}
                      </button>
                    )}
                  </div>
                )}
              </section>
            );
          })()}

          {vendorId && isVendorOwner && registrations.some((entry) => entry.status === 'approved') && (
            <EventStaffManager vendorId={vendorId} campaignId={id} />
          )}

          <section aria-labelledby="event-locations-title" className="space-y-3">
            <div>
              <h2 id="event-locations-title" className="text-base font-semibold text-foreground">{t('ui.events.locations.title')}</h2>
              {hasMultipleLocations && <p className="mt-0.5 text-sm text-muted-foreground">{t('ui.events.locations.description')}</p>}
            </div>
            {campaign.locations.length === 0 ? (
              <p className="rounded-xl border border-border bg-card p-4 text-sm text-muted-foreground">{t('ui.events.locations.empty')}</p>
            ) : (
              <ul className="space-y-2">
                {campaign.locations.map((location) => {
                  const mine = registrations.find((entry) => entry.locationId === location.id);
                  const ended = location.endsOn < today;
                  const intake = location.intake;
                  const applicationsOpen = !ended && Boolean(intake?.applicationsOpen)
                    && (!intake?.applicationsCloseAt || Date.parse(intake.applicationsCloseAt) > clock);
                  const selected = location.id === selectedLocationId;
                  const nameId = `event-location-name-${location.id}`;
                  const statusId = `event-location-status-${location.id}`;
                  const schedule = [
                    { key: 'applicationDeadline', value: intake?.applicationsCloseAt },
                    { key: 'approvalDeadline', value: intake?.approvalsCloseAt },
                    { key: 'setupStarts', value: intake?.setupStartsAt },
                  ].filter(({ value }) => value);
                  const showDraft = selected && draftBanner && !editing;
                  const showApply = !mine && applicationsOpen && !editing && !showDraft;
                  const noConfirmedSpaces = intake?.remainingStalls === 0;
                  const terminalStatus = mine?.status === 'withdrawn' || mine?.status === 'removed'
                    ? t(`ui.events.registrationStatus.${mine.status}`)
                    : undefined;
                  const locationSummary = (
                    <>
                      <MapPin size={18} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                      <LocationSummaryBody className="min-w-0 flex-1">
                        {hasMultipleLocations ? (
                          <span id={nameId} className="block break-words text-sm font-semibold text-foreground">{location.name}</span>
                        ) : (
                          <h3 className="break-words text-sm font-semibold text-foreground">{location.name}</h3>
                        )}
                        <span className="mt-0.5 block break-words text-sm text-muted-foreground">{location.address ?? t('ui.events.locations.addressTba')}</span>
                        <span className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                          <span className="inline-flex items-center gap-1.5"><CalendarDays size={14} className="shrink-0" aria-hidden="true" />{formatEventDateRange(location.startsOn, location.endsOn, locale)}</span>
                          <span className="inline-flex items-center gap-1.5"><Clock size={14} className="shrink-0" aria-hidden="true" />{formatEventHours(location.opensAt, location.closesAt, locale)}</span>
                        </span>
                        <span id={statusId} className="mt-2 block">
                          {mine ? <StatusBadge status={mine.status} label={terminalStatus} className="inline-flex text-xs" /> : (
                            <Badge variant="secondary" className={applicationsOpen ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/15 dark:text-emerald-200' : 'bg-muted text-muted-foreground'}>
                              {t(ended ? 'ui.events.locations.ended' : applicationsOpen ? 'ui.events.intakeOpen' : 'ui.events.intakeClosed')}
                            </Badge>
                          )}
                        </span>
                      </LocationSummaryBody>
                    </>
                  );
                  return (
                    <li key={location.id} className={`rounded-xl border bg-card ${hasMultipleLocations && selected ? 'border-primary' : 'border-border'}`}>
                      {hasMultipleLocations ? (
                        <button
                          type="button"
                          onClick={() => selectLocation(location.id)}
                          disabled={uploading || submitting || withdrawing}
                          aria-pressed={selected}
                          aria-labelledby={nameId}
                          aria-describedby={statusId}
                          className={`flex w-full items-start gap-3 rounded-xl px-4 py-3.5 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed sm:px-5 ${selected ? 'bg-primary/5' : 'hover:bg-muted/50'}`}
                        >
                          {locationSummary}
                          {selected ? <Check size={18} className="shrink-0 text-primary" aria-hidden="true" /> : <ChevronDown size={18} className="shrink-0 text-muted-foreground" aria-hidden="true" />}
                        </button>
                      ) : (
                        <div className="flex items-start gap-3 px-4 py-3.5 sm:px-5">{locationSummary}</div>
                      )}

                      {selected && (schedule.length > 0 || noConfirmedSpaces || showApply || showDraft) && (
                        <div className="space-y-3 border-t border-border px-4 py-3.5 sm:px-5">
                          {schedule.length > 0 && (
                            <dl className="flex flex-wrap gap-x-8 gap-y-2">
                              {schedule.map(({ key, value }) => value && (
                                <div key={key}>
                                  <dt className="text-xs font-medium text-muted-foreground">{t(`ui.events.${key}`)}</dt>
                                  <dd className="mt-0.5 text-sm font-semibold tabular-nums text-foreground">
                                    <time dateTime={value}>{formatDateTime(value, locale, { timeZone: 'Asia/Kuala_Lumpur' })}</time>
                                  </dd>
                                </div>
                              ))}
                            </dl>
                          )}
                          {noConfirmedSpaces && <p className="text-sm text-muted-foreground">{t('ui.events.noConfirmedSpaces')}</p>}
                          {showDraft && (
                            <div className="space-y-2">
                              <p role="status" className="text-sm text-foreground">{t('ui.events.draftFound')}</p>
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" onClick={resumeDraft}>{t('ui.events.actions.resumeDraft')}</Button>
                                <Button type="button" variant="outline" onClick={discardDraft}>{t('ui.events.actions.discardDraft')}</Button>
                              </div>
                            </div>
                          )}
                          {showApply && (
                            <Button type="button" className="min-h-11 w-full sm:w-auto" onClick={() => startForm()}>{t('ui.events.actions.register')}</Button>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          {selectedLocation && <>
          {registration && !editing && (
            <section className="space-y-3 rounded-xl border border-border bg-card p-5">
              <h2 className="text-sm font-semibold text-foreground">{t('ui.events.yourRegistration')} · {selectedLocation.name}</h2>
              <p className="text-sm text-foreground">{t(registration.status === 'approved' ? 'ui.events.fields.stallNumber' : 'ui.events.fields.preferredStallNumber')}: {registration.status === 'approved' ? registration.stallNumber : registration.requestedStallNumber || t('ui.events.adminAllocate')}</p>
              <p className="text-sm text-muted-foreground">{registration.stallDescription}</p>
              {vendorId && (registration.status === 'pending' || registration.status === 'approved') && registration.products.length > 0 && (
                <EventListingsManager vendorId={vendorId} listings={registration.products} onSaved={load} />
              )}
              {vendorId && (registration.status === 'pending' || registration.status === 'approved') && (
                <PickupSlotsManager vendorId={vendorId} registrationId={registration.id} slots={registration.pickupSlots ?? []} location={selectedLocation} onSaved={load} />
              )}
              {(registration.status === 'pending' || registration.status === 'approved' || registration.status === 'changes_requested') && (
                <Button type="button" size="sm" variant="outline" className="text-destructive" disabled={withdrawing} onClick={() => void withdraw(registration.id)}>
                  {t('ui.events.withdraw.action')}
                </Button>
              )}
              {(registration.status === 'withdrawn' || registration.status === 'removed') && (
                <p className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{t(`ui.events.withdraw.closed.${registration.status}`)}</p>
              )}
              {registration.status === 'rejected' && registration.rejectionReason && (
                <p className="rounded-lg bg-destructive/5 p-3 text-xs text-destructive">{t('ui.events.rejectionNote', { note: registration.rejectionReason })}</p>
              )}
              {registration.status === 'changes_requested' && (
                <>
                  {registration.changesRequestedReason && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-900 dark:bg-amber-900/20 dark:text-amber-300">{t('ui.events.changesRequestedNote', { note: registration.changesRequestedReason })}</p>}
                  {canResubmit ? (
                    <Button type="button" size="sm" variant="outline" onClick={() => startForm(registration)}>{t('ui.events.actions.editAndResubmit')}</Button>
                  ) : (
                    <p className="text-sm text-muted-foreground">{t('ui.events.approvalWindowClosed')}</p>
                  )}
                </>
              )}
            </section>
          )}

          {editing && (
            <form onSubmit={(event) => void submit(event)} className="space-y-4 rounded-xl border border-border bg-card p-5">
              <h2 ref={focusFormHeading} tabIndex={-1} className="scroll-mt-24 text-sm font-semibold text-foreground">{registration ? t('ui.events.editHeading') : t('ui.events.registerHeading')}</h2>

              <div>
                <label htmlFor="stall-number" className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.events.fields.preferredStallNumber')}</label>
                <Input id="stall-number" value={form.stallNumber} onChange={(e) => setForm((prev) => ({ ...prev, stallNumber: e.target.value }))} maxLength={40} />
              </div>

              <div>
                <label htmlFor="stall-description" className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.events.fields.stallDescription')}</label>
                <Textarea id="stall-description" value={form.stallDescription} onChange={(e) => setForm((prev) => ({ ...prev, stallDescription: e.target.value }))} maxLength={2000} rows={3} required />
              </div>

              <div>
                <span className="mb-1 block text-xs font-semibold text-muted-foreground">{t('ui.events.fields.poster')}</span>
                {form.stallPosterUrl ? (
                  <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setPreviewUrl(form.stallPosterUrl)} className="rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={form.stallPosterUrl} alt="" className="h-16 w-16 rounded-lg object-cover" />
                    </button>
                    <Button type="button" variant="destructive" size="sm" onClick={() => setForm((prev) => ({ ...prev, stallPosterUrl: '' }))}>
                      <Trash2 size={14} aria-hidden="true" /> {t('ui.events.fields.removeImage')}
                    </Button>
                  </div>
                ) : (
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-secondary">
                    {uploading ? <Loader2 className="animate-spin" size={16} aria-hidden="true" /> : <ImagePlus size={16} aria-hidden="true" />}
                    {t('ui.events.fields.chooseImage')}
                    <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handlePosterChange(event)} disabled={uploading} />
                  </label>
                )}
              </div>

              <div className="rounded-lg border border-border p-4">
                <h3 className="text-sm font-semibold text-foreground">{t('ui.events.fields.products')}</h3>

                {/* Event vendors have no catalogue: they only add items made for the event. */}
                {!isEventVendor && <div className="relative mt-3">
                  <label className="relative block">
                    <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onFocus={() => setProductDropdownOpen(true)}
                      onBlur={() => setProductDropdownOpen(false)}
                      placeholder={t('ui.events.fields.searchProducts')}
                      className="pl-9"
                    />
                  </label>
                  {productDropdownOpen && (
                    <div onMouseDown={(e) => e.preventDefault()} className="absolute z-10 mt-1 max-h-60 w-full overflow-y-auto rounded-lg border border-border bg-card shadow-lg">
                      {searching ? (
                        <p className="flex items-center gap-2 p-3 text-xs text-muted-foreground"><Loader2 className="animate-spin" size={14} aria-hidden="true" /> {t('ui.events.loading')}</p>
                      ) : searchResults.length === 0 ? (
                        <p className="p-3 text-xs text-muted-foreground">{t('ui.events.fields.noProductsFound')}</p>
                      ) : (
                        <ul className="divide-y divide-border">
                          {searchResults.map((product) => {
                            const added = picks.some((pick) => pick.productId === product.id);
                            return (
                              <li key={product.id} className="flex items-center justify-between gap-2 p-2 text-sm">
                                <span className="min-w-0 truncate">{product.name} — {formatMYR(product.base_price)}</span>
                                <Button type="button" size="sm" variant={added ? 'ghost' : 'outline'} disabled={added} onClick={() => addExistingProduct(product)}>
                                  {added ? <Check size={14} aria-hidden="true" /> : <Plus size={14} aria-hidden="true" />}
                                </Button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
                </div>}

                <div className="mt-4 rounded-lg bg-secondary/40 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">{t('ui.events.fields.addNewProduct')}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <Input value={newProductName} onChange={(e) => setNewProductName(e.target.value)} placeholder={t('ui.events.fields.productName')} maxLength={120} />
                    <Input type="number" min={0} step={0.01} value={newProductPrice} onChange={(e) => setNewProductPrice(e.target.value)} placeholder={t('ui.events.fields.productPrice')} />
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    {newProductImage ? (
                      <div className="flex items-center gap-2">
                        <button type="button" onClick={() => setPreviewUrl(newProductImage)} className="rounded-lg border border-border focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={newProductImage} alt="" className="h-14 w-14 rounded-lg object-cover" />
                        </button>
                        <Button type="button" variant="destructive" size="sm" onClick={() => setNewProductImage(null)}>
                          <Trash2 size={14} aria-hidden="true" /> {t('ui.events.fields.removeImage')}
                        </Button>
                      </div>
                    ) : (
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-secondary">
                        {uploading ? <Loader2 className="animate-spin" size={14} aria-hidden="true" /> : <ImagePlus size={14} aria-hidden="true" />}
                        {t('ui.events.fields.addPhoto')}
                        <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(event) => void handleNewProductImageChange(event)} disabled={uploading} />
                      </label>
                    )}
                    <Button type="button" variant="outline" size="sm" onClick={addNewProduct}>
                      <Plus size={15} aria-hidden="true" /> {t('ui.events.actions.addProduct')}
                    </Button>
                  </div>
                </div>

                {picks.length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {picks.map((pick) => (
                      <li key={pick.key} className="space-y-2 rounded-lg bg-background p-2 text-sm">
                        <div className="flex items-center justify-between gap-2">
                          <span className="min-w-0 truncate">{pick.name} {pick.kind === 'new' && <span className="text-xs text-muted-foreground">({t('ui.events.fields.newForEvent')})</span>}</span>
                          <Button type="button" size="sm" variant="ghost" onClick={() => removePick(pick.key)} aria-label={t('ui.events.listing.remove', { name: pick.name })}><Trash2 size={14} /></Button>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-3">
                          <label className="text-xs text-muted-foreground">
                            {t('ui.events.listing.price')}
                            <Input type="number" min={0} max={999999.99} step={0.01} value={Number.isNaN(pick.price) ? '' : pick.price} onChange={(e) => updatePick(pick.key, { price: e.target.value === '' ? Number.NaN : Number(e.target.value) })} className="mt-1 h-8" required />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            {t('ui.events.listing.perDay')}
                            <Input type="number" min={1} max={10000} step={1} value={Number.isNaN(pick.dailyQuantity) ? '' : pick.dailyQuantity} onChange={(e) => updatePick(pick.key, { dailyQuantity: e.target.value === '' ? Number.NaN : Number(e.target.value) })} className="mt-1 h-8" required />
                          </label>
                          <label className="text-xs text-muted-foreground">
                            {t('ui.events.listing.kind')}
                            <select value={pick.itemKind} onChange={(e) => updatePick(pick.key, { itemKind: e.target.value as ItemKind })} className="mt-1 h-8 w-full rounded-md border border-input bg-background px-2 text-sm text-foreground">
                              <option value="product">{t('ui.events.listing.kinds.product')}</option>
                              <option value="service">{t('ui.events.listing.kinds.service')}</option>
                            </select>
                          </label>
                        </div>
                        {pick.price === 0 && <p className="text-xs text-muted-foreground">{t('ui.events.listing.freeHint')}</p>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="flex gap-2">
                <Button type="submit" disabled={submitting || uploading || !canSubmitRegistration} aria-describedby={!canSubmitRegistration ? 'registration-submit-unavailable' : undefined}>
                  {submitting ? t('ui.events.loading') : registration ? t('ui.events.actions.resubmit') : t('ui.events.actions.submitRegistration')}
                </Button>
                <Button type="button" variant="outline" onClick={() => { setEditing(false); clearDraft(); }}>{t('ui.events.actions.cancel')}</Button>
              </div>
              {!canSubmitRegistration && <p id="registration-submit-unavailable" role="status" className="text-sm text-muted-foreground">{t('ui.events.draftSubmissionClosed')}</p>}
            </form>
          )}
          </>}

          <Dialog open={Boolean(previewUrl)} onOpenChange={(open) => { if (!open) setPreviewUrl(null); }}>
            <DialogContent className="sm:max-w-xl">
              <DialogTitle className="sr-only">{t('ui.events.fields.poster')}</DialogTitle>
              {previewUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previewUrl} alt="" className="w-full rounded-lg object-contain" />
              )}
            </DialogContent>
          </Dialog>
        </>
      )}
    </div>
  );
}
