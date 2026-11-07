'use client';

import { use, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowRight, Bell } from 'lucide-react';
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

export default function VendorAnnouncementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, i18n } = useTranslation('vendor');
  const { user } = useAuth();
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const vendorId = user?.activeVendorId;

  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [readError, setReadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);
    setReadError(null);
    try {
      const response = await fetch(`/api/vendors/${vendorId}/announcements`, { cache: 'no-store' });
      const body = await response.json() as { data?: { announcements?: Announcement[] }; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('ui.announcements.loadError'));
      const found = (body.data.announcements ?? []).find((item) => item.id === id) ?? null;
      setAnnouncement(found);
      if (found && !found.isRead) {
        try {
          const readResponse = await fetch(`/api/vendors/${vendorId}/announcements/${id}/read`, { method: 'POST' });
          const readBody = await readResponse.json().catch(() => ({})) as { error?: { message?: string } };
          if (!readResponse.ok) {
            setReadError(readBody.error?.message ?? t('ui.announcements.readError'));
          } else {
            setAnnouncement({ ...found, isRead: true });
          }
        } catch {
          setReadError(t('ui.announcements.readError'));
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.announcements.loadError'));
    } finally {
      setLoading(false);
    }
  }, [vendorId, id, t]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (!vendorId) {
    return <div className="p-8 text-sm text-muted-foreground">{t('ui.announcements.noVendor')}</div>;
  }

  return (
    <div className="w-full space-y-6">
      <Link href="/vendor/announcements" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft size={16} aria-hidden="true" /> {t('ui.announcements.backToInbox')}
      </Link>

      <VendorPageHeader
        eyebrow={<><Bell size={15} aria-hidden="true" /> {t('navigationSections.communication')}</>}
        title={announcement?.title ?? t('ui.announcements.title')}
        description={announcement ? `${announcement.senderCode} · ${formatDateTime(announcement.createdAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })}` : undefined}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('ui.announcements.loading')}</p>
      ) : error || !announcement ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error ?? t('ui.announcements.notFound')}</p>
      ) : (
        <article className="rounded-xl border border-border bg-card p-6">
          {readError && <p role="alert" className="mt-4 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{readError}</p>}
          <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-foreground">{announcement.body}</p>
          {announcement.campaignId && (
            <Link
              href={`/vendor/events/${announcement.campaignId}`}
              className="mt-6 inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t('ui.announcements.viewEvent')} <ArrowRight size={15} aria-hidden="true" />
            </Link>
          )}
        </article>
      )}
    </div>
  );
}
