'use client';

import { useEffect, useState } from 'react';
import { UserRound, UserRoundPlus, UserRoundX } from 'lucide-react';

interface Manager { id: string; fullName: string; email: string }

interface Props {
  vendorId: string;
  outletId: string;
  manager?: Manager | null;
  onChanged: () => void;
}

export default function OutletManagerPanel({ vendorId, outletId, manager, onChanged }: Props) {
  const [eligibleManagers, setEligibleManagers] = useState<Manager[]>([]);
  const [selectedUserId, setSelectedUserId] = useState(manager?.id || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/vendors/${vendorId}/outlet-managers`, { cache: 'no-store' })
      .then((response) => response.json())
      .then((payload) => { if (!cancelled) setEligibleManagers(payload.data?.eligibleManagers || []); })
      .catch(() => { if (!cancelled) setMessage('Could not load manager accounts.'); });
    return () => { cancelled = true; };
  }, [vendorId]);

  async function assign() {
    if (!selectedUserId) return;
    setBusy(true); setMessage('');
    const response = await fetch(`/api/vendors/${vendorId}/outlet-managers`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outletId, userId: selectedUserId }) });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(payload.error?.message || 'Could not assign manager.'); return; }
    setMessage('Manager assigned.'); onChanged();
  }

  async function remove() {
    if (!manager || !confirm('Remove this Outlet Manager from the outlet?')) return;
    setBusy(true); setMessage('');
    const response = await fetch(`/api/vendors/${vendorId}/outlet-managers/${outletId}`, { method: 'DELETE' });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(payload.error?.message || 'Could not remove manager.'); return; }
    setSelectedUserId(''); setMessage('Manager removed.'); onChanged();
  }

  return (
    <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
      <div className="flex items-start gap-2">
        <UserRound size={16} className="mt-0.5 text-emerald-700" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">Outlet Manager</p>
          {manager ? <div className="mt-1"><p className="font-semibold text-gray-900">{manager.fullName}</p><p className="truncate text-xs text-gray-500">{manager.email}</p></div> : <p className="mt-1 text-sm text-gray-600">No manager assigned yet.</p>}
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <select value={selectedUserId} onChange={(event) => setSelectedUserId(event.target.value)} className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2.5 py-2 text-xs text-gray-700">
          <option value="">Select a manager account</option>
          {eligibleManagers.map((eligible) => <option key={eligible.id} value={eligible.id}>{eligible.fullName} · {eligible.email}</option>)}
        </select>
        <button type="button" disabled={!selectedUserId || busy} onClick={assign} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-700 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><UserRoundPlus size={14} /> Assign</button>
        {manager && <button type="button" disabled={busy} onClick={remove} title="Remove manager" className="rounded-lg border border-red-200 px-2.5 text-red-600 disabled:opacity-50"><UserRoundX size={14} /></button>}
      </div>
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  );
}
