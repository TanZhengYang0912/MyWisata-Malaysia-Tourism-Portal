'use client';

import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown, Copy, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useAppDialog } from '@/components/providers/app-dialog';
import { formatDate } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

interface StaffLink { token: string; expiresAt: string }
type MemberStatus = 'pending' | 'active' | 'removed';
interface StaffMember { id: string; displayName: string; email: string; joinedAt: string; status: MemberStatus }

interface Props { vendorId: string; locationId: string }

/**
 * Owner panel inside one stall: that stall's join link and the staff who joined
 * through it. Staff scan only at this stall.
 * Joining only requests access: the owner approves before anyone can scan, and
 * only the owner can restore someone who was removed.
 */
export function EventStaffManager({ vendorId, locationId }: Props) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const { confirm } = useAppDialog();
  const [link, setLink] = useState<StaffLink | null>(null);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/vendors/${vendorId}/event-staff/${locationId}`;
  const date = (value: string) => formatDate(value, locale, { timeZone: 'Asia/Kuala_Lumpur' });
  const joinUrl = link && typeof window !== 'undefined' ? `${window.location.origin}/event-staff/join/${link.token}` : '';

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { cache: 'no-store' });
      if (!response.ok) throw new Error(String(response.status));
      const body = await response.json() as { data: { link: StaffLink | null; members: StaffMember[] } };
      setLink(body.data.link);
      setMembers(body.data.members);
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- load synchronizes the card with the server resource
  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<Response>) {
    setBusy(true);
    try {
      const response = await action();
      if (!response.ok) throw new Error(String(response.status));
      return response;
    } catch {
      showFeedback('error', t('errors.generic', { ns: 'common' }));
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveLink(rotate: boolean) {
    if (rotate && !(await confirm(t('ui.events.staff.resetConfirm')))) return;
    const response = await run(() => fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rotate ? { rotate: true } : {}),
    }));
    if (response) setLink(((await response.json()) as { data: { link: StaffLink } }).data.link);
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      showFeedback('success', t('ui.events.staff.copied'));
    } catch {
      showFeedback('error', t('errors.generic', { ns: 'common' }));
    }
  }

  const setStatus = (memberId: string, status: MemberStatus) =>
    setMembers((current) => current.map((entry) => (entry.id === memberId ? { ...entry, status } : entry)));

  async function remove(member: StaffMember) {
    const message = member.status === 'pending'
      ? t('ui.events.staff.declineConfirm', { name: member.displayName })
      : t('ui.events.staff.removeConfirm', { name: member.displayName });
    if (!(await confirm(message))) return;
    const response = await run(() => fetch(`${endpoint}/members/${member.id}`, { method: 'DELETE' }));
    if (response) setStatus(member.id, 'removed');
  }

  async function grant(member: StaffMember, action: 'approve' | 'restore') {
    const response = await run(() => fetch(`${endpoint}/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    }));
    if (!response) {
      // A 409 means another tab changed this member; show the current state.
      void load();
      return;
    }
    setStatus(member.id, 'active');
    showFeedback('success', t(action === 'approve' ? 'ui.events.staff.approved' : 'ui.events.staff.restored', { name: member.displayName }));
  }

  const pending = members.filter((member) => member.status === 'pending');
  const active = members.filter((member) => member.status === 'active');
  const removed = members.filter((member) => member.status === 'removed');

  const memberRow = (member: StaffMember, actions: ReactNode) => (
    <li key={member.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 rounded-lg border border-border p-3">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{member.displayName}</p>
        <p className="truncate text-xs text-muted-foreground">{member.email} · {t('ui.events.staff.joinedAt', { date: date(member.joinedAt) })}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">{actions}</div>
    </li>
  );

  return (
    <section className="space-y-3 border-t border-border pt-4">
      <h3 className="text-xs font-semibold text-muted-foreground">{t('ui.events.staff.title')}</h3>
      {loading ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 size={14} className="animate-spin" aria-hidden="true" /> {t('ui.events.loading')}
        </p>
      ) : loadFailed ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{t('ui.events.staff.loadError')}</p>
      ) : (
        <>
          {link ? (
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Input readOnly value={joinUrl} aria-label={t('ui.events.staff.title')} className="min-w-0 flex-1 basis-full font-mono text-xs sm:basis-0" onFocus={(event) => event.currentTarget.select()} />
                <Button type="button" size="sm" disabled={busy} onClick={() => void copyLink()}>
                  <Copy size={14} aria-hidden="true" /> {t('ui.events.staff.copyLink')}
                </Button>
                <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void saveLink(true)}>
                  <RotateCcw size={14} aria-hidden="true" /> {t('ui.events.staff.resetLink')}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{t('ui.events.staff.validUntil', { date: date(link.expiresAt) })}</p>
            </div>
          ) : (
            <Button type="button" size="sm" disabled={busy} onClick={() => void saveLink(false)}>{t('ui.events.staff.createLink')}</Button>
          )}
          {pending.length > 0 && (
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold text-muted-foreground">{t('ui.events.staff.pendingTitle', { count: pending.length })}</h3>
              <ul className="space-y-1.5">
                {pending.map((member) => memberRow(member, (
                  <>
                    <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(member)}>{t('ui.events.staff.decline')}</Button>
                    <Button type="button" size="sm" disabled={busy} onClick={() => void grant(member, 'approve')}>{t('ui.events.staff.approve')}</Button>
                  </>
                )))}
              </ul>
            </div>
          )}
          {active.length === 0 && pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ui.events.staff.membersEmpty')}</p>
          ) : active.length > 0 && (
            <div className="space-y-1.5">
              {pending.length > 0 && <h3 className="text-xs font-semibold text-muted-foreground">{t('ui.events.staff.activeTitle', { count: active.length })}</h3>}
              <ul className="space-y-1.5">
                {active.map((member) => memberRow(member, (
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(member)}>{t('ui.events.staff.remove')}</Button>
                )))}
              </ul>
            </div>
          )}
          {removed.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer list-none text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 [&::-webkit-details-marker]:hidden">
                <span className="inline-flex items-center gap-1">
                  <ChevronDown size={14} aria-hidden="true" className="transition-transform group-open:rotate-180 motion-reduce:transition-none" />
                  {t('ui.events.staff.removedTitle', { count: removed.length })}
                </span>
              </summary>
              <ul className="mt-1.5 space-y-1.5">
                {removed.map((member) => memberRow(member, (
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void grant(member, 'restore')}>{t('ui.events.staff.restore')}</Button>
                )))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
