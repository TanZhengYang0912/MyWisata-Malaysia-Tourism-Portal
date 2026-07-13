'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import {
  Archive,
  Building2,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Copy,
  ExternalLink,
  Filter,
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
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/shared/status-badge';

type VendorStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
type FilterStatus = 'all' | VendorStatus;
type KycFilter = 'all' | 'unverified' | 'pending' | 'approved' | 'rejected';
type ActionType = 'approve' | 'reject' | 'suspend' | 'unsuspend';

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
  rejection_reason: string | null;
  users: VendorOwner | VendorOwner[] | null;
  outlets: { count: number }[];
  products: { count: number }[];
}

interface ApprovedRec {
  id: string;
  vendor_name: string;
}

const PAGE_SIZE = 10;
const STATUS_FILTERS: { value: FilterStatus; label: string; tone: string }[] = [
  { value: 'all', label: 'All vendors', tone: 'text-slate-600' },
  { value: 'pending', label: 'Needs review', tone: 'text-amber-700' },
  { value: 'approved', label: 'Approved', tone: 'text-emerald-700' },
  { value: 'rejected', label: 'Rejected', tone: 'text-rose-700' },
  { value: 'suspended', label: 'Suspended', tone: 'text-slate-600' },
];

const STATES = [
  'Johor', 'Kedah', 'Kelantan', 'Kuala Lumpur', 'Labuan', 'Malacca',
  'Negeri Sembilan', 'Pahang', 'Penang', 'Perak', 'Perlis', 'Putrajaya',
  'Sabah', 'Sarawak', 'Selangor', 'Terengganu',
];

const KYC_OPTIONS: { value: KycFilter; label: string }[] = [
  { value: 'all', label: 'All KYC statuses' },
  { value: 'approved', label: 'KYC approved' },
  { value: 'pending', label: 'KYC pending' },
  { value: 'unverified', label: 'KYC unverified' },
  { value: 'rejected', label: 'KYC rejected' },
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

function safeSearch(value: string) {
  return value.trim().replace(/[%,]/g, ' ');
}

export default function AdminVendorsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [vendors, setVendors] = useState<VendorData[]>([]);
  const [counts, setCounts] = useState<Record<FilterStatus, number>>({ all: 0, pending: 0, approved: 0, rejected: 0, suspended: 0 });
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

  const loadVendors = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const term = safeSearch(search);
      let ownerIdsForKyc: string[] | null = null;
      let ownerIdsForSearch: string[] = [];

      if (kycFilter !== 'all' || term) {
        let ownerQuery = supabase.from('users').select('id');
        if (kycFilter !== 'all') ownerQuery = ownerQuery.eq('kyc_status', kycFilter);
        if (term) ownerQuery = ownerQuery.or(`full_name.ilike.%${term}%,email.ilike.%${term}%`);
        const { data: matchedOwners, error: ownerError } = await ownerQuery.limit(100);
        if (ownerError) throw ownerError;
        const ids = (matchedOwners ?? []).map((owner: { id: string }) => owner.id);
        if (kycFilter !== 'all') ownerIdsForKyc = ids;
        if (term) ownerIdsForSearch = ids;
      }

      let matchingVendorIds: string[] | null = null;
      if (stateFilter !== 'all') {
        const { data: matchingOutlets, error: outletError } = await supabase
          .from('outlets')
          .select('vendor_id')
          .eq('state', stateFilter);
        if (outletError) throw outletError;
        matchingVendorIds = [...new Set((matchingOutlets ?? []).map((outlet: { vendor_id: string }) => outlet.vendor_id))];
      }

      let query = supabase
        .from('vendors')
        .select('id,name,slug,status,created_at,description,business_type,logo_url,cover_url,approved_at,rejection_reason,users!vendors_owner_id_fkey(full_name,email,kyc_status),outlets(count),products(count)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

      if (filter !== 'all') query = query.eq('status', filter);
      if (ownerIdsForKyc) query = query.in('owner_id', ownerIdsForKyc.length ? ownerIdsForKyc : ['00000000-0000-0000-0000-000000000000']);
      if (matchingVendorIds) query = query.in('id', matchingVendorIds.length ? matchingVendorIds : ['00000000-0000-0000-0000-000000000000']);
      if (term) {
        const clauses = [`name.ilike.%${term}%`, `slug.ilike.%${term}%`];
        if (/^[0-9a-f-]{36}$/i.test(term)) clauses.push(`id.eq.${term}`);
        if (ownerIdsForSearch.length) clauses.push(`owner_id.in.(${ownerIdsForSearch.join(',')})`);
        query = query.or(clauses.join(','));
      }

      const [{ data, error: vendorError, count }, ...statusResults] = await Promise.all([
        query,
        ...(['all', 'pending', 'approved', 'rejected', 'suspended'] as FilterStatus[]).map(async (status) => {
          let countQuery = supabase.from('vendors').select('id', { count: 'exact', head: true });
          if (status !== 'all') countQuery = countQuery.eq('status', status);
          const result = await countQuery;
          return { status, count: result.count ?? 0, error: result.error };
        }),
      ]);

      if (vendorError) throw vendorError;
      const failedCount = statusResults.find((result) => result.error);
      if (failedCount?.error) throw failedCount.error;

      setVendors((data ?? []) as VendorData[]);
      setTotal(count ?? 0);
      setCounts(Object.fromEntries(statusResults.map((result) => [result.status, result.count])) as Record<FilterStatus, number>);
      setSelectedIds([]);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to load vendors');
      setVendors([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [filter, kycFilter, page, search, stateFilter, supabase]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadVendors(), search ? 250 : 0);
    return () => window.clearTimeout(timer);
  }, [loadVendors, search]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(null), 3500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    supabase
      .from('vendor_recommendations')
      .select('id, vendor_name')
      .eq('status', 'approved')
      .then(({ data }) => setApprovedRecs((data ?? []) as ApprovedRec[]));
  }, [supabase]);

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
    const endpoint = action === 'approve' || action === 'reject'
      ? `/api/admin/vendors/${vendorId}/approve`
      : `/api/admin/vendors/${vendorId}/suspend`;
    const body = action === 'unsuspend' ? { action } : { action, reason };
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const result = await response.json().catch(() => ({})) as { error?: string; message?: string };
    if (!response.ok) throw new Error(result.error ?? result.message ?? 'Action failed');
  }

  async function handleAction(vendor: VendorData, action: ActionType) {
    const actionLabel = action === 'unsuspend' ? 'reactivate' : action;
    if (action === 'approve' && !window.confirm(`Approve ${vendor.name}?`)) return;
    if (action === 'unsuspend' && !window.confirm(`Reactivate ${vendor.name}?`)) return;
    const reason = action === 'reject' || action === 'suspend'
      ? window.prompt(`${action === 'reject' ? 'Rejection' : 'Suspension'} reason for ${vendor.name}:`)
      : undefined;
    if ((action === 'reject' || action === 'suspend') && reason === null) return;

    setBusyAction(`${action}:${vendor.id}`);
    try {
      await requestAction(vendor.id, action, reason ?? undefined);
      setNotice(`${vendor.name} ${actionLabel}d successfully.`);
      setActiveVendor(null);
      await loadVendors();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Action failed');
    } finally {
      setBusyAction(null);
    }
  }

  async function runBatch(action: ActionType) {
    const eligible = currentPageSelected.filter((vendor) => (
      action === 'approve' ? vendor.status === 'pending' :
      action === 'reject' ? vendor.status === 'pending' :
      action === 'suspend' ? vendor.status === 'approved' :
      vendor.status === 'suspended'
    ));
    if (!eligible.length) {
      setNotice(`No selected vendors can be ${action === 'unsuspend' ? 'reactivated' : `${action}d`} right now.`);
      return;
    }
    if (!window.confirm(`${action === 'unsuspend' ? 'Reactivate' : action[0].toUpperCase() + action.slice(1)} ${eligible.length} selected vendor${eligible.length === 1 ? '' : 's'}?`)) return;
    const reason = action === 'reject' || action === 'suspend' ? window.prompt('Enter one reason for this batch action:') : undefined;
    if ((action === 'reject' || action === 'suspend') && reason === null) return;

    setBusyAction(`batch:${action}`);
    try {
      const results = await Promise.allSettled(eligible.map((vendor) => requestAction(vendor.id, action, reason ?? undefined)));
      const failed = results.filter((result) => result.status === 'rejected').length;
      setNotice(failed ? `${eligible.length - failed} updated. ${failed} could not be updated.` : `${eligible.length} vendors updated successfully.`);
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
    setNotice('Vendor ID copied.');
  }

  async function handleLinkRecommendation(vendorId: string) {
    const recommendationId = selectedRec[vendorId];
    if (!recommendationId) {
      setNotice('Select an approved recommendation first.');
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
      if (!response.ok) throw new Error(payload?.error?.message ?? 'Unable to link recommendation');
      setApprovedRecs((current) => current.filter((recommendation) => recommendation.id !== recommendationId));
      setSelectedRec((current) => {
        const next = { ...current };
        delete next[vendorId];
        return next;
      });
      setNotice('Recommendation linked. The 90-day commission window is now open.');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to link recommendation');
    } finally {
      setLinkingVendor(null);
    }
  }

  return (
    <div className="min-h-full bg-[#f4f7f5] px-5 py-7 text-[#18242b] sm:px-8 lg:px-10">
      <div className="mx-auto max-w-[1500px] space-y-6">
        <header className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.22em] text-[#087f66]">
              <Store size={16} /> Malaysia vendor network
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-[-0.04em] sm:text-4xl">Vendor review workspace</h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-500">Review applications, keep vendor health visible, and take action without opening every record.</p>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={exportCurrentView} className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-600 shadow-sm transition hover:border-[#8bcfbe] hover:text-[#087f66]">
              <ExternalLink size={16} /> Export view
            </button>
            <button type="button" onClick={() => void loadVendors()} className="inline-flex items-center gap-2 rounded-xl bg-[#087f66] px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#05634f]">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
          </div>
        </header>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Vendor summary">
          <SummaryCard label="Total vendors" value={counts.all} icon={Building2} accent="slate" />
          <SummaryCard label="Needs review" value={pendingCount} icon={Clipboard} accent="amber" helper={pendingCount ? 'Action needed' : 'Queue is clear'} />
          <SummaryCard label="Approved" value={counts.approved} icon={CheckCircle2} accent="green" helper="Live on platform" />
          <SummaryCard label="Suspended" value={counts.suspended} icon={Archive} accent="rose" helper={counts.suspended ? 'Needs attention' : 'No active holds'} />
        </section>

        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-[0_12px_40px_rgba(38,65,57,0.06)]">
          <div className="border-b border-slate-100 px-5 pt-5 sm:px-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-bold">Vendor applications</h2>
                <p className="mt-1 text-xs text-slate-400">Select a vendor to see its operating footprint and review history.</p>
              </div>
              <span className="rounded-full bg-[#e8f5f0] px-3 py-1.5 text-xs font-semibold text-[#087f66]">{total} matching vendors</span>
            </div>
            <div className="mt-5 flex gap-1 overflow-x-auto pb-0" role="tablist" aria-label="Vendor status">
              {STATUS_FILTERS.map((item) => (
                <button key={item.value} type="button" role="tab" aria-selected={filter === item.value} onClick={() => { setPage(1); setFilter(item.value); }} className={`whitespace-nowrap border-b-2 px-3 pb-3 text-sm font-semibold transition ${filter === item.value ? 'border-[#087f66] text-[#087f66]' : `border-transparent ${item.tone} hover:border-slate-200`}`}>
                  {item.label} <span className="ml-1 text-xs opacity-60">{counts[item.value]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-b border-slate-100 bg-[#fbfcfc] p-4 sm:p-5 xl:flex-row">
            <label className="relative min-w-0 flex-1">
              <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(event) => { setPage(1); setSearch(event.target.value); }} placeholder="Search vendor ID, name or owner…" className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm outline-none transition placeholder:text-slate-400 focus:border-[#4eaf98] focus:ring-4 focus:ring-[#dff3ec]" />
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="relative">
                <MapPin size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={stateFilter} onChange={(event) => { setPage(1); setStateFilter(event.target.value); }} className="h-11 min-w-[155px] appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-600 outline-none focus:border-[#4eaf98] focus:ring-4 focus:ring-[#dff3ec]">
                  <option value="all">All states</option>
                  {STATES.map((state) => <option key={state} value={state}>{state}</option>)}
                </select>
              </label>
              <label className="relative">
                <ShieldCheck size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select value={kycFilter} onChange={(event) => { setPage(1); setKycFilter(event.target.value as KycFilter); }} className="h-11 min-w-[165px] appearance-none rounded-xl border border-slate-200 bg-white pl-9 pr-8 text-sm text-slate-600 outline-none focus:border-[#4eaf98] focus:ring-4 focus:ring-[#dff3ec]">
                  {KYC_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
              </label>
              <button type="button" onClick={() => { setPage(1); setSearch(''); setStateFilter('all'); setKycFilter('all'); setFilter('all'); }} className="inline-flex h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-500 hover:text-[#087f66]">
                <Filter size={15} /> Clear
              </button>
            </div>
          </div>

          {selectedIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 border-b border-[#bfe6d9] bg-[#effaf6] px-4 py-3 sm:px-5">
              <span className="mr-2 text-sm font-semibold text-[#087f66]">{selectedIds.length} selected</span>
              <BatchButton label="Approve" icon={Check} onClick={() => void runBatch('approve')} disabled={busyAction !== null} />
              <BatchButton label="Reject" icon={XCircle} onClick={() => void runBatch('reject')} disabled={busyAction !== null} tone="danger" />
              <BatchButton label="Suspend" icon={Archive} onClick={() => void runBatch('suspend')} disabled={busyAction !== null} tone="danger" />
              <BatchButton label="Reactivate" icon={RefreshCw} onClick={() => void runBatch('unsuspend')} disabled={busyAction !== null} />
              <button type="button" onClick={() => setSelectedIds([])} className="ml-auto text-xs font-semibold text-slate-500 hover:text-slate-800">Clear selection</button>
            </div>
          )}

          {error && <div className="mx-5 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>}
          {notice && <div className="mx-5 mt-4 rounded-xl border border-[#bfe6d9] bg-[#effaf6] px-4 py-3 text-sm text-[#087f66]">{notice}</div>}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <thead className="bg-[#fbfcfc] text-[11px] uppercase tracking-[0.14em] text-slate-400">
                <tr>
                  <th className="w-12 px-5 py-4"><input type="checkbox" checked={allCurrentPageSelected} onChange={togglePageSelection} aria-label="Select all vendors on this page" className="h-4 w-4 rounded border-slate-300 accent-[#087f66]" /></th>
                  <th className="px-3 py-4">Vendor</th>
                  <th className="px-3 py-4">Owner</th>
                  <th className="px-3 py-4">Footprint</th>
                  <th className="px-3 py-4">KYC</th>
                  <th className="px-3 py-4">Status</th>
                  <th className="px-3 py-4">Submitted</th>
                  <th className="px-5 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-16 text-center text-sm text-slate-400">Loading vendor workspace…</td></tr>
                ) : vendors.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-16 text-center"><div className="mx-auto flex max-w-xs flex-col items-center"><div className="mb-3 rounded-2xl bg-slate-100 p-3 text-slate-400"><Search size={22} /></div><p className="font-semibold text-slate-700">No vendors match these filters</p><p className="mt-1 text-xs text-slate-400">Try clearing one of the filters to widen the review queue.</p></div></td></tr>
                ) : vendors.map((vendor) => {
                  const owner = ownerOf(vendor);
                  const isSelected = selectedIds.includes(vendor.id);
                  return (
                    <tr key={vendor.id} className={`group transition hover:bg-[#f8fcfa] ${isSelected ? 'bg-[#f2fbf7]' : ''}`}>
                      <td className="px-5 py-4 align-top"><input type="checkbox" checked={isSelected} onChange={() => toggleSelected(vendor.id)} aria-label={`Select ${vendor.name}`} className="mt-1 h-4 w-4 rounded border-slate-300 accent-[#087f66]" /></td>
                      <td className="px-3 py-4 align-top">
                        <button type="button" onClick={() => setActiveVendor(vendor)} className="flex max-w-[290px] items-start gap-3 text-left">
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e5f4ef] text-sm font-bold text-[#087f66]">{initials(vendor.name)}</div>
                          <span className="min-w-0"><span className="block truncate font-bold text-slate-800 group-hover:text-[#087f66]">{vendor.name}</span><span className="mt-1 flex items-center gap-1 font-mono text-[11px] text-slate-400">{vendor.id.slice(0, 8)}… <Copy size={11} /></span></span>
                        </button>
                      </td>
                      <td className="px-3 py-4 align-top"><div className="flex items-start gap-2"><UserRound size={15} className="mt-0.5 shrink-0 text-slate-400" /><span><span className="block font-semibold text-slate-700">{owner.full_name ?? 'Unnamed owner'}</span><span className="mt-1 block max-w-[210px] truncate text-xs text-slate-400">{owner.email ?? 'No email'}</span></span></div></td>
                      <td className="px-3 py-4 align-top"><div className="flex gap-3 text-xs text-slate-500"><span className="inline-flex items-center gap-1"><MapPin size={14} /> {countOf(vendor.outlets)} outlets</span><span className="inline-flex items-center gap-1"><Package size={14} /> {countOf(vendor.products)} listings</span></div></td>
                      <td className="px-3 py-4 align-top"><span className={`inline-flex items-center gap-1.5 text-xs font-semibold ${owner.kyc_status === 'approved' ? 'text-emerald-700' : owner.kyc_status === 'pending' ? 'text-amber-700' : 'text-slate-400'}`}><span className="h-1.5 w-1.5 rounded-full bg-current" />{owner.kyc_status ?? 'unverified'}</span></td>
                      <td className="px-3 py-4 align-top"><StatusBadge status={vendor.status} /></td>
                      <td className="whitespace-nowrap px-3 py-4 align-top text-xs text-slate-500">{format(new Date(vendor.created_at), 'd MMM yyyy')}</td>
                      <td className="px-5 py-4 align-top text-right"><button type="button" onClick={() => setActiveVendor(vendor)} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-500 opacity-70 transition hover:border-[#8bcfbe] hover:text-[#087f66] group-hover:opacity-100">Review <ChevronRight size={14} /></button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-4 text-xs text-slate-400 sm:flex-row sm:items-center sm:justify-between">
            <span>{total === 0 ? 'No vendors to display' : `Showing ${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, total)} of ${total}`}</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page === 1 || loading} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"><ChevronLeft size={16} /></button>
              <span className="min-w-[75px] text-center font-semibold text-slate-600">Page {page} of {pageCount}</span>
              <button type="button" onClick={() => setPage((current) => Math.min(pageCount, current + 1))} disabled={page === pageCount || loading} className="rounded-lg border border-slate-200 bg-white p-2 text-slate-500 disabled:cursor-not-allowed disabled:opacity-40"><ChevronRight size={16} /></button>
            </div>
          </div>
        </section>
      </div>

      {activeVendor && <VendorDrawer vendor={activeVendor} busyAction={busyAction} onClose={() => setActiveVendor(null)} onAction={(action) => void handleAction(activeVendor, action)} onCopy={() => void copyVendorId(activeVendor.id)} approvedRecs={approvedRecs} selectedRecommendation={selectedRec[activeVendor.id] ?? ''} linkingRecommendation={linkingVendor === activeVendor.id} onSelectRecommendation={(value) => setSelectedRec((current) => ({ ...current, [activeVendor.id]: value }))} onLinkRecommendation={() => void handleLinkRecommendation(activeVendor.id)} />}
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon, accent, helper }: { label: string; value: number; icon: typeof Building2; accent: 'slate' | 'amber' | 'green' | 'rose'; helper?: string }) {
  const accents = { slate: 'bg-slate-100 text-slate-600', amber: 'bg-amber-50 text-amber-700', green: 'bg-[#e8f5f0] text-[#087f66]', rose: 'bg-rose-50 text-rose-700' };
  return <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-[0_8px_28px_rgba(38,65,57,0.04)]"><div className="flex items-start justify-between"><span className="text-sm font-semibold text-slate-500">{label}</span><span className={`rounded-xl p-2.5 ${accents[accent]}`}><Icon size={17} /></span></div><p className="mt-4 text-3xl font-bold tracking-[-0.05em] text-slate-800">{value.toLocaleString()}</p>{helper && <p className="mt-1 text-xs font-medium text-slate-400">{helper}</p>}</div>;
}

function BatchButton({ label, icon: Icon, onClick, disabled, tone = 'default' }: { label: string; icon: typeof Check; onClick: () => void; disabled: boolean; tone?: 'default' | 'danger' }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition disabled:cursor-wait disabled:opacity-50 ${tone === 'danger' ? 'border-rose-200 bg-white text-rose-700 hover:bg-rose-50' : 'border-[#bfe6d9] bg-white text-[#087f66] hover:bg-[#e8f5f0]'}`}><Icon size={14} /> {label}</button>;
}

function VendorDrawer({ vendor, busyAction, onClose, onAction, onCopy, approvedRecs, selectedRecommendation, linkingRecommendation, onSelectRecommendation, onLinkRecommendation }: { vendor: VendorData; busyAction: string | null; onClose: () => void; onAction: (action: ActionType) => void; onCopy: () => void; approvedRecs: ApprovedRec[]; selectedRecommendation: string; linkingRecommendation: boolean; onSelectRecommendation: (value: string) => void; onLinkRecommendation: () => void }) {
  const owner = ownerOf(vendor);
  const actionBusy = busyAction?.endsWith(`:${vendor.id}`);
  return <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/30 backdrop-blur-[2px]" role="dialog" aria-modal="true" aria-label={`${vendor.name} details`} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <aside className="flex h-full w-full max-w-[480px] flex-col overflow-y-auto bg-white shadow-2xl">
      <div className="flex items-start justify-between border-b border-slate-100 px-6 py-5"><div><p className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#087f66]">Vendor profile</p><h2 className="mt-1 text-xl font-bold tracking-[-0.03em] text-slate-800">{vendor.name}</h2><p className="mt-1 text-xs text-slate-400">/{vendor.slug}</p></div><button type="button" onClick={onClose} aria-label="Close vendor details" className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={19} /></button></div>
      <div className="flex-1 space-y-6 px-6 py-6">
        <div className="flex items-center justify-between"><StatusBadge status={vendor.status} /><span className="text-xs text-slate-400">Added {format(new Date(vendor.created_at), 'd MMM yyyy')}</span></div>
        <div className="rounded-2xl bg-[#f3faf7] p-4"><p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-400">Vendor ID</p><div className="mt-2 flex items-center justify-between gap-3"><code className="truncate text-xs text-slate-700">{vendor.id}</code><button type="button" onClick={onCopy} className="shrink-0 rounded-lg bg-white p-2 text-[#087f66] shadow-sm hover:bg-[#e8f5f0]" aria-label="Copy vendor ID"><Copy size={15} /></button></div></div>
        <div><h3 className="mb-3 text-sm font-bold text-slate-800">Owner & verification</h3><div className="flex items-center gap-3 rounded-xl border border-slate-100 p-3"><div className="flex h-10 w-10 items-center justify-center rounded-full bg-[#e5f4ef] text-sm font-bold text-[#087f66]">{initials(owner.full_name ?? 'Vendor owner')}</div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-700">{owner.full_name ?? 'Unnamed owner'}</p><p className="truncate text-xs text-slate-400">{owner.email ?? 'No email'}</p></div><span className="ml-auto shrink-0 text-right text-[11px] font-semibold text-slate-500">KYC<br /><span className={owner.kyc_status === 'approved' ? 'text-emerald-700' : 'text-amber-700'}>{owner.kyc_status ?? 'unverified'}</span></span></div></div>
        <div><h3 className="mb-3 text-sm font-bold text-slate-800">Operating footprint</h3><div className="grid grid-cols-2 gap-3"><Metric icon={MapPin} label="Outlets" value={countOf(vendor.outlets)} /><Metric icon={Package} label="Listings" value={countOf(vendor.products)} /></div></div>
        <div><h3 className="mb-2 text-sm font-bold text-slate-800">Business details</h3><dl className="divide-y divide-slate-100 rounded-xl border border-slate-100 text-sm"><DetailRow label="Business type" value={vendor.business_type?.replaceAll('_', ' ') ?? 'Not provided'} /><DetailRow label="Approved on" value={vendor.approved_at ? format(new Date(vendor.approved_at), 'd MMM yyyy') : 'Not approved'} /><DetailRow label="Review note" value={vendor.rejection_reason ?? 'No note recorded'} /></dl></div>
        {vendor.status === 'approved' && approvedRecs.length > 0 && <div><h3 className="mb-2 text-sm font-bold text-slate-800">Recommendation attribution</h3><p className="mb-2 text-xs leading-5 text-slate-400">Link an approved customer recommendation to open its 90-day commission window.</p><div className="flex gap-2"><select value={selectedRecommendation} onChange={(event) => onSelectRecommendation(event.target.value)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-600"><option value="">Select recommendation…</option>{approvedRecs.map((recommendation) => <option key={recommendation.id} value={recommendation.id}>{recommendation.vendor_name}</option>)}</select><button type="button" onClick={onLinkRecommendation} disabled={linkingRecommendation || !selectedRecommendation} className="rounded-xl bg-blue-50 px-3 py-2.5 text-xs font-semibold text-blue-700 disabled:opacity-40">{linkingRecommendation ? 'Linking…' : 'Link'}</button></div></div>}
        {vendor.description && <div><h3 className="mb-2 text-sm font-bold text-slate-800">Description</h3><p className="rounded-xl bg-slate-50 p-3 text-sm leading-6 text-slate-500">{vendor.description}</p></div>}
      </div>
      <div className="border-t border-slate-100 px-6 py-5"><div className="flex flex-wrap gap-2">{vendor.status === 'pending' && <><DrawerAction label="Approve vendor" icon={Check} onClick={() => onAction('approve')} tone="primary" disabled={Boolean(actionBusy)} /><DrawerAction label="Reject" icon={XCircle} onClick={() => onAction('reject')} tone="danger" disabled={Boolean(actionBusy)} /></>}{vendor.status === 'approved' && <DrawerAction label="Suspend vendor" icon={Archive} onClick={() => onAction('suspend')} tone="danger" disabled={Boolean(actionBusy)} />}{vendor.status === 'suspended' && <DrawerAction label="Reactivate vendor" icon={RefreshCw} onClick={() => onAction('unsuspend')} tone="primary" disabled={Boolean(actionBusy)} />}<button type="button" onClick={onClose} className="ml-auto rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-500 hover:bg-slate-50">Close</button></div></div>
    </aside>
  </div>;
}

function Metric({ icon: Icon, label, value }: { icon: typeof MapPin; label: string; value: number }) {
  return <div className="rounded-xl border border-slate-100 bg-white p-3"><Icon size={16} className="text-[#087f66]" /><p className="mt-3 text-2xl font-bold text-slate-800">{value}</p><p className="text-xs text-slate-400">{label}</p></div>;
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-4 px-3 py-2.5"><dt className="text-xs text-slate-400">{label}</dt><dd className="max-w-[60%] text-right text-xs font-semibold capitalize text-slate-600">{value}</dd></div>;
}

function DrawerAction({ label, icon: Icon, onClick, tone, disabled }: { label: string; icon: typeof Check; onClick: () => void; tone: 'primary' | 'danger'; disabled: boolean }) {
  return <button type="button" onClick={onClick} disabled={disabled} className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${tone === 'primary' ? 'bg-[#087f66] text-white hover:bg-[#05634f]' : 'border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100'}`}><Icon size={16} /> {label}</button>;
}
