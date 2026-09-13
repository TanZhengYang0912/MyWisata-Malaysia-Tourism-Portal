'use client';

import { useCallback, useEffect, useState } from 'react';
import { format } from 'date-fns';
import {
  Archive,
  Check,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  Filter,
  Mail,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShieldCheck,
  Store,
  UserRound,
  X,
  XCircle,
} from 'lucide-react';
import { StatusBadge } from '@/components/shared/status-badge';
import { AiDraftEmailModal } from '@/components/admin/ai-draft-email-modal';
import { VendorReasonModal } from '@/components/admin/vendor-reason-modal';
import { AdminSegmentedFilter } from '@/components/admin/segmented-filter';
import { AdminFilterBar, adminFilterControlClassName } from '@/components/admin/filter-bar';
import { AdminMetricGrid, AdminPageHeader, AdminPageShell } from '@/components/admin/admin-page-shell';
import { useAppDialog } from '@/components/providers/app-dialog';
import { useTranslation } from 'react-i18next';

type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
// 'welcomed' is UI-only — not a real vendors.status value. It's a narrower
// view of the 'approved' rows: those that have already received the
// AI-drafted approval email (approval_email_sent_at IS NOT NULL). See the
// migration comment in supabase/migrations/20260807010000_... for why this
// isn't a new status value.
type FilterStatus = 'all' | VendorStatus | 'welcomed';
type KycFilter = 'all' | 'unverified' | 'pending' | 'approved' | 'rejected';
type ActionType = 'approve' | 'reject' | 'request_information' | 'suspend' | 'unsuspend';

interface VendorOwner {
  full_name: string | null;
  email: string | null;
  kyc_status?: string | null;
}

interface VendorData {
  id: string;
  name: string;
  slug: string;
  status: VendorStatus;
  created_at: string;
  description: string | null;
  business_type: string | null;
  logo_url: string | null;
  cover_url: string | null;
  approved_at: string | null;
  approval_email_sent_at: string | null;
  rejection_reason: string | null;
  users: VendorOwner | VendorOwner[] | null;
  outlets: { count: number }[];
  products: { count: number }[];
  vendor_onboarding_profiles?: { legal_business_name: string | null; registration_number: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; business_address: string | null; status: string; review_note: string | null } | { legal_business_name: string | null; registration_number: string | null; contact_name: string | null; contact_email: string | null; contact_phone: string | null; business_address: string | null; status: string; review_note: string | null }[] | null;
  vendor_documents?: { count: number }[];
}

interface ApprovedRec {
  id: string;
  vendor_name: string;
}

const PAGE_SIZE = 10;
const STATUS_FILTERS: { value: FilterStatus; label: string; tone: string }[] = [
  { value: 'all', label: 'ui.vendors.filters.all', tone: 'text-muted-foreground' },
  { value: 'pending', label: 'ui.vendors.filters.needsReview', tone: 'text-amber-700 dark:text-amber-400' },
  { value: 'approved', label: 'ui.vendors.status.approved', tone: 'text-primary' },
  { value: 'welcomed', label: 'ui.vendors.status.welcomed', tone: 'text-teal-700 dark:text-teal-400' },
  { value: 'rejected', label: 'ui.vendors.status.rejected', tone: 'text-destructive' },
  { value: 'suspended', label: 'ui.vendors.status.suspended', tone: 'text-muted-foreground' },
];

const STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Malacca',
  'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis', 'Putrajaya',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
];

const KYC_OPTIONS: { value: KycFilter; label: string }[] = [
  { value: 'all', label: 'ui.vendors.filters.allKyc' },
  { value: 'approved', label: 'ui.vendors.filters.kycApproved' },
  { value: 'pending', label: 'ui.vendors.filters.kycPending' },
  { value: 'unverified', label: 'ui.vendors.filters.kycUnverified' },
  { value: 'rejected', label: 'ui.vendors.filters.kycRejected' },
];

function countOf(value: { count: number }[] | undefined) {
  return value?.[0]?.count ?? 0;
}

function ownerOf(vendor: VendorData): VendorOwner {
  return Array.isArray(vendor.users) ? vendor.users[0] ?? { full_name: null, email: null } : vendor.users ?? { full_name: null, email: null };
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'V';
}

export default function AdminVendorsPage() {
  const { t } = useTranslation('admin');
  const { confirm, prompt } = useAppDialog();
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [counts, setCounts] = useState<Record<FilterStatus, number>>({ all: 0, pending: 0, approved: 0, welcomed: 0, rejected: 0, suspended: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterStatus>('all');
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('all');
  const [kycFilter, setKycFilter] = useState<KycFilter>('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [activeVendor, setActiveVendor] = useState<VendorData | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [approvedRecs, setApprovedRecs] = useState<ApprovedRec[]>([]);
  const [linkingVendor, setLinkingVendor] = useState<string | null>(null);
  const [selectedRec, setSelectedRec] = useState<Record<string, string>>({});
  const [approvalEmailTarget, setApprovalEmailTarget] = useState<{ id: string; name: string; defaultEmail?: string } | null>(null);
  const [reasonModal, setReasonModal] = useState<{ vendor: VendorData; action: 'reject' | 'suspend' | 'request_information' } | null>(null);

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const query = new URLSearchParams({
        page: String(page),
        filter,
        search,
        state: stateFilter,
        kyc: kycFilter,
      });
      const response = await fetch(`/api/admin/vendors?${query}`, { cache: 'no-store' });
      const payload = await response.json().catch(() => ({})) as {
        data?: {
          vendors: VendorData[];
          total: number;
          counts: Record<FilterStatus, number>;
          approvedRecommendations: ApprovedRec[];
        };
        error?: { message?: string };
      };
      if (!response.ok || !payload.data) throw new Error(payload.error?.message ?? t('ui.vendors.errors.load'));

      setVendors(payload.data.vendors);
      setTotal(payload.data.total);
      setCounts(payload.data.counts);
      setApprovedRecs(payload.data.approvedRecommendations);
      setSelectedIds([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('ui.vendors.errors.load'));
      setVendors([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, kycFilter, page, search, stateFilter, t]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadVendors(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadVendors, search]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPageSelected = vendors.filter((vendor) => selectedIds.includes(vendor.id));
  const allCurrentPageSelected = vendors.length > 0 && vendors.every((vendor) => selectedIds.includes(vendor.id));
  const pendingCount = counts.pending;

  function toggleSelected(id: string) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function togglePageSelection() {
    setSelectedIds((current) => allCurrentPageSelected
      ? current.filter((id) => !vendors.some((vendor) => vendor.id === id))
      : [...new Set([...current, ...vendors.map((vendor) => vendor.id)])]);
  }

  async function requestAction(vendorId: string, action: ActionType, reason?: string) {
    const endpoint = action === 'approve' || action === 'reject' || action === 'request_information'
      ? `/api/admin/vendors/${vendorId}/approve`
      : `/api/admin/vendors/${vendorId}/suspend`;
    const body = action === 'unsuspend' ? { action } : { action, reason };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error ?? result.message ?? t('ui.vendors.errors.action'));
  }

  async function runAction(vendor: VendorData, action: ActionType, reason?: string) {
    const actionLabel = action === 'unsuspend' ? t('ui.actions.reactivate') : t(`ui.actions.${action}`);
    setBusyAction(`${action}:${vendor.id}`);
    try {
      await requestAction(vendor.id, action, reason);
      setNotice(t('ui.vendors.actionSuccess', { name: vendor.name, action: actionLabel }));
      setActiveVendor(null);
      await loadVendors();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : t('ui.vendors.errors.action'));
    } finally {
      setBusyAction(null);
    }
  }

  async function handleAction(vendor: VendorData, action: ActionType) {
    if (action === 'approve' && !(await confirm(t('ui.vendors.confirm.approve', { name: vendor.name })))) return;
    if (action === 'unsuspend' && !(await confirm(t('ui.vendors.confirm.reactivate', { name: vendor.name })))) return;
    if (action === 'reject' || action === 'suspend' || action === 'request_information') {
      setReasonModal({ vendor, action });
      return;
    }
    await runAction(vendor, action);
  }

  async function runBatch(action: ActionType) {
    const eligible = currentPageSelected.filter((vendor) => (
      action === 'approve' ? vendor.status === 'pending' :
      action === 'reject' || action === 'request_information' ? vendor.status === 'pending' :
      action === 'suspend' ? vendor.status === 'approved' :
      vendor.status === 'suspended'
    ));
    if (!eligible.length) {
      setNotice(t('ui.vendors.batch.noneEligible', { action: action === 'unsuspend' ? t('ui.actions.reactivate') : t(`ui.actions.${action}`) }));
      return;
    }
    if (!(await confirm(t('ui.vendors.batch.confirm', { action: action === 'unsuspend' ? t('ui.actions.reactivate') : t(`ui.actions.${action}`), count: eligible.length })))) return;
    const reason = action === 'reject' || action === 'suspend' || action === 'request_information' ? await prompt(t('ui.vendors.batch.reasonPrompt')) : undefined;
    if ((action === 'reject' || action === 'suspend' || action === 'request_information') && reason === null) return;

    setBusyAction(`batch:${action}`);
    try {
      const results = await Promise.allSettled(eligible.map((vendor) => requestAction(vendor.id, action, reason ?? undefined)));
      const failed = results.filter((result) => result.status === 'rejected').length;
      setNotice(failed
        ? t('ui.vendors.batch.partial', { updated: eligible.length - failed, failed })
        : t('ui.vendors.batch.success', { count: eligible.length }));
      await loadVendors();
    } finally {
      setBusyAction(null);
    }
  }

  function exportCurrentView() {
    const header = ['Vendor ID', 'Vendor', 'Owner', 'Email', 'Status', 'Outlets', 'Listings', 'Submitted'];
    const rows = vendors.map((vendor) => {
      const owner = ownerOf(vendor);
      return [vendor.id, vendor.name, owner.full_name ?? '', owner.email ?? '', vendor.status, countOf(vendor.outlets), countOf(vendor.products), vendor.created_at];
    });
    const csv = [header, ...rows].map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'vendor-management.csv';
    link.click();
    URL.revokeObjectURL(url);
  }

  async function copyVendorId(id: string) {
    await navigator.clipboard?.writeText(id);
    setNotice(t('ui.vendors.vendorIdCopied'));
  }

  async function handleLinkRecommendation(vendorId: string) {
    const recommendationId = selectedRec[vendorId];
    if (!recommendationId) {
      setNotice(t('ui.vendors.recommendations.selectFirst'));
      return;
    }
    setLinkingVendor(vendorId);
    try {
      const response = await fetch('/api/admin/vendors/link-recommendation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorId, recommendationId }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message ?? t('ui.vendors.recommendations.linkError'));
      setApprovedRecs((current) => current.filter((recommendation) => recommendation.id !== recommendationId));
      setSelectedRec((current) => {
        const next = { ...current };
        delete next[vendorId];
        return next;
      });
      setNotice(t('ui.vendors.recommendations.linked'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('ui.vendors.recommendations.linkError'));
    } finally {
      setLinkingVendor(null);
    }
  }

  function onOpenApprovalEmail(vendor: VendorData) {
    const owner = ownerOf(vendor);
    const onboarding = Array.isArray(vendor.vendor_onboarding_profiles) ? vendor.vendor_onboarding_profiles[0] : vendor.vendor_onboarding_profiles;
    setApprovalEmailTarget({ id: vendor.id, name: vendor.name, defaultEmail: onboarding?.contact_email ?? owner.email ?? undefined });
  }

  return (
    <AdminPageShell className="text-foreground">
        <AdminPageHeader
          eyebrow={<><Store size={16} /> {t('ui.vendors.eyebrow')}</>}
          title={t('ui.vendors.title')}
          description={t('ui.vendors.description')}
          actions={<>
            <button type="button" onClick={exportCurrentView} className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2.5 text-sm font-semibold text-muted-foreground shadow-sm transition hover:border-ring hover:text-primary">
              <ExternalLink size={16} /> {t('ui.vendors.export')}
            </button>
            <button type="button" onClick={() => void loadVendors()} className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary/90">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> {t('ui.actions.refresh')}
            </button>
          </>}
        />

        <div aria-label={t('ui.vendors.summary')}>
          <AdminMetricGrid items={[
            { label: t('ui.vendors.stats.total'), value: counts.all.toLocaleString() },
            { label: t('ui.vendors.stats.needsReview'), value: pendingCount.toLocaleString(), detail: pendingCount ? t('ui.vendors.stats.actionNeeded') : t('ui.vendors.stats.queueClear') },
            { label: t('ui.vendors.status.approved'), value: (counts.approved + counts.welcomed).toLocaleString(), detail: t('ui.vendors.stats.live') },
            { label: t('ui.vendors.status.suspended'), value: counts.suspended.toLocaleString(), detail: counts.suspended ? t('ui.vendors.stats.needsAttention') : t('ui.vendors.stats.noActiveHolds') },
          ]} />
        </div>

        <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_12px_40px_rgba(1,0,102,0.06)]">
          <div className="border-b border-border px-5 pt-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">{t('ui.vendors.applications.title')}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{t('ui.vendors.applications.description')}</p>
              </div>
              <span className="rounded-full bg-secondary px-3 py-1.5 text-xs font-semibold text-primary">{t('ui.vendors.matching', { count: total })}</span>
            </div>
            <div className="mt-5">
              <AdminSegmentedFilter
                value={filter}
                ariaLabel={t('ui.vendors.statusLabel')}
                items={STATUS_FILTERS.map((item) => ({ value: item.value, label: t(item.label), count: counts[item.value] }))}
                onChange={(value) => { setPage(1); setFilter(value as FilterStatus); }}
              />
            </div>
          </div>

          <AdminFilterBar className="rounded-none border-x-0 border-t-0">
            <label className="relative min-w-[220px] flex-1">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder={t('ui.vendors.searchPlaceholder')} className={`${adminFilterControlClassName} w-full pl-10 pr-4`} />
            </label>
            <div className="flex shrink-0 flex-wrap gap-3">
              <label className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select value={stateFilter} onChange={(event) => { setPage(1); setStateFilter(event.target.value); }} className={`${adminFilterControlClassName} min-w-[155px] appearance-none pl-9 pr-8 text-muted-foreground`}>
                  <option value="all">{t('ui.vendors.filters.allStates')}</option>
                  {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </label>
              <label className="relative">
                <ShieldCheck size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <select value={kycFilter} onChange={(event) => { setPage(1); setKycFilter(event.target.value as KycFilter); }} className={`${adminFilterControlClassName} min-w-[165px] appearance-none pl-9 pr-8 text-muted-foreground`}>
                  {KYC_OPTIONS.map((option) => <option key={option.value} value={option.value}>{t(option.label)}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { setPage(1); setSearch(''); setStateFilter('all'); setKycFilter('all'); setFilter('all'); }} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border bg-card px-3.5 text-sm font-semibold text-muted-foreground hover:text-primary">
                <Filter size={15} /> {t('ui.actions.clear')}
              </button>
            </div>
          </AdminFilterBar>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-border bg-secondary px-4 py-3 sm:px-5">
              <span className="mr-2 text-sm font-semibold text-primary">{t('ui.batch.selected', { count: selectedIds.length })}</span>
              <BatchButton label={t('ui.actions.approve')} icon={Check} onClick={() => void runBatch('approve')} disabled={busyAction !== null} />
              <BatchButton label={t('ui.actions.reject')} icon={XCircle} onClick={() => void runBatch('reject')} disabled={busyAction !== null} tone="danger" />
              <BatchButton label={t('ui.actions.requestInfo')} icon={Clipboard} onClick={() => void runBatch('request_information')} disabled={busyAction !== null} />
              <BatchButton label={t('ui.actions.suspend')} icon={Archive} onClick={() => void runBatch('suspend')} disabled={busyAction !== null} tone="danger" />
              <BatchButton label={t('ui.actions.reactivate')} icon={RefreshCw} onClick={() => void runBatch('unsuspend')} disabled={busyAction !== null} />
              <button type="button" onClick={() => setSelectedIds([])} className="ml-auto text-xs font-semibold text-muted-foreground hover:text-foreground">{t('ui.batch.clearSelection')}</button>
            </div>
          )}

          {error && <div className="mx-5 mt-4 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
          {notice && <div className="mx-5 mt-4 rounded-xl border border-border bg-secondary px-4 py-3 text-sm text-primary">{notice}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-muted text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
                <tr>
                  <th className="w-12 px-5 py-4"><input type="checkbox" checked={allCurrentPageSelected} onChange={togglePageSelection} aria-label={t('ui.vendors.selectAllPage')} className="h-4 w-4 rounded border-border accent-[#010066]" /></th>
                  <th className="px-3 py-4">{t('ui.table.vendor')}</th>
                  <th className="px-3 py-4">{t('ui.table.owner')}</th>
                  <th className="px-3 py-4">{t('ui.table.footprint')}</th>
                  <th className="px-3 py-4">{t('ui.table.kyc')}</th>
                  <th className="px-3 py-4">{t('ui.table.status')}</th>
                  <th className="px-3 py-4">{t('ui.table.submitted')}</th>
                  <th className="px-5 py-4 text-right">{t('ui.table.action')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-16 text-center text-sm text-muted-foreground">{t('ui.vendors.loading')}</td></tr>
                ) : vendors.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-16 text-center"><div className="mx-auto flex max-w-xs flex-col items-center"><div className="mb-3 rounded-2xl bg-muted p-3 text-muted-foreground"><Search size={22} /></div><p className="font-semibold text-foreground">{t('ui.vendors.empty.title')}</p><p className="mt-1 text-xs text-muted-foreground">{t('ui.vendors.empty.description')}</p></div></td></tr>
                ) : vendors.map((vendor) => {
                  const owner = ownerOf(vendor);
                  const isSelected = selectedIds.includes(vendor.id);
                  return (
                    <tr key={vendor.id} className={`group transition hover:bg-muted/60 ${isSelected ? 'bg-secondary' : ''}`}>
                      <td className="px-5 py-4 align-top"><input type="checkbox" checked={isSelected} onChange={() => toggleSelected(vendor.id)} aria-label={t('ui.vendors.selectVendor', { name: vendor.name })} className="mt-1 h-4 w-4 rounded border-border accent-[#010066]" /></td>
                      <td className="px-3 py-4 align-top">
                        <button type="button" onClick={() => setActiveVendor(vendor)} className="flex max-w-[290px] items-start gap-3 text-left">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-sm font-bold text-primary">{initials(vendor.name)}</div>
                          <span className="min-w-0"><span className="block truncate font-bold text-foreground group-hover:text-primary">{vendor.name}</span><span className="mt-1 flex items-center gap-1 font-mono text-[11px] text-muted-foreground">{vendor.id.slice(0, 8)}… <Copy size={11} /></span></span>
                        </button>
                      </td>
                      <td className="px-3 py-4 align-top"><div className="flex items-start gap-2"><UserRound size={15} className="mt-0.5 shrink-0 text-muted-foreground" /><span><span className="block font-semibold text-foreground">{owner.full_name ?? t('ui.vendors.ownerUnnamed')}</span><span className="mt-1 block max-w-[210px] truncate text-xs text-muted-foreground">{owner.email ?? t('ui.vendors.noEmail')}</span></span></div></td>
                      <td className="px-3 py-4 align-top"><div className="flex gap-3 text-xs text-muted-foreground"><span className="inline-flex items-center gap-1"><MapPin size={14} /> {t('ui.vendors.outlets', { count: countOf(vendor.outlets) })}</span><span className="inline-flex items-center gap-1"><Package size={14} /> {t('ui.vendors.listings', { count: countOf(vendor.products) })}</span></div></td>
                      <td className="px-3 py-4 align-top"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${owner.kyc_status === 'approved' ? 'text-primary' : owner.kyc_status === 'pending' ? 'text-amber-700 dark:text-amber-400' : 'text-muted-foreground'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{t(`ui.users.status.${owner.kyc_status ?? 'unverified'}`)}</span></td>
                      <td className="px-3 py-4 align-top">
                        <StatusBadge status={vendor.status === 'suspended' ? t('ui.vendors.status.suspended') : vendor.status} />
                        {vendor.status === 'approved' && vendor.approval_email_sent_at && <span className="ml-1.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">· {t('ui.vendors.status.welcomed')}</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-4 align-top text-xs text-muted-foreground">{format(new Date(vendor.created_at), 'd MMM yyyy')}</td>
                      <td className="px-5 py-4 align-top text-right"><button type="button" onClick={() => setActiveVendor(vendor)} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-muted-foreground opacity-70 transition hover:border-ring hover:text-primary group-hover:opacity-100">{t('ui.actions.review')} <ChevronRight size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-border px-5 py-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <span>{total === 0 ? t('ui.vendors.noResults') : t('ui.vendors.range', { first: (page - 1) * PAGE_SIZE + 1, last: Math.min(page * PAGE_SIZE, total), total })}</span>
            {pageCount > 1 && <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading} className="rounded-lg border border-border bg-card p-2 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="min-w-[75px] text-center font-semibold text-muted-foreground">{t('ui.pagination.pageOf', { page, total: pageCount })}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount || loading} className="rounded-lg border border-border bg-card p-2 text-muted-foreground disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>}
          </div>
        </section>
      {activeVendor && <VendorDrawer vendor={activeVendor} busyAction={busyAction} onClose={() => setActiveVendor(null)} onAction={(action) => void handleAction(activeVendor, action)} onCopy={() => void copyVendorId(activeVendor.id)} approvedRecs={approvedRecs} selectedRecommendation={selectedRec[activeVendor.id] ?? ''} linkingRecommendation={linkingVendor === activeVendor.id} onSelectRecommendation={(value) => setSelectedRec((current) => ({ ...current, [activeVendor.id]: value }))} onLinkRecommendation={() => void handleLinkRecommendation(activeVendor.id)} onOpenApprovalEmail={() => onOpenApprovalEmail(activeVendor)} />}

      <AiDraftEmailModal
        open={!!approvalEmailTarget}
        target={approvalEmailTarget}
        title={approvalEmailTarget ? t('ui.vendors.approvalEmail.title', { name: approvalEmailTarget.name }) : ''}
        draftUrl={approvalEmailTarget ? `/api/admin/vendors/${approvalEmailTarget.id}/approval-email/draft` : ''}
        sendUrl={approvalEmailTarget ? `/api/admin/vendors/${approvalEmailTarget.id}/approval-email` : ''}
        sendLabel={t('ui.vendors.approvalEmail.send')}
        linkHint={t('ui.vendors.approvalEmail.hint')}
        onClose={() => setApprovalEmailTarget(null)}
        onSent={() => {
          setApprovalEmailTarget(null);
          setActiveVendor(null);
          setNotice(t('ui.vendors.approvalEmail.sent'));
          void loadVendors();
        }}
      />

      <VendorReasonModal
        open={!!reasonModal}
        action={reasonModal?.action ?? null}
        vendorId={reasonModal?.vendor.id ?? null}
        vendorName={reasonModal?.vendor.name ?? ''}
        confirmLabel={reasonModal ? (reasonModal.action === 'request_information' ? t('ui.actions.requestInfo') : t(`ui.actions.${reasonModal.action}`)) : ''}
        onClose={() => setReasonModal(null)}
        onConfirm={(reason) => {
          if (!reasonModal) return;
          setReasonModal(null);
          void runAction(reasonModal.vendor, reasonModal.action, reason);
        }}
      />
    </AdminPageShell>
  );
}

function BatchButton({ label, icon: Icon, onClick, disabled, tone = 'default' }: { label: string; icon: typeof Check; onClick: () => void; disabled: boolean; tone?: 'default' | 'danger' }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-50 ${tone === 'danger' ? 'border-destructive/30 bg-card text-destructive hover:bg-destructive/10' : 'border-border bg-card text-primary hover:bg-secondary'}`}><Icon size={14} /> {label}</button>;
}

function VendorDrawer({ vendor, busyAction, onClose, onAction, onCopy, approvedRecs, selectedRecommendation, linkingRecommendation, onSelectRecommendation, onLinkRecommendation, onOpenApprovalEmail }: { vendor: VendorData; busyAction: string | null; onClose: () => void; onAction: (action: ActionType) => void; onCopy: () => void; approvedRecs: ApprovedRec[]; selectedRecommendation: string; linkingRecommendation: boolean; onSelectRecommendation: (value: string) => void; onLinkRecommendation: () => void; onOpenApprovalEmail: () => void }) {
  const { t } = useTranslation('admin');
  const owner = ownerOf(vendor);
  const onboarding = Array.isArray(vendor.vendor_onboarding_profiles) ? vendor.vendor_onboarding_profiles[0] : vendor.vendor_onboarding_profiles;
  const actionBusy = busyAction?.endsWith(`:${vendor.id}`);
  return <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-[2px] sm:p-6" role="dialog" aria-modal="true" aria-label={t('ui.vendors.detailsAria', { name: vendor.name })} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="flex max-h-[calc(100vh-2rem)] w-full max-w-3xl flex-col overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl sm:max-h-[calc(100vh-3rem)]">
      <div className="flex items-start justify-between border-b border-border px-6 py-5"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-primary">{t('ui.vendors.drawer.profile')}</p><h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-foreground">{vendor.name}</h2><p className="mt-1 text-xs text-muted-foreground">/{vendor.slug}</p></div><button type="button" onClick={onClose} aria-label={t('ui.vendors.drawer.closeDetails')} className="rounded-lg p-2 text-muted-foreground hover:bg-muted hover:text-foreground"><X size={19} /></button></div>
      <div className="flex-1 space-y-6 px-6 py-6">
        <div className="flex items-center justify-between"><span className="flex items-center"><StatusBadge status={vendor.status === 'suspended' ? t('ui.vendors.status.suspended') : vendor.status} />{vendor.status === 'approved' && vendor.approval_email_sent_at && <span className="ml-1.5 text-[10px] font-semibold text-teal-700 dark:text-teal-400">· {t('ui.vendors.status.welcomed')}</span>}</span><span className="text-xs text-muted-foreground">{t('ui.vendors.drawer.added', { date: format(new Date(vendor.created_at), 'd MMM yyyy') })}</span></div>
        <div className="rounded-2xl bg-muted p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{t('ui.vendors.drawer.id')}</p><div className="mt-2 flex items-center justify-between gap-3"><code className="truncate text-xs text-foreground">{vendor.id}</code><button type="button" onClick={onCopy} className="shrink-0 rounded-lg bg-card p-2 text-primary shadow-sm hover:bg-secondary" aria-label={t('ui.vendors.drawer.copyId')}><Copy size={15} /></button></div></div>
        <div><h3 className="mb-3 text-sm font-bold text-foreground">{t('ui.vendors.drawer.ownerVerification')}</h3><div className="flex items-center gap-3 rounded-xl border border-border p-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-sm font-bold text-primary">{initials(owner.full_name ?? t('ui.vendors.ownerUnnamed'))}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{owner.full_name ?? t('ui.vendors.ownerUnnamed')}</p><p className="truncate text-xs text-muted-foreground">{owner.email ?? t('ui.vendors.noEmail')}</p></div><span className="ml-auto shrink-0 text-right text-[11px] font-semibold text-muted-foreground">{t('ui.vendors.kyc')}<br /><span className={owner.kyc_status === 'approved' ? 'text-primary' : 'text-amber-700 dark:text-amber-400'}>{t(`ui.users.status.${owner.kyc_status ?? 'unverified'}`)}</span></span></div></div>
        <div><h3 className="mb-3 text-sm font-bold text-foreground">{t('ui.vendors.drawer.footprint')}</h3><div className="grid grid-cols-2 gap-3"><Metric icon={MapPin} label={t('ui.vendors.outletLabel')} value={countOf(vendor.outlets)} /><Metric icon={Package} label={t('ui.vendors.listingLabel')} value={countOf(vendor.products)} /></div></div>
        <div><h3 className="mb-2 text-sm font-bold text-foreground">{t('ui.vendors.drawer.businessOnboarding')}</h3><dl className="divide-y divide-slate-100 rounded-xl border border-border text-sm"><DetailRow label={t('ui.vendors.details.businessType')} value={vendor.business_type?.replaceAll('_', ' ') ?? t('ui.vendors.notProvided')} /><DetailRow label={t('ui.vendors.details.legalName')} value={onboarding?.legal_business_name ?? t('ui.vendors.notProvided')} /><DetailRow label={t('ui.vendors.details.registration')} value={onboarding?.registration_number ?? t('ui.vendors.notProvided')} /><DetailRow label={t('ui.vendors.details.contact')} value={onboarding?.contact_name ?? onboarding?.contact_email ?? t('ui.vendors.notProvided')} /><DetailRow label={t('ui.vendors.details.onboarding')} value={onboarding?.status ?? t('ui.vendors.notStarted')} /><DetailRow label={t('ui.vendors.details.documents')} value={String(countOf(vendor.vendor_documents))} /><DetailRow label={t('ui.vendors.details.approvedOn')} value={vendor.approved_at ? format(new Date(vendor.approved_at), 'd MMM yyyy') : t('ui.vendors.notApproved')} /><DetailRow label={t('ui.vendors.details.reviewNote')} value={onboarding?.review_note ?? vendor.rejection_reason ?? t('ui.vendors.noNote')} /></dl></div>
        {vendor.status === 'approved' && approvedRecs.length > 0 && <div><h3 className="mb-2 text-sm font-bold text-foreground">{t('ui.vendors.recommendations.title')}</h3><p className="mb-2 text-xs leading-5 text-muted-foreground">{t('ui.vendors.recommendations.description')}</p><div className="flex gap-2"><select value={selectedRecommendation} onChange={(event) => onSelectRecommendation(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2.5 text-xs text-muted-foreground"><option value="">{t('ui.vendors.recommendations.select')}</option>{approvedRecs.map((recommendation) => <option key={recommendation.id} value={recommendation.id}>{recommendation.vendor_name}</option>)}</select><button type="button" onClick={onLinkRecommendation} disabled={linkingRecommendation || !selectedRecommendation} className="rounded-xl bg-secondary px-3 py-2.5 text-xs font-semibold text-primary disabled:opacity-40">{linkingRecommendation ? t('ui.vendors.recommendations.linking') : t('ui.vendors.recommendations.link')}</button></div></div>}
        {vendor.description && <div><h3 className="mb-2 text-sm font-bold text-foreground">{t('ui.vendors.details.description')}</h3><p className="rounded-xl bg-muted p-3 text-sm leading-6 text-muted-foreground">{vendor.description}</p></div>}
      </div>
      <div className="border-t border-border px-6 py-5"><div className="flex flex-wrap gap-2">{vendor.status === 'pending' && <><DrawerAction label={t('ui.vendors.actions.approveVendor')} icon={Check} onClick={() => onAction('approve')} tone="primary" disabled={Boolean(actionBusy)} /><DrawerAction label={t('ui.actions.requestInfo')} icon={Clipboard} onClick={() => onAction('request_information')} tone="primary" disabled={Boolean(actionBusy)} /><DrawerAction label={t('ui.actions.reject')} icon={XCircle} onClick={() => onAction('reject')} tone="danger" disabled={Boolean(actionBusy)} /></>}{vendor.status === 'approved' && !vendor.approval_email_sent_at && <DrawerAction label={t('ui.vendors.approvalEmail.send')} icon={Mail} onClick={onOpenApprovalEmail} tone="primary" disabled={Boolean(actionBusy)} />}{vendor.status === 'approved' && <DrawerAction label={t('ui.vendors.actions.suspendVendor')} icon={Archive} onClick={() => onAction('suspend')} tone="danger" disabled={Boolean(actionBusy)} />}{vendor.status === 'suspended' && <DrawerAction label={t('ui.vendors.actions.reactivateVendor')} icon={RefreshCw} onClick={() => onAction('unsuspend')} tone="primary" disabled={Boolean(actionBusy)} />}<button type="button" onClick={onClose} className="ml-auto rounded-xl border border-border px-4 py-2.5 text-sm font-semibold text-muted-foreground hover:bg-muted">{t('ui.actions.close')}</button></div></div>
    </aside>
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: number }) {
  return <div className="rounded-xl border border-border bg-card p-3"><Icon size={16} className="text-primary" /><p className="mt-3 text-2xl font-bold text-foreground">{value}</p><p className="text-xs text-muted-foreground">{label}</p></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 px-3 py-2.5"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="max-w-[60%] text-right text-xs font-semibold capitalize text-muted-foreground">{value}</dd></div>;
}

function DrawerAction({ label, icon: Icon, onClick, tone, disabled }: { label: string; icon: typeof Check; onClick: () => void; tone: 'primary' | 'danger'; disabled: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${tone === 'primary' ? 'bg-primary text-primary-foreground hover:bg-primary/90' : 'border border-destructive/30 bg-destructive/10 text-destructive hover:bg-destructive/15'}`}><Icon size={16} /> {label}</button>;
}
