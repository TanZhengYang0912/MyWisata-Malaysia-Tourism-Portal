'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { Bell } from 'lucide-react';
import BatchActionBar from '@/components/vendor/batch-action-bar';
import { useAuth } from '@/hooks/use-auth';
import { formatDateTime } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';

interface Announcement {
  id: string;
  title: string;
  body: string;
  senderCode: string;
  campaignId: string | null;
  createdAt: string;
  isRead: boolean;
}

export default function VendorAnnouncementsPage() {
  const { t, i18n } = useTranslation('vendor');
  const { user } = useAuth();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const vendorId = user?.activeVendorId;

  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [allFilteredSelected, setAllFilteredSelected] = useState(false);
  const [batchBusy, setBatchBusy] = useState(false);
  const [batchMessage, setBatchMessage] = useState('');

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/announcements`, { cache: 'no-store' });
      const body = await response.json() as { data?: { announcements?: Announcement[] }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('ui.announcements.loadError'));
      setAnnouncements(body.data.announcements ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.announcements.loadError'));
    } finally {
      setLoading(false);
    }
  }, [vendorId, t]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (!vendorId) {
    return <div className="p-8 text-sm text-muted-foreground">{t('ui.announcements.noVendor')}</div>;
  }

  const unreadAnnouncements = announcements.filter((item) => !item.isRead);
  const unreadCount = unreadAnnouncements.length;

  const toggleSelected = (announcementId: string) => {
    setAllFilteredSelected(false);
    setBatchMessage('');
    setSelectedIds((current) => current.includes(announcementId)
      ? current.filter((id) => id !== announcementId)
      : [...current, announcementId]);
  };

  const applyBatch = async (action: string) => {
    if ((action !== 'mark_read' && action !== 'mark_unread') || selectedIds.length === 0 || batchBusy) return;
    const idsToUpdate = [...selectedIds];
    const isReadAction = action === 'mark_read';
    const fallbackError = isReadAction
      ? t('ui.announcements.batchReadError')
      : t('ui.announcements.batchUnreadError');
    setBatchBusy(true);
    setBatchMessage('');
    try {
      const response = await fetch(`/api/vendors/${vendorId}/announcements/read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: idsToUpdate, action }),
      });
      const body = await response.json() as { data?: { ok?: boolean }; error?: { message?: string } };
      if (!response.ok || !body.data?.ok) throw new Error(body.error?.message ?? fallbackError);

      const selected = new Set(idsToUpdate);
      setAnnouncements((current) => current.map((item) => selected.has(item.id) ? { ...item, isRead: isReadAction } : item));
      setSelectedIds([]);
      setAllFilteredSelected(false);
      setBatchMessage(t(
        isReadAction ? 'ui.announcements.batchReadSuccess' : 'ui.announcements.batchUnreadSuccess',
        { count: idsToUpdate.length },
      ));
    } catch (err) {
      setBatchMessage(err instanceof Error ? err.message : fallbackError);
    } finally {
      setBatchBusy(false);
    }
  };

  return (
    <div className="w-full space-y-6">
      <VendorPageHeader
        eyebrow={<><Bell size={15} aria-hidden="true" /> {t('navigationSections.communication')}</>}
        title={<>{t('ui.announcements.title')}{unreadCount > 0 && <span className="mt-1 block text-base font-semibold text-primary sm:ml-2 sm:mt-0 sm:inline">{t('ui.announcements.unreadCount', { count: unreadCount })}</span>}</>}
      />

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {(announcements.length > 0 || batchMessage) && (
        <BatchActionBar
          selectedCount={selectedIds.length}
          total={announcements.length}
          allFilteredSelected={allFilteredSelected}
          onSelectAllFiltered={() => {
            setAllFilteredSelected(true);
            setSelectedIds(announcements.map((item) => item.id));
            setBatchMessage('');
          }}
          onClear={() => {
            setSelectedIds([]);
            setAllFilteredSelected(false);
            setBatchMessage('');
          }}
          onApply={applyBatch}
          actions={[
            { value: 'mark_read', label: t('ui.announcements.markSelectedRead') },
            { value: 'mark_unread', label: t('ui.announcements.markSelectedUnread') },
          ]}
          busy={batchBusy}
          message={batchMessage}
          selectAllLabel={t('ui.announcements.selectAllAnnouncements')}
          allSelectedLabel={t('ui.announcements.allAnnouncementsSelected')}
        />
      )}
      <span className="sr-only" role="status" aria-live="polite">{batchMessage}</span>

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('ui.announcements.loading')}</p>
      ) : announcements.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t('ui.announcements.empty')}</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-secondary/40 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <tr>
                <th aria-hidden="true" className="w-12 px-4 py-3"></th>
                <th className="px-4 py-3">{t('ui.announcements.columns.title')}</th>
                <th className="px-4 py-3 max-sm:hidden">{t('ui.announcements.columns.sender')}</th>
                <th className="px-4 py-3 max-sm:hidden">{t('ui.announcements.columns.date')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {announcements.map((announcement) => (
                <tr key={announcement.id} className={announcement.isRead ? 'bg-muted/20' : 'bg-primary/5'}>
                  <td className="w-12 px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(announcement.id)}
                      disabled={batchBusy}
                      onChange={() => toggleSelected(announcement.id)}
                      aria-label={t('ui.announcements.selectAnnouncement', { title: announcement.title })}
                    />
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/vendor/announcements/${announcement.id}`} className={`hover:underline ${announcement.isRead ? 'text-muted-foreground' : 'text-foreground'}`}>
                      <span className="sr-only">{announcement.isRead ? t('ui.announcements.readStatus') : t('ui.announcements.unreadStatus')} </span>
                      {announcement.title}
                    </Link>
                    {/* Phones: sender and date move under the title instead of their own columns. */}
                    <p className="mt-1 text-xs text-muted-foreground sm:hidden">{announcement.senderCode} · {formatDateTime(announcement.createdAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground max-sm:hidden">{announcement.senderCode}</td>
                  <td className="whitespace-nowrap px-4 py-3 text-muted-foreground max-sm:hidden">{formatDateTime(announcement.createdAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
