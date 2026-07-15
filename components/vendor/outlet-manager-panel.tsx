'use client';

import { useState } from 'react';
import { Copy, Mail, UserRound, UserRoundX } from 'lucide-react';
import { useActionFeedback } from '@/components/providers/action-feedback';

interface PendingInvitation { email: string; expiresAt: string }
interface Manager { id: string; fullName: string; email: string }

interface Props {
  vendorId: string;
  outletId: string;
  manager?: Manager | null;
  pendingInvitation?: PendingInvitation | null;
  onChanged: () => void;
}

export default function OutletManagerPanel({ vendorId, outletId, manager, pendingInvitation, onChanged }: Props) {
  const { showFeedback } = useActionFeedback();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [currentPendingInvitation, setCurrentPendingInvitation] = useState<PendingInvitation | null>(pendingInvitation || null);

  async function remove() {
    if (!manager || !confirm('Remove this Outlet Manager from the outlet?')) return;
    setBusy(true); setMessage('');
    const response = await fetch(`/api/vendors/${vendorId}/outlet-managers/${outletId}`, { method: 'DELETE' });
    const payload = await response.json();
    setBusy(false);
    if (!response.ok) { setMessage(payload.error?.message || 'Could not remove manager.'); return; }
    setMessage('Manager removed.'); showFeedback('success', 'Outlet manager removed.'); onChanged();
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true); setMessage(''); setInviteLink('');
    const response = await fetch(`/api/vendors/${vendorId}/outlet-manager-invitations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outletId, email: inviteEmail.trim() }) });
    const payload = await response.json();
    setInviteBusy(false);
    if (!response.ok) { setMessage(payload.error?.message || 'Could not create invitation.'); return; }
    setInviteEmail(''); setInviteLink(payload.data?.inviteUrl || ''); setCurrentPendingInvitation({ email: payload.data?.invitedEmail || inviteEmail.trim(), expiresAt: payload.data?.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
    setMessage(payload.data?.existingAccount ? 'Invitation created for this MyWisata account.' : 'Invitation created. Share the link with the manager so they can register.');
    showFeedback('success', 'Outlet manager invitation created.');
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard?.writeText(inviteLink);
    setMessage('Invitation link copied.');
  }

  return (
    <div className="rounded-xl border border-primary/10 bg-secondary/60 p-3">
      <div className="flex items-start gap-2">
        <UserRound size={16} className="mt-0.5 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Outlet Manager</p>
          {manager ? <div className="mt-1"><p className="font-semibold text-gray-900">{manager.fullName}</p><p className="truncate text-xs text-gray-500">{manager.email}</p></div> : <p className="mt-1 text-sm text-gray-600">No manager assigned yet.</p>}
        </div>
      </div>
      {manager && <div className="mt-3 flex justify-end"><button type="button" disabled={busy} onClick={remove} title="Remove manager" className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-2 text-xs text-red-600 disabled:opacity-50"><UserRoundX size={14} /> Remove manager</button></div>}
      {!manager && (
        <div className="mt-4 border-t border-primary/10 pt-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-primary"><Mail size={14} /> Invite by email</p>
          <p className="mt-1 text-xs text-gray-500">The manager accepts with this email before receiving access to this outlet.</p>
          {currentPendingInvitation && !inviteLink && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">Pending invitation sent to <strong>{currentPendingInvitation.email}</strong>.</p>}
          <div className="mt-2 flex gap-2">
            <input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="manager@example.com" className="min-w-0 flex-1 rounded-lg border border-primary/20 bg-white px-2.5 py-2 text-xs text-gray-700" />
            <button type="button" disabled={!inviteEmail.trim() || inviteBusy} onClick={invite} className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"><Mail size={14} /> {inviteBusy ? 'Inviting…' : 'Invite'}</button>
          </div>
          {inviteLink && <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-2 ring-1 ring-primary/10"><input readOnly value={inviteLink} aria-label="Outlet manager invitation link" className="min-w-0 flex-1 bg-transparent text-[11px] text-gray-600 outline-none" /><button type="button" onClick={copyInviteLink} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-secondary px-2 py-1.5 text-[11px] font-semibold text-primary"><Copy size={12} /> Copy link</button></div>}
        </div>
      )}
      {message && <p className="mt-2 text-xs text-gray-600">{message}</p>}
    </div>
  );
}
