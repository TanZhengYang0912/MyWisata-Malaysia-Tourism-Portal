'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarDays, Check, ChevronRight, CirclePlus, Clock3, Eye, MapPin, Save, Search, SlidersHorizontal, Users, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import SlotForm from '@/components/vendor/slot-form';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { createClient } from '@/lib/supabase/client';
import { outletLocation, outletShortName, outletIdLabel } from '@/lib/outlet-display';
import { useActionFeedback } from '@/components/providers/action-feedback';

type Tab = 'reservations' | 'availability';
type DayKey = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';
type DaySchedule = { open?: string; close?: string; closed?: boolean; note?: string };
type OperatingHours = Record<string, DaySchedule>;
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
interface Outlet { id: string; name: string; city?: string | null; state?: string | null; status: string; operating_hours?: OperatingHours | null }
interface Product { id: string; name: string; outlet_id: string; status: string; requires_booking: boolean; cover_url?: string | null }
interface Booking { id: string; display_id?: string; status: string; created_at: string; check_in_at?: string | null; customer?: { full_name?: string; email?: string }; orderItem?: { product_name?: string; quantity?: number; line_total?: number; outlets?: { id?: string; name?: string; city?: string; state?: string } }; slot?: { starts_at?: string; ends_at?: string; capacity?: number; booked?: number; outlets?: { id?: string; name?: string; city?: string; state?: string }; products?: { name?: string; cover_url?: string | null } } }
interface Slot { id: string; product_id: string; outlet_id: string; starts_at: string; ends_at: string; capacity: number; booked: number; price_override: number | null; status: string; products?: { name?: string; base_price?: number; cover_url?: string | null }; outlets?: { id?: string; name?: string; city?: string; state?: string } }

const emptyPagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };
const dayLabels: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' }, { key: 'tue', label: 'Tuesday' }, { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' }, { key: 'fri', label: 'Friday' }, { key: 'sat', label: 'Saturday' }, { key: 'sun', label: 'Sunday' },
];

function dateLabel(value?: string) { return value ? format(new Date(value), 'd MMM yyyy, HH:mm') : 'No date'; }
function outletLabel(outlet?: Outlet | null) { return outlet ? `${outletShortName(outlet.name)} · ${outletLocation(outlet.city, outlet.state)}` : 'All outlets'; }
function scheduleFor(outlet?: Outlet | null): Record<DayKey, DaySchedule> {
  return dayLabels.reduce((result, day) => {
    result[day.key] = { open: outlet?.operating_hours?.[day.key]?.open || '09:00', close: outlet?.operating_hours?.[day.key]?.close || '18:00', closed: Boolean(outlet?.operating_hours?.[day.key]?.closed), note: outlet?.operating_hours?.[day.key]?.note || '' };
    return result;
  }, {} as Record<DayKey, DaySchedule>);
}
function exceptionEntries(outlet?: Outlet | null) {
  return Object.entries(outlet?.operating_hours || {}).filter(([key]) => /^\d{4}-\d{2}-\d{2}$/.test(key)).map(([date, value]) => ({ date, ...value }));
}
function groupedBookings(bookings: Booking[]) {
  const groups = new Map<string, { name: string; city: string; bookings: Booking[] }>();
  [...bookings].sort((a, b) => new Date(a.slot?.starts_at || 0).getTime() - new Date(b.slot?.starts_at || 0).getTime()).forEach((booking) => {
    const name = outletShortName(booking.slot?.outlets?.name || booking.orderItem?.outlets?.name);
    const city = outletLocation(booking.slot?.outlets?.city, booking.slot?.outlets?.state);
    const key = `${name}|${city}`;
    if (!groups.has(key)) groups.set(key, { name, city, bookings: [] });
    groups.get(key)?.bookings.push(booking);
  });
  return [...groups.values()];
}

export default function VendorBookingsPage() {
  const { user } = useAuth();
  const { showFeedback } = useActionFeedback();
  const vendorId = user?.activeVendorId;
  const supabase = useMemo(() => createClient(), []);
  const [tab, setTab] = useState<Tab>('reservations');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '', outletId: '', productId: '' });
  const [scheduleOutletId, setScheduleOutletId] = useState('');
  const [scheduleDraft, setScheduleDraft] = useState<Record<DayKey, DaySchedule>>(scheduleFor());
  const [exceptions, setExceptions] = useState<{ date: string; open?: string; close?: string; closed?: boolean; note?: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [metadataLoading, setMetadataLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');

  const selectedScheduleOutlet = outlets.find((outlet) => outlet.id === scheduleOutletId) || outlets[0];
  const selectedOutletProducts = products.filter((product) => product.outlet_id === (selectedScheduleOutlet?.id || '') && product.requires_booking && product.status === 'active');
  const filteredProducts = filters.outletId ? products.filter((product) => product.outlet_id === filters.outletId && product.requires_booking) : products.filter((product) => product.requires_booking);

  useEffect(() => {
    if (!vendorId) return;
    setMetadataLoading(true);
    Promise.all([
      fetch(`/api/vendors/${vendorId}/outlets?page=1&pageSize=24&sort=name`, { cache: 'no-store' }).then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error?.message || 'Could not load outlets');
        return (payload.data?.items || []) as Outlet[];
      }),
      supabase.from('products').select('id,name,outlet_id,status,requires_booking,cover_url').eq('vendor_id', vendorId).order('name').then(({ data, error: productError }) => {
        if (productError) throw productError;
        return (data || []) as Product[];
      }),
    ]).then(([outletItems, productItems]) => {
      setOutlets(outletItems.map((outlet) => ({ ...outlet, name: `${outletShortName(outlet.name)} · ${outletIdLabel(outlet.id)}` })));
      setProducts(productItems);
      setScheduleOutletId((current) => current || outletItems[0]?.id || '');
    }).catch((requestError) => setError(requestError instanceof Error ? requestError.message : 'Could not load booking setup')).finally(() => setMetadataLoading(false));
  }, [supabase, vendorId]);

  useEffect(() => {
    setScheduleDraft(scheduleFor(selectedScheduleOutlet));
    setExceptions(exceptionEntries(selectedScheduleOutlet));
  }, [selectedScheduleOutlet]);

  const loadData = useCallback(async (requestedPage = 1) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: '10', q: filters.q, status: filters.status, from: filters.from, to: filters.to });
    if (filters.outletId) params.set('outletId', filters.outletId);
    if (filters.productId) params.set('productId', filters.productId);
    const endpoint = tab === 'reservations' ? 'bookings' : 'slots';
    try {
      const response = await fetch(`/api/vendors/${vendorId}/${endpoint}?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || `Could not load ${endpoint}`);
      setPagination(payload.data?.pagination || emptyPagination);
      if (tab === 'reservations') { setBookings(payload.data?.items || []); setStats(payload.data?.stats || {}); } else setSlots(payload.data?.items || []);
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not load bookings'); } finally { setLoading(false); }
  }, [filters, tab, vendorId]);

  useEffect(() => { loadData(1); }, [loadData]);

  async function checkIn(bookingId: string) {
    if (!vendorId) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, { method: 'POST' });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || 'Could not check in booking'; setError(message); showFeedback('error', message); return; }
      showFeedback('success', 'Booking checked in successfully.');
      setSelectedBooking(null); loadData(pagination.page);
    } catch { setError('Could not check in booking.'); showFeedback('error', 'Could not check in booking. Please try again.'); }
  }
  async function cancelSlot(slotId: string) {
    if (!vendorId || !confirm('Cancel this slot?')) return;
    try {
      const response = await fetch(`/api/vendors/${vendorId}/slots/${slotId}`, { method: 'DELETE' });
      if (!response.ok) { const payload = await response.json(); const message = payload.error?.message || 'Could not cancel slot'; setError(message); showFeedback('error', message); return; }
      showFeedback('success', 'Booking slot cancelled.');
      loadData(pagination.page);
    } catch { setError('Could not cancel slot.'); showFeedback('error', 'Could not cancel slot. Please try again.'); }
  }
  async function saveSchedule() {
    if (!vendorId || !selectedScheduleOutlet) return;
    setSavingSchedule(true); setSaveMessage(''); setError('');
    const operatingHours: OperatingHours = { ...scheduleDraft };
    exceptions.filter((exception) => exception.date).forEach((exception) => { operatingHours[exception.date] = { open: exception.open || '09:00', close: exception.close || '18:00', closed: Boolean(exception.closed), note: exception.note || '' }; });
    try {
      const response = await fetch(`/api/vendors/${vendorId}/outlets/${selectedScheduleOutlet.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ operatingHours }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || 'Could not save opening hours');
      setOutlets((current) => current.map((outlet) => outlet.id === selectedScheduleOutlet.id ? { ...outlet, operating_hours: operatingHours } : outlet));
      setSaveMessage('Opening hours saved to Supabase.');
    } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Could not save opening hours'); } finally { setSavingSchedule(false); }
  }
  function clearFilters() { setFilters({ q: '', status: '', from: '', to: '', outletId: '', productId: '' }); setSelectedIds([]); setAllFilteredSelected(false); }
  function toggleSelected(id: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const entity = tab === 'reservations' ? 'bookings' : 'slots';
    const response = await fetch(`/api/vendors/${vendorId}/batch`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity, action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || 'Batch action failed'); return; }
    setBatchMessage(payload.data?.skipped ? `${payload.data.updated} updated, ${payload.data.skipped} skipped.` : `${payload.data?.updated || 0} ${entity} updated.`);
    setSelectedIds([]); setAllFilteredSelected(false); loadData(1);
  }

  function switchTab(nextTab: Tab) { setTab(nextTab); setPagination(emptyPagination); setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); setFilters((current) => ({ ...current, status: '', q: '' })); }
  function setOutletFilter(outletId: string) { setFilters((current) => ({ ...current, outletId, productId: '' })); if (tab === 'availability' && outletId) setScheduleOutletId(outletId); }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-primary"><CalendarDays size={15} /> Booking operations</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Bookings</h1><p className="mt-1 max-w-2xl text-sm text-gray-500">Manage reservations by outlet and keep every opening hour visible in one weekly view.</p></div>
        <button type="button" onClick={() => setShowSlotForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary/90"><CirclePlus size={17} /> Add date slot</button>
      </header>

      <div className="grid gap-3 sm:grid-cols-4"><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Confirmed</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.confirmed || 0}</p><p className="mt-1 text-xs text-gray-400">Current filter</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Checked in</p><p className="mt-1 text-2xl font-bold text-primary">{stats.checked_in || 0}</p><p className="mt-1 text-xs text-gray-400">Current filter</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Cancelled</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.cancelled || 0}</p><p className="mt-1 text-xs text-gray-400">Current filter</p></div><div className="rounded-2xl border border-primary/10 bg-secondary p-4 shadow-sm"><p className="text-xs text-primary">Outlets managed</p><p className="mt-1 text-2xl font-bold text-primary">{outlets.length}</p><p className="mt-1 text-xs text-primary">Choose an outlet below</p></div></div>

      <div className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"><div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between"><div className="flex rounded-xl bg-gray-100 p-1"><button type="button" onClick={() => switchTab('reservations')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'reservations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}><Users size={15} /> Reservations</button><button type="button" onClick={() => switchTab('availability')} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'availability' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}><Clock3 size={15} /> Availability</button></div><div className="grid flex-1 gap-2 sm:grid-cols-2 xl:ml-4 xl:flex"><label className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder={tab === 'reservations' ? 'Search booking ID, guest or experience' : 'Search experience or outlet'} className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-primary" /></label><select value={filters.outletId} onChange={(event) => setOutletFilter(event.target.value)} className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-primary xl:w-52"><option value="">All outlets</option>{outlets.map((outlet) => <option key={outlet.id} value={outlet.id}>{outletShortName(outlet.name)} · {outletLocation(outlet.city, outlet.state)}</option>)}</select><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-primary xl:w-36"><option value="">All statuses</option>{(tab === 'reservations' ? ['confirmed', 'checked_in', 'no_show', 'cancelled'] : ['available', 'full', 'cancelled', 'expired']).map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></div></div><div className="mt-2 flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3"><SlidersHorizontal size={15} className="text-gray-400" /><select value={filters.productId} onChange={(event) => setFilters((current) => ({ ...current, productId: event.target.value }))} className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600 outline-none focus:border-primary"><option value="">All experiences</option>{filteredProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600" /><span className="text-xs text-gray-400">to</span><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600" />{(filters.q || filters.status || filters.from || filters.to || filters.outletId || filters.productId) && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-primary hover:underline">Clear filters</button>}</div></div>

      {tab === 'reservations' && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(bookings.map((booking) => booking.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'check_in', label: 'Check in selected' }, { value: 'cancel', label: 'Cancel selected' }]} busy={batchBusy} message={batchMessage} />}
      {tab === 'availability' && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(slots.map((slot) => slot.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'cancel', label: 'Cancel selected slots' }, { value: 'restore', label: 'Restore selected slots' }]} busy={batchBusy} message={batchMessage} />}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      {tab === 'reservations' ? <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-5 py-3"><label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={bookings.length > 0 && bookings.every((booking) => selectedIds.includes(booking.id))} onChange={(event) => setSelectedIds(event.target.checked ? bookings.map((booking) => booking.id) : [])} /> Select current page</label><span className="text-xs text-gray-400">{pagination.total.toLocaleString()} reservations · grouped by outlet</span></div>{loading ? <div className="space-y-3 p-5">{Array.from({ length: 5 }).map((_, index) => <div key={index} className="h-20 animate-pulse rounded-xl bg-gray-100" />)}</div> : <div className="space-y-5 p-4 md:p-5">{groupedBookings(bookings).map((group) => <div key={`${group.name}-${group.city}`} className="overflow-hidden rounded-2xl border border-gray-100"><div className="flex flex-col gap-1 border-b border-gray-100 bg-secondary/60 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-2"><MapPin size={16} className="text-primary" /><div><p className="font-semibold text-gray-900">{group.name}</p><p className="text-xs text-gray-500">{group.city || 'Malaysia'} · {group.bookings.length} on this page</p></div></div><span className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Outlet agenda</span></div><div className="divide-y divide-gray-100">{group.bookings.map((booking) => <article key={booking.id} className="grid gap-3 px-4 py-4 transition hover:bg-secondary/20 md:grid-cols-[32px_minmax(180px,1.2fr)_minmax(190px,1.5fr)_150px_110px_78px] md:items-center"><div><input type="checkbox" checked={selectedIds.includes(booking.id)} onChange={() => toggleSelected(booking.id)} aria-label={`Select booking ${booking.display_id || booking.id.slice(0, 8)}`} /></div><div className="min-w-0"><button type="button" onClick={() => setSelectedBooking(booking)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-primary">{booking.customer?.full_name || 'Guest'}</button><p className="mt-1 truncate text-xs text-gray-500">{booking.customer?.email || 'No email'}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{booking.orderItem?.product_name || booking.slot?.products?.name || 'Experience'}</p><p className="mt-1 text-xs text-gray-500">Qty {booking.orderItem?.quantity || 1} · {booking.slot?.starts_at ? format(new Date(booking.slot.starts_at), 'EEE, d MMM · HH:mm') : 'No time'}</p></div><div className="text-xs text-gray-600"><p className="font-medium text-gray-800">Booking ID</p><p className="mt-1 font-mono text-gray-500">{booking.display_id || `#${booking.id.slice(0, 8)}`}</p></div><div><StatusBadge status={booking.status} /></div><div className="flex items-center gap-1 md:justify-end"><button type="button" title="View reservation" onClick={() => setSelectedBooking(booking)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-primary"><Eye size={16} /></button>{booking.status === 'confirmed' && <button type="button" title="Check in" onClick={() => checkIn(booking.id)} className="rounded-lg p-2 text-primary hover:bg-secondary"><Check size={16} /></button>}</div></article>)}</div></div>)}{!bookings.length && <div className="px-6 py-16 text-center text-sm text-gray-400">No reservations match these filters.</div>}</div>}{!loading && <PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadData(page); }} />}</section> : <AvailabilityPanel metadataLoading={metadataLoading} outlets={outlets} products={selectedOutletProducts} selectedOutlet={selectedScheduleOutlet} scheduleDraft={scheduleDraft} setScheduleDraft={setScheduleDraft} exceptions={exceptions} setExceptions={setExceptions} saveSchedule={saveSchedule} savingSchedule={savingSchedule} saveMessage={saveMessage} setScheduleOutletId={(id) => { setScheduleOutletId(id); setFilters((current) => ({ ...current, outletId: id, productId: '' })); }} slots={slots} loading={loading} selectedIds={selectedIds} setSelectedIds={setSelectedIds} toggleSelected={toggleSelected} cancelSlot={cancelSlot} pagination={pagination} loadData={loadData} />}

      {showSlotForm && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><SlotForm vendorId={vendorId} onSuccess={() => { setShowSlotForm(false); setTab('availability'); loadData(1); }} onClose={() => setShowSlotForm(false)} /></div></div>}
      {selectedBooking && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedBooking(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Reservation details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedBooking.customer?.full_name || 'Guest'}</h2><p className="mt-1 font-mono text-xs text-gray-500">{selectedBooking.display_id || `#${selectedBooking.id}`}</p></div><button type="button" onClick={() => setSelectedBooking(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Experience</p><p className="mt-1 font-semibold text-gray-900">{selectedBooking.orderItem?.product_name || selectedBooking.slot?.products?.name}</p><p className="mt-1 text-gray-500">{dateLabel(selectedBooking.slot?.starts_at)} – {selectedBooking.slot?.ends_at ? format(new Date(selectedBooking.slot.ends_at), 'HH:mm') : ''}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Guests</p><p className="mt-1 font-semibold text-gray-900">{selectedBooking.orderItem?.quantity || 1}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedBooking.status} /></div></div></div><p className="text-gray-600">{selectedBooking.customer?.email || 'No email provided'}</p><p className="text-gray-600">Outlet: {selectedBooking.slot?.outlets?.name || selectedBooking.orderItem?.outlets?.name || 'Malaysia outlet'}</p></div><div className="mt-7 flex gap-2">{selectedBooking.status === 'confirmed' && <button type="button" onClick={() => checkIn(selectedBooking.id)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><Check size={15} /> Check in</button>}<button type="button" onClick={() => setSelectedBooking(null)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">Close</button></div></aside></div>}
    </div>
  );
}

interface AvailabilityPanelProps {
  metadataLoading: boolean; outlets: Outlet[]; products: Product[]; selectedOutlet?: Outlet; scheduleDraft: Record<DayKey, DaySchedule>; setScheduleDraft: React.Dispatch<React.SetStateAction<Record<DayKey, DaySchedule>>>; exceptions: { date: string; open?: string; close?: string; closed?: boolean; note?: string }[]; setExceptions: React.Dispatch<React.SetStateAction<{ date: string; open?: string; close?: string; closed?: boolean; note?: string }[]>>; saveSchedule: () => void; savingSchedule: boolean; saveMessage: string; setScheduleOutletId: (id: string) => void; slots: Slot[]; loading: boolean; selectedIds: string[]; setSelectedIds: React.Dispatch<React.SetStateAction<string[]>>; toggleSelected: (id: string) => void; cancelSlot: (id: string) => void; pagination: Pagination; loadData: (page?: number) => void;
}

function AvailabilityPanel({ metadataLoading, outlets, products, selectedOutlet, scheduleDraft, setScheduleDraft, exceptions, setExceptions, saveSchedule, savingSchedule, saveMessage, setScheduleOutletId, slots, loading, selectedIds, setSelectedIds, toggleSelected, cancelSlot, pagination, loadData }: AvailabilityPanelProps) {
  return <div className="grid gap-5 xl:grid-cols-[250px_minmax(0,1fr)]"><aside className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm"><div className="flex items-center justify-between px-2 pb-3"><div><p className="text-sm font-semibold text-gray-900">Your outlets</p><p className="text-xs text-gray-500">Select one to edit</p></div><MapPin size={17} className="text-primary" /></div><div className="space-y-1">{metadataLoading ? <div className="space-y-2 p-2">{[1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-xl bg-gray-100" />)}</div> : outlets.map((outlet) => <button type="button" key={outlet.id} onClick={() => setScheduleOutletId(outlet.id)} className={`flex w-full items-center justify-between rounded-xl px-3 py-3 text-left transition ${selectedOutlet?.id === outlet.id ? 'bg-secondary text-primary ring-1 ring-primary/20' : 'text-gray-600 hover:bg-gray-50'}`}><span className="min-w-0"><span className="block truncate text-sm font-semibold">{outlet.name}</span><span className="mt-1 block truncate text-xs text-gray-500">{outlet.city || outlet.state || 'Malaysia'}</span></span><ChevronRight size={15} className="shrink-0" /></button>)}</div></aside><div className="space-y-5"><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-3 border-b border-gray-100 pb-4 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Weekly recurring schedule</p><h2 className="mt-1 text-xl font-bold text-gray-950">{outletLabel(selectedOutlet)}</h2><p className="mt-1 text-sm text-gray-500">Set the default opening hours for this outlet. Changes are saved to Supabase.</p></div><button type="button" onClick={saveSchedule} disabled={savingSchedule || !selectedOutlet} className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-50"><Save size={15} /> {savingSchedule ? 'Saving…' : 'Save hours'}</button></div><div className="mt-4 space-y-2">{dayLabels.map((day) => { const value = scheduleDraft[day.key] || {}; return <div key={day.key} className="grid gap-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-[140px_100px_100px_1fr_auto] sm:items-center"><span className="text-sm font-semibold text-gray-800">{day.label}</span><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={!value.closed} onChange={(event) => setScheduleDraft((current) => ({ ...current, [day.key]: { ...current[day.key], closed: !event.target.checked } }))} /> Open</label><input type="time" disabled={value.closed} value={value.open || '09:00'} onChange={(event) => setScheduleDraft((current) => ({ ...current, [day.key]: { ...current[day.key], open: event.target.value } }))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm disabled:opacity-40" /><input type="time" disabled={value.closed} value={value.close || '18:00'} onChange={(event) => setScheduleDraft((current) => ({ ...current, [day.key]: { ...current[day.key], close: event.target.value } }))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm disabled:opacity-40" /><span className={`text-xs font-semibold ${value.closed ? 'text-gray-400' : 'text-primary'}`}>{value.closed ? 'Closed' : `${value.open || '09:00'} – ${value.close || '18:00'}`}</span></div>; })}</div>{saveMessage && <p className="mt-3 text-xs font-semibold text-primary">{saveMessage}</p>}</div><div className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-700">Date exceptions</p><h2 className="mt-1 text-lg font-bold text-gray-950">Holiday and one-off hours</h2><p className="mt-1 text-sm text-gray-500">Use this for public holidays or a special opening window.</p></div><button type="button" onClick={() => setExceptions((current) => [...current, { date: '', open: '09:00', close: '18:00', closed: true, note: '' }])} className="inline-flex items-center justify-center gap-2 rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-gray-700 hover:bg-gray-50"><CirclePlus size={14} /> Add exception</button></div><div className="mt-4 space-y-2">{exceptions.map((exception, index) => <div key={`${exception.date}-${index}`} className="grid gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-3 sm:grid-cols-[145px_100px_100px_1fr_auto] sm:items-center"><input type="date" value={exception.date} onChange={(event) => setExceptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, date: event.target.value } : item))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm" /><label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={!exception.closed} onChange={(event) => setExceptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, closed: !event.target.checked } : item))} /> Open</label><input type="time" disabled={exception.closed} value={exception.open || '09:00'} onChange={(event) => setExceptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, open: event.target.value } : item))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm disabled:opacity-40" /><input type="time" disabled={exception.closed} value={exception.close || '18:00'} onChange={(event) => setExceptions((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, close: event.target.value } : item))} className="h-9 rounded-lg border border-gray-200 bg-white px-2 text-sm disabled:opacity-40" /><button type="button" onClick={() => setExceptions((current) => current.filter((_, itemIndex) => itemIndex !== index))} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600"><X size={15} /></button></div>)}{!exceptions.length && <p className="rounded-xl bg-gray-50 px-4 py-5 text-center text-sm text-gray-400">No date exceptions yet.</p>}</div></div><div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><div className="flex items-center justify-between border-b border-gray-100 bg-gray-50/70 px-5 py-3"><label className="inline-flex items-center gap-2 text-xs font-semibold text-gray-600"><input type="checkbox" checked={slots.length > 0 && slots.every((slot) => selectedIds.includes(slot.id))} onChange={(event) => setSelectedIds(event.target.checked ? slots.map((slot) => slot.id) : [])} /> Select date slots</label><span className="text-xs text-gray-400">{pagination.total.toLocaleString()} slots · {products.length} bookable experiences</span></div><div className="divide-y divide-gray-100">{loading ? <div className="space-y-3 p-5">{[1, 2, 3].map((item) => <div key={item} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : slots.map((slot) => <article key={slot.id} className="grid gap-3 px-4 py-4 md:grid-cols-[32px_minmax(190px,1.5fr)_160px_140px_100px] md:items-center"><input type="checkbox" checked={selectedIds.includes(slot.id)} onChange={() => toggleSelected(slot.id)} aria-label={`Select slot ${slot.id.slice(0, 8)}`} /><div className="min-w-0"><p className="truncate font-semibold text-gray-900">{slot.products?.name || 'Experience'}</p><p className="mt-1 text-xs text-gray-500">{dateLabel(slot.starts_at)} · #{slot.id.slice(0, 8)}</p></div><div className="text-xs text-gray-600"><p className="font-medium text-gray-800">{slot.outlets?.name || 'Outlet'}</p><p className="mt-1 text-gray-400">{slot.outlets?.city || slot.outlets?.state || ''}</p></div><div><p className="text-sm font-semibold text-gray-900">{slot.booked}/{slot.capacity}</p><StatusBadge status={slot.status} /></div><div className="flex justify-end">{slot.booked === 0 && slot.status === 'available' && <button type="button" onClick={() => cancelSlot(slot.id)} className="text-xs font-semibold text-red-600 hover:underline">Cancel</button>}</div></article>)}{!slots.length && !loading && <div className="px-6 py-16 text-center text-sm text-gray-400">No date slots match the current filters.</div>}</div><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => loadData(page)} /></div></div></div>;
}
