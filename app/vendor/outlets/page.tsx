'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowRight, CirclePlus, Copy, Eye, Landmark, MapPinned, Pencil, Store, X } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { StatusBadge } from '@/components/ui/badge';
import OutletForm from '@/components/vendor/outlet-form';
import CompactFilterBar from '@/components/vendor/compact-filter-bar';
import CompactThumbnail from '@/components/vendor/compact-thumbnail';
import PaginationControls from '@/components/vendor/pagination-controls';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import OutletManagerPanel from '@/components/vendor/outlet-manager-panel';
import { outletLocation, outletShortName, outletIdLabel } from '@/lib/outlet-display';

interface OutletData { id: string; display_id?: string; name: string; slug: string; city: string | null; state: string | null; postcode?: string | null; country?: string | null; lat: number | null; lng: number | null; phone: string | null; email: string | null; status: string; review_status?: string; address: string | null; coverUrl?: string | null; productsCount: number; manager?: { id: string; fullName: string; email: string } | null; }
interface Pagination { page: number; pageSize: number; total: number; totalPages: number }

export default function VendorOutletsPage() {
  const { user } = useAuth();
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

  const loadOutlets = useCallback(async (requestedPage = pagination.page) => {
    if (!vendorId) return;
    setLoading(true); setError('');
    const params = new URLSearchParams({ page: String(requestedPage), pageSize: '10', q: filters.q, state: filters.state, status: filters.status });
    const response = await fetch(`/api/vendors/${vendorId}/outlets?${params}`, { cache: 'no-store' });
    const payload = await response.json();
    if (!response.ok) { setError(payload.error?.message || 'Could not load outlets'); setLoading(false); return; }
    setOutlets(payload.data?.items || []); setStates(payload.data?.availableStates || []); setPagination(payload.data?.pagination || { page: requestedPage, pageSize: 10, total: 0, totalPages: 1 }); setLoading(false);
  }, [filters, pagination.page, vendorId]);

  useEffect(() => { loadOutlets(1); }, [filters, vendorId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function closeOutlet(outletId: string) {
    if (!vendorId || !confirm('Close this outlet? It will be hidden from customers.')) return;
    await fetch(`/api/vendors/${vendorId}/outlets/${outletId}`, { method: 'DELETE' });
    setSelectedOutlet(null); loadOutlets(pagination.page);
  }

  function clearFilters() { setFilters({ q: '', state: '', status: '' }); }
  async function copyOutletId(outletId: string) { await navigator.clipboard?.writeText(outletId); }
  function toggleSelected(outletId: string) { setAllFilteredSelected(false); setSelectedIds((current) => current.includes(outletId) ? current.filter((id) => id !== outletId) : [...current, outletId]); }
  async function applyBatch(action: string) {
    if (!vendorId) return;
    setBatchBusy(true); setBatchMessage('');
    const response = await fetch('/api/vendors/' + vendorId + '/batch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ entity: 'outlets', action, ids: selectedIds, selectAllFiltered: allFilteredSelected, filters }) });
    const payload = await response.json(); setBatchBusy(false);
    if (!response.ok) { setError(payload.error?.message || 'Batch action failed'); return; }
    setBatchMessage(payload.data?.skipped ? payload.data.updated + ' updated, ' + payload.data.skipped + ' skipped.' : payload.data?.updated + ' outlets updated.');
    setSelectedIds([]); setAllFilteredSelected(false); loadOutlets(1);
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between"><div><div className="mb-2 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700"><MapPinned size={15} /> Malaysia outlet network</div><h1 className="text-2xl font-bold tracking-tight text-gray-950">Outlets</h1><p className="mt-1 text-sm text-gray-500">A clear view of every location, from Kuala Lumpur to Kota Kinabalu.</p></div>{isOwner && <button type="button" onClick={() => { setEditingOutlet(null); setShowForm(true); }} className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-800"><CirclePlus size={17} /> Add outlet</button>}</header>

      <CompactFilterBar search={filters.q} onSearchChange={(value) => setFilters((current) => ({ ...current, q: value }))} placeholder="Search outlet ID, name or city…" selects={[{ value: filters.state, placeholder: 'All states', options: states.map((state) => ({ value: state, label: state })), onChange: (value) => setFilters((current) => ({ ...current, state: value })) }, { value: filters.status, placeholder: 'All statuses', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'closed', label: 'Closed' }], onChange: (value) => setFilters((current) => ({ ...current, status: value })) }]} onClear={clearFilters} />
      {isOwner && <BatchActionBar selectedCount={selectedIds.length} total={pagination.total} allFilteredSelected={allFilteredSelected} onSelectAllFiltered={() => { setAllFilteredSelected(true); setSelectedIds(outlets.map((outlet) => outlet.id)); }} onClear={() => { setSelectedIds([]); setAllFilteredSelected(false); setBatchMessage(''); }} onApply={applyBatch} actions={[{ value: 'activate', label: 'Activate selected' }, { value: 'close', label: 'Close selected' }]} busy={batchBusy} message={batchMessage} />}
      {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
      {loading ? <div className="grid gap-3 md:grid-cols-2">{Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-28 animate-pulse rounded-2xl bg-gray-100" />)}</div> : outlets.length === 0 ? <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center text-gray-400 shadow-sm"><Store className="mx-auto mb-3 opacity-30" size={34} /><p className="text-sm">No outlets match these filters.</p><button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-emerald-700 hover:underline">Clear filters</button></div> : <>
        <div className="flex items-center justify-between text-xs text-gray-500"><span>{pagination.total.toLocaleString()} outlets across Malaysia</span><span>10 per page</span></div>
        {isOwner && <div className="mb-3 rounded-xl border border-gray-100 bg-white px-4 py-3 text-xs text-gray-500 shadow-sm"><label className="inline-flex items-center gap-2 font-semibold"><input type="checkbox" checked={outlets.length > 0 && outlets.every((outlet) => selectedIds.includes(outlet.id))} onChange={(event) => setSelectedIds(event.target.checked ? outlets.map((outlet) => outlet.id) : [])} /> Select current page</label></div>}<section className="grid gap-3 md:grid-cols-2">{outlets.map((outlet) => <article key={outlet.id} className="group flex min-w-0 gap-4 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md">{isOwner && <div className="pt-1"><input type="checkbox" checked={selectedIds.includes(outlet.id)} onChange={() => toggleSelected(outlet.id)} aria-label={'Select ' + outlet.name} /></div>}<CompactThumbnail src={outlet.coverUrl} alt={outlet.name} kind="outlet" size="md" /><div className="min-w-0 flex-1"><div className="flex items-start justify-between gap-2"><div className="min-w-0"><button type="button" onClick={() => setSelectedOutlet(outlet)} className="block max-w-full truncate text-left font-semibold text-gray-900 hover:text-emerald-700">{outletShortName(outlet.name)}</button><p className="mt-1 flex items-center gap-1 truncate text-xs text-gray-500"><MapPinned size={12} /> {outletLocation(outlet.city, outlet.state)}</p><p className="mt-1 font-mono text-[11px] text-gray-400">{outlet.display_id || outletIdLabel(outlet.id)}</p></div><StatusBadge status={outlet.status} /></div><div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-100 pt-3"><span className="text-xs text-gray-500"><strong className="text-gray-800">{outlet.productsCount}</strong> listings</span><div className="flex items-center gap-1"><button type="button" onClick={() => setSelectedOutlet(outlet)} title="View details" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-emerald-700"><Eye size={16} /></button>{isOwner && <button type="button" onClick={() => { setEditingOutlet(outlet); setShowForm(true); }} title="Edit outlet" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-emerald-700"><Pencil size={16} /></button>}</div></div></div></article>)}</section><div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm"><PaginationControls page={pagination.page} totalPages={pagination.totalPages} total={pagination.total} pageSize={pagination.pageSize} onPageChange={(page) => { setPagination((current) => ({ ...current, page })); loadOutlets(page); }} /></div></>}

      {isOwner && (showForm || editingOutlet) && vendorId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/35 p-4"><div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl"><OutletForm vendorId={vendorId} initialData={editingOutlet ? { id: editingOutlet.id, name: editingOutlet.name, address: editingOutlet.address || undefined, city: editingOutlet.city || undefined, state: editingOutlet.state || undefined, postcode: editingOutlet.postcode || undefined, country: editingOutlet.country || undefined, phone: editingOutlet.phone || undefined, email: editingOutlet.email || undefined, lat: editingOutlet.lat || undefined, lng: editingOutlet.lng || undefined } : undefined} onSuccess={() => { setShowForm(false); setEditingOutlet(null); loadOutlets(pagination.page); }} onClose={() => { setShowForm(false); setEditingOutlet(null); }} /></div></div>}

      {selectedOutlet && <div className="fixed inset-0 z-40 bg-gray-950/20" onClick={() => setSelectedOutlet(null)}><aside onClick={(event) => event.stopPropagation()} className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white p-6 shadow-2xl"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Outlet details</p><h2 className="mt-1 text-xl font-bold text-gray-950">{outletShortName(selectedOutlet.name)}</h2><p className="mt-1 text-xs text-gray-500">{outletLocation(selectedOutlet.city, selectedOutlet.state)}</p></div><button type="button" onClick={() => setSelectedOutlet(null)} className="rounded-lg p-2 text-gray-400 hover:bg-gray-100"><X size={18} /></button></div><div className="mt-5"><CompactThumbnail src={selectedOutlet.coverUrl} alt={selectedOutlet.name} kind="outlet" size="md" /></div><div className="mt-5 space-y-3 text-sm"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Outlet ID</p><div className="mt-1 flex items-center justify-between gap-2"><p className="break-all font-mono text-xs font-semibold text-gray-900">{selectedOutlet.display_id || selectedOutlet.id}</p><button type="button" onClick={() => copyOutletId(selectedOutlet.display_id || selectedOutlet.id)} title="Copy outlet ID" className="shrink-0 rounded-lg p-2 text-gray-500 hover:bg-white hover:text-emerald-700"><Copy size={15} /></button></div></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Location</p><p className="mt-1 font-semibold text-gray-900">{outletLocation(selectedOutlet.city, selectedOutlet.state)}</p><p className="mt-1 text-gray-500">{selectedOutlet.address || 'No address added yet.'}</p></div>{isOwner && vendorId && <OutletManagerPanel vendorId={vendorId} outletId={selectedOutlet.id} manager={selectedOutlet.manager} onChanged={() => { setSelectedOutlet(null); loadOutlets(pagination.page); }} />}<div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Listings</p><p className="mt-1 font-semibold text-gray-900">{selectedOutlet.productsCount}</p></div><div className="rounded-xl bg-gray-50 p-3"><p className="text-xs text-gray-500">Status</p><div className="mt-1"><StatusBadge status={selectedOutlet.status} /></div></div></div>{selectedOutlet.phone && <p className="text-gray-600">Phone: {selectedOutlet.phone}</p>}{selectedOutlet.email && <p className="text-gray-600">Email: {selectedOutlet.email}</p>}{selectedOutlet.lat && selectedOutlet.lng && <a className="inline-flex items-center gap-1 font-semibold text-emerald-700 hover:underline" href={'https://www.google.com/maps/dir/?api=1&destination=' + selectedOutlet.lat + ',' + selectedOutlet.lng} target="_blank" rel="noreferrer"><Landmark size={15} /> Open directions <ArrowRight size={15} /></a>}</div><div className="mt-7 flex gap-2">{isOwner && <button type="button" onClick={() => { setEditingOutlet(selectedOutlet); setSelectedOutlet(null); setShowForm(true); }} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white"><Pencil size={15} /> Edit outlet</button>}{isOwner && selectedOutlet.status === 'active' && <button type="button" onClick={() => closeOutlet(selectedOutlet.id)} className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600">Close</button>}</div></aside></div>}
    </div>
  );
}
