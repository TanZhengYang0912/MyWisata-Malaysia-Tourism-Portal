'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Copy, Loader2, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useActionFeedback } from '@/components/providers/action-feedback';
import { useAppDialog } from '@/components/providers/app-dialog';
import { formatDate } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';

interface StaffLink { token: string; expiresAt: string }
interface StaffMember { id: string; displayName: string; email: string; joinedAt: string }

interface Props { vendorId: string; campaignId: string }

/** Owner card: one join link per vendor × event, and the staff who joined through it. */
export function EventStaffManager({ vendorId, campaignId }: Props) {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { showFeedback } = useActionFeedback();
  const { confirm } = useAppDialog();
  const [link, setLink] = useState<StaffLink | null>(null);
  const [members, setMembers] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const endpoint = `/api/vendors/${vendorId}/event-staff/${campaignId}`;
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

  async function remove(member: StaffMember) {
    if (!(await confirm(t('ui.events.staff.removeConfirm', { name: member.displayName })))) return;
    const response = await run(() => fetch(`${endpoint}/members/${member.id}`, { method: 'DELETE' }));
    if (response) setMembers((current) => current.filter((entry) => entry.id !== member.id));
  }

  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-5">
      <h2 className="text-sm font-semibold text-foreground">{t('ui.events.staff.title')}</h2>
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
          {members.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('ui.events.staff.membersEmpty')}</p>
          ) : (
            <ul className="space-y-1.5">
              {members.map((member) => (
                <li key={member.id} className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{member.displayName}</p>
                    <p className="truncate text-xs text-muted-foreground">{member.email} · {t('ui.events.staff.joinedAt', { date: date(member.joinedAt) })}</p>
                  </div>
                  <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => void remove(member)}>{t('ui.events.staff.remove')}</Button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
