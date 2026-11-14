'use client';

import { useState } from 'react';
import { Copy, Mail, UserRound, UserRoundX } from 'lucide-react';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useTranslation } from 'react-i18next';
import ActionConfirmationDialog from '@/components/vendor/action-confirmation-dialog';

interface PendingInvitation { email: string; expiresAt: string }
interface Manager { id: string; fullName: string; email: string }

interface Props {
  vendorId: string;
  outletId: string;
  outletName?: string;
  manager?: Manager | null;
  pendingInvitation?: PendingInvitation | null;
  onChanged: () => void;
}

export default function OutletManagerPanel({ vendorId, outletId, outletName, manager, pendingInvitation, onChanged }: Props) {
  const { t } = useTranslation('vendor');
  const { showFeedback } = useActionFeedback();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [currentPendingInvitation, setCurrentPendingInvitation] = useState<PendingInvitation | null>(pendingInvitation || null);
  const [removeConfirmationOpen, setRemoveConfirmationOpen] = useState(false);

  async function remove() {
    if (!manager || busy) return;
    setBusy(true); setMessage('');
    // Name the manager so the server revokes exactly this person's access to this outlet.
    const response = await fetch(`/api/vendors/${vendorId}/outlet-managers/${outletId}?${new URLSearchParams({ userId: manager.id })}`, { method: 'DELETE' });
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) { const failure = payload.error?.message || t('outletManager.removeFailed'); setMessage(failure); setRemoveConfirmationOpen(false); showFeedback('error', failure); return; }
    setMessage(t('outletManager.removed')); setRemoveConfirmationOpen(false); showFeedback('success', t('outletManager.removed')); onChanged();
  }

  async function invite() {
    if (!inviteEmail.trim()) return;
    setInviteBusy(true); setMessage(''); setInviteLink('');
    const response = await fetch(`/api/vendors/${vendorId}/outlet-manager-invitations`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ outletId, email: inviteEmail.trim() }) });
    const payload = await response.json();
    setInviteBusy(false);
    if (!response.ok) { setMessage(payload.error?.message || t('outletManager.inviteFailed')); return; }
    setInviteEmail(''); setInviteLink(payload.data?.inviteUrl || ''); setCurrentPendingInvitation({ email: payload.data?.invitedEmail || inviteEmail.trim(), expiresAt: payload.data?.expiresAt || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() });
    setMessage(payload.data?.existingAccount ? t('outletManager.inviteExisting') : t('outletManager.inviteCreated'));
    showFeedback('success', t('outletManager.inviteCreated'));
  }

  async function copyInviteLink() {
    if (!inviteLink) return;
    await navigator.clipboard?.writeText(inviteLink);
    setMessage(t('outletManager.linkCopied'));
  }

  return (
    <div className="space-y-3">
      {manager ? (
        <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground"><UserRound size={16} /></span>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-foreground">{manager.fullName}</p>
              <p className="truncate text-xs text-muted-foreground">{manager.email}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => setRemoveConfirmationOpen(true)}
            aria-label={`${t('outletManager.removeAccess')}: ${manager.fullName}`}
            className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-medium text-red-700 transition-colors hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/40 disabled:opacity-50 dark:text-red-300 dark:hover:bg-red-500/10"
          >
            <UserRoundX size={15} aria-hidden="true" /> {t('outletManager.removeAccess')}
          </button>
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground">{t('outletManager.noneAssigned')}</p>
      )}
      {!manager && (
        <div className="rounded-xl border border-border bg-card p-3">
          <p className="flex items-center gap-1.5 text-sm font-medium text-foreground"><Mail size={15} aria-hidden="true" className="text-muted-foreground" /> {t('outletManager.inviteTitle')}</p>
          <p className="mt-1 text-xs text-muted-foreground">{t('outletManager.inviteHint')}</p>
          {currentPendingInvitation && !inviteLink && <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t('outletManager.pendingInvitation')} <strong>{currentPendingInvitation.email}</strong>.</p>}
          <form className="mt-2 flex gap-2" onSubmit={(event) => { event.preventDefault(); void invite(); }}>
            <label className="sr-only" htmlFor={`invite-${outletId}`}>{t('outletManager.inviteByEmail')}</label>
            <input id={`invite-${outletId}`} type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder={t('outletManager.emailPlaceholder')} className="h-10 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" />
            <button type="submit" disabled={!inviteEmail.trim() || inviteBusy} className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50">{inviteBusy ? t('outletManager.inviting') : t('outletManager.invite')}</button>
          </form>
          {inviteLink && <div className="mt-2 flex items-center gap-2 rounded-lg bg-muted p-2"><input readOnly value={inviteLink} aria-label={t('outletManager.invitationLink')} className="min-w-0 flex-1 bg-transparent text-xs text-muted-foreground outline-none" /><button type="button" onClick={copyInviteLink} className="inline-flex shrink-0 items-center gap-1 rounded-md bg-card px-2 py-1.5 text-xs font-semibold text-primary"><Copy size={12} aria-hidden="true" /> {t('outletManager.copyLink')}</button></div>}
        </div>
      )}
      {message && <p role="status" className="text-xs text-muted-foreground">{message}</p>}
      <ActionConfirmationDialog
        open={removeConfirmationOpen}
        title={manager ? t('outletManager.removeConfirmTitle', { name: manager.fullName, outlet: outletName ?? '' }) : t('outletManager.remove')}
        description={t('outletManager.removeConsequences')}
        confirmLabel={t('outletManager.removeAccess')}
        tone="danger"
        busy={busy}
        onCancel={() => { if (!busy) setRemoveConfirmationOpen(false); }}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
