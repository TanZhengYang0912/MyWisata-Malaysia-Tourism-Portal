'use client';

import { useCallback, useEffect, useState } from 'react';
import { CalendarDays, Check, CirclePlus, Clock3, Eye, Search, Users, X } from 'lucide-react';
import { format } from 'date-fns';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import SlotForm from '@/components/vendor/slot-form';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';

type Tab = 'reservations' | 'availability';
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }
interface Booking { id: string; status: string; created_at: string; check_in_at?: string | null; customer?: { full_name?: string; email?: string }; orderItem?: { product_name?: string; quantity?: number; line_total?: number; outlets?: { name?: string } }; slot?: { starts_at?: string; ends_at?: string; capacity?: number; booked?: number; outlets?: { name?: string; city?: string; state?: string }; products?: { name?: string; cover_url?: string | null } } }
interface Slot { id: string; starts_at: string; ends_at: string; capacity: number; booked: number; price_override: number | null; status: string; products?: { name?: string; base_price?: number; cover_url?: string | null }; outlets?: { name?: string; city?: string; state?: string } }

const emptyPagination = { page: 1, pageSize: 10, total: 0, totalPages: 1 };

function dateLabel(value?: string) {
  return value ? format(new Date(value), 'd MMM yyyy, HH:mm') : 'No date';
}

export default function VendorBookingsPage() {
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;
  const [tab, setTab] = useState<Tab>('reservations');
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [pagination, setPagination] = useState<Pagination>(emptyPagination);
  const [stats, setStats] = useState<Record<string, number>>({});
  const [filters, setFilters] = useState({ q: '', status: '', from: '', to: '' });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [showSlotForm, setShowSlotForm] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');

  const loadData = useCallback(async (requestedPage = 1) => {
    if (!vendorId) return;
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: '10', q: filters.q, status: filters.status, from: filters.from, to: filters.to });
    const endpoint = tab === 'reservations' ? 'bookings' : 'slots';
    try {
      const response = await fetch(`/api/vendors/${vendorId}/${endpoint}?${params}`, { cache: 'no-store' });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error?.message || `Could not load ${endpoint}`);
      setPagination(payload.data?.pagination || emptyPagination);
      if (tab === 'reservations') {
        setBookings(payload.data?.items || []);
        setStats(payload.data?.stats || {});
      } else {
        setSlots(payload.data?.items || []);
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Could not load bookings');
    } finally {
      setLoading(false);
    }
  }, [filters, tab, vendorId]);

  useEffect(() => { loadData(1); }, [loadData]);

  async function checkIn(bookingId: string) {
    if (!vendorId) return;
    const response = await fetch(`/api/vendors/${vendorId}/bookings/${bookingId}/checkin`, { method: 'POST' });
    if (!response.ok) { const payload = await response.json(); setError(payload.error?.message || 'Could not check in booking'); return; }
    setSelectedBooking(null);
    loadData(pagination.page);
  }

  async function cancelSlot(slotId: string) {
    if (!vendorId || !confirm('Cancel this slot?')) return;
    const response = await fetch(`/api/vendors/${vendorId}/slots/${slotId}`, { method: 'DELETE' });
    if (!response.ok) { const payload = await response.json(); setError(payload.error?.message || 'Could not cancel slot'); return; }
    loadData(pagination.page);
  }

  function clearFilters() { setFilters({ q: '', status: '', from: '', to: '' }); }
  function toggleSelected(bookingId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(bookingId) ? current.filter((id) => id !== bookingId) : [...current, bookingId]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'bookings', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || 'Batch action failed'); return; }
    setBatchMessage(payload.data?.skipped ? payload.data.updated + ' updated, ' + payload.data.skipped + ' skipped by status.' : payload.data?.updated + ' bookings updated.');
    setSelectedIds([]); setAllFilteredSelected(false); loadData(1);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700"><CalendarDays size={15} /> Booking operations</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Bookings</h1><p className="mt-1 text-sm text-gray-500">Keep reservations and availability moving without the clutter.</p></div>
        <button type="button" onClick={() => setShowSlotForm(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><CirclePlus size={17} /> Add slot</button>
      </header>

      <div className="grid gap-3 sm:grid-cols-3"><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Confirmed</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.confirmed || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Checked in</p><p className="mt-1 text-2xl font-bold text-emerald-700">{stats.checked_in || 0}</p></div><div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm"><p className="text-xs text-gray-500">Cancelled</p><p className="mt-1 text-2xl font-bold text-gray-950">{stats.cancelled || 0}</p></div></div>

      <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-3 shadow-sm md:flex-row md:items-center md:justify-between"><div className="flex rounded-xl bg-gray-100 p-1"><button type="button" onClick={() => { setTab('reservations'); setPagination(emptyPagination); }} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'reservations' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}><Users size={15} /> Reservations</button><button type="button" onClick={() => { setTab('availability'); setPagination(emptyPagination); }} className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${tab === 'availability' ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'}`}><Clock3 size={15} /> Availability</button></div><div className="grid gap-2 sm:grid-cols-2 md:flex"><label className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} /><input value={filters.q} onChange={(event) => setFilters((current) => ({ ...current, q: event.target.value }))} placeholder={tab === 'reservations' ? 'Search booking ID, guest or experience' : 'Search experience or outlet'} className="h-10 w-full rounded-xl border border-gray-200 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 md:w-64" /></label><select value={filters.status} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))} className="h-10 rounded-xl border border-gray-200 px-3 text-sm text-gray-600 outline-none focus:border-emerald-500"><option value="">All statuses</option>{(tab === 'reservations' ? ['confirmed', 'checked_in', 'no_show', 'cancelled'] : ['available', 'full', 'cancelled', 'expired']).map((status) => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></div></div>

      <div className="flex flex-wrap items-center gap-2"><input type="date" value={filters.from} onChange={(event) => setFilters((current) => ({ ...current, from: event.target.value }))} className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600" /><span className="text-xs text-gray-400">to</span><input type="date" value={filters.to} onChange={(event) => setFilters((current) => ({ ...current, to: event.target.value }))} className="h-9 rounded-lg border border-gray-200 px-3 text-xs text-gray-600" />{(filters.q || filters.status || filters.from || filters.to) && <button type="button" onClick={clearFilters} className="text-xs font-semibold text-emerald-700 hover:underline">Clear filters</button>}</div>
      <BatchActionBar selectedCount={tab === 'reservations' ? selectedIds.length : 0} total={tab === 'reservations' ? pagination.total : 0} allFilteredSelected={tab === 'reservations' && allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(bookings.map((booking) => booking.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'check_in', label: 'Check in selected' }, { value: 'cancel', label: 'Cancel selected' }]} busy={batchBusy} message={batchMessage} />

      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      <section className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        {loading ? <div className="space-y-3 p-5">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-16 animate-pulse rounded-xl bg-gray-100" />)}</div> : tab === 'reservations' ? <>
          <div className="border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs text-gray-500"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={bookings.length > 0 && bookings.every((booking) => selectedIds.includes(booking.id))} onChange={(event) => setSelectedIds(event.target.checked ? bookings.map((booking) => booking.id) : [])} /> Select current page</label></div><div className="hidden grid-cols-[32px_minmax(190px,1.5fr)_minmax(180px,1.5fr)_minmax(140px,1fr)_120px_110px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span></span><span>Guest</span><span>Experience</span><span>Date</span><span>Status</span><span className="text-right">Action</span></div>
          <div className="divide-y divide-gray-100">{bookings.map((booking) => <article key={booking.id} className="grid gap-3 px-4 py-4 transition hover:bg-emerald-50/30 md:grid-cols-[32px_minmax(190px,1.5fr)_minmax(180px,1.5fr)_minmax(140px,1fr)_120px_110px] md:items-center md:gap-4 md:px-5"><div><input type="checkbox" checked={selectedIds.includes(booking.id)} onChange={() => toggleSelected(booking.id)} aria-label={'Select booking ' + booking.id.slice(0, 8)} /></div><div className="min-w-0"><button type="button" onClick={() => setSelectedBooking(booking)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-emerald-700">{booking.customer?.full_name || 'Guest'}</button><p className="mt-1 truncate text-xs text-gray-500">{booking.customer?.email || 'No email'} · #{booking.id.slice(0, 8)}</p></div><div className="min-w-0"><p className="truncate text-sm font-medium text-gray-800">{booking.orderItem?.product_name || booking.slot?.products?.name || 'Experience'}</p><p className="mt-1 text-xs text-gray-500">Qty {booking.orderItem?.quantity || 1} · {booking.slot?.outlets?.name || 'Malaysia outlet'}</p></div><div className="text-xs text-gray-600">{dateLabel(booking.slot?.starts_at)}</div><div><StatusBadge status={booking.status} /></div><div className="flex items-center justify-end gap-1 border-t border-gray-100 pt-3 md:border-0 md:pt-0"><button type="button" title="View reservation" onClick={() => setSelectedBooking(booking)} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-emerald-700"><Eye size={16} /></button>{booking.status === 'confirmed' && <button type="button" title="Check in" onClick={() => checkIn(booking.id)} className="rounded-lg p-2 text-emerald-700 hover:bg-emerald-50"><Check size={16} /></button>}</div></article>)}{bookings.length === 0 && <div className="px-6 py-16 text-center text-sm text-gray-400">No reservations match these filters.</div>}</div>
        </> : <>
          <div className="hidden grid-cols-[minmax(190px,1.4fr)_minmax(170px,1.3fr)_minmax(150px,1fr)_130px_100px] gap-4 border-b border-gray-100 bg-gray-50/60 px-5 py-3 text-xs font-semibold uppercase tracking-[0.12em] text-gray-500 md:grid"><span>Experience</span><span>Date & time</span><span>Outlet</span><span>Capacity</span><span className="text-right">Action</span></div>
          <div className="divide-y divide-gray-100">{slots.map((slot) => <article key={slot.id} className="grid gap-3 px-4 py-4 transition hover:bg-emerald-50/30 md:grid-cols-[minmax(190px,1.4fr)_minmax(170px,1.3fr)_minmax(150px,1fr)_130px_100px] md:items-center md:gap-4 md:px-5"><div className="min-w-0"><p className="truncate font-semibold text-gray-900">{slot.products?.name || 'Experience'}</p><p className="mt-1 text-xs text-gray-500">{slot.price_override ? `RM ${Number(slot.price_override).toFixed(2)}` : 'Base price'}</p></div><div className="text-xs text-gray-600"><p>{dateLabel(slot.starts_at)}</p><p className="mt-1 text-gray-400">until {format(new Date(slot.ends_at), 'HH:mm')}</p></div><p className="truncate text-xs text-gray-600">{slot.outlets?.name || 'Malaysia outlet'}<span className="block mt-1 text-gray-400">{slot.outlets?.city || slot.outlets?.state || ''}</span></p><div><p className="text-sm font-semibold text-gray-900">{slot.booked}/{slot.capacity}</p><StatusBadge status={slot.status} /></div><div className="flex justify-end">{slot.booked === 0 && slot.status === 'available' && <button type="button" onClick={() => cancelSlot(slot.id)} className="text-xs font-semibold text-red-600 hover:underline">Cancel</button>}</div></article>)}{slots.length === 0 && <div className="px-6 py-16 text-center text-sm text-gray-400">No availability matches these filters.</div>}</div>
        </>}
        {!loading && <PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadData(page); }} />}
      </section>

      {showSlotForm && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><SlotForm vendorId={vendorId} onSuccess={() => { setShowSlotForm(false); setTab('availability'); }} onClose={() => setShowSlotForm(false)} /></div></div>}
      {selectedBooking && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedBooking(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Reservation details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{selectedBooking.customer?.full_name || 'Guest'}</h2></div><button type="button" onClick={() => setSelectedBooking(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-6 space-y-3 text-sm"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Experience</p><p className="mt-1 font-semibold text-gray-900">{selectedBooking.orderItem?.product_name || selectedBooking.slot?.products?.name}</p><p className="mt-1 text-gray-500">{dateLabel(selectedBooking.slot?.starts_at)} – {selectedBooking.slot?.ends_at ? format(new Date(selectedBooking.slot.ends_at), 'HH:mm') : ''}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Guests</p><p className="mt-1 font-semibold text-gray-900">{selectedBooking.orderItem?.quantity || 1}</p></div><div className="rounded-xl bg-gray-50 p-4"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedBooking.status} /></div></div></div><p className="text-gray-600">{selectedBooking.customer?.email || 'No email provided'}</p><p className="text-gray-600">Outlet: {selectedBooking.slot?.outlets?.name || selectedBooking.orderItem?.outlets?.name || 'Malaysia outlet'}</p></div><div className="mt-7 flex gap-2">{selectedBooking.status === 'confirmed' && <button type="button" onClick={() => checkIn(selectedBooking.id)} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Check size={15} /> Check in</button>}<button type="button" onClick={() => setSelectedBooking(null)} className="rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-semibold text-gray-600">Close</button></div></aside></div>}
    </div>
  );
}
