'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslation } from 'react-i18next';
import { CalendarDays, ChevronRight, MapPin, PartyPopper } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { formatDate } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import type { PromotionCampaignPublic } from '@/lib/promotion-campaigns/types';
import { VendorPageHeader } from '@/components/vendor/vendor-page-header';

interface RegistrationSummary { campaignId: string; status: string }

function eventDateParts(startsAt: string, locale: string) {
  const date = new Date(startsAt);
  const parts = new Intl.DateTimeFormat(locale, {
    timeZone: 'Asia/Kuala_Lumpur',
    month: 'short',
    day: '2-digit',
  }).formatToParts(date);
  return {
    month: parts.find((part) => part.type === 'month')?.value ?? '',
    day: parts.find((part) => part.type === 'day')?.value ?? '',
  };
}

export default function VendorEventsPage() {
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { user } = useAuth();
  const vendorId = user?.activeVendorId;

  const [campaigns, setCampaigns] = useState<PromotionCampaignPublic[]>([]);
  const [registrations, setRegistrations] = useState<RegistrationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!vendorId) return;
    setLoading(true);
    setError(null);
    try {
      const [campaignsResponse, registrationsResponse] = await Promise.all([
        fetch('/api/customer/promotion-campaigns', { cache: 'no-store' }),
        fetch(`/api/vendors/${vendorId}/campaign-registrations`, { cache: 'no-store' }),
      ]);
      const campaignsBody = await campaignsResponse.json() as { data?: { campaigns?: PromotionCampaignPublic[] }; error?: { message?: string } };
      if (!campaignsResponse.ok || !campaignsBody.data) throw new Error(campaignsBody.error?.message ?? t('ui.events.loadError'));
      const registrationsBody = await registrationsResponse.json() as { data?: { registrations?: { campaignId: string; status: string }[] } };
      setCampaigns(campaignsBody.data.campaigns ?? []);
      setRegistrations((registrationsResponse.ok ? registrationsBody.data?.registrations ?? [] : []).map((r) => ({ campaignId: r.campaignId, status: r.status })));
    } catch (err) {
      setError(err instanceof Error ? err.message : t('ui.events.loadError'));
    } finally {
      setLoading(false);
    }
  }, [vendorId, t]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  if (!vendorId) {
    return <div className="p-8 text-sm text-muted-foreground">{t('ui.events.noVendor')}</div>;
  }

  return (
    <div className="w-full space-y-7 pb-8">
      <VendorPageHeader eyebrow={<><PartyPopper size={15} aria-hidden="true" /> {t('navigationSections.promotion')}</>} title={t('ui.events.title')} titleClassName="text-3xl sm:text-4xl" />

      {error && <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}

      {loading ? (
        <p className="text-sm text-muted-foreground">{t('ui.events.loading')}</p>
      ) : campaigns.length === 0 ? (
        <p className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">{t('ui.events.empty')}</p>
      ) : (
        <ul className="space-y-4">
          {campaigns.map((campaign) => {
            const joined = registrations.filter((r) => r.campaignId === campaign.id).length;
            const date = eventDateParts(campaign.startsAt, locale);
            return (
              <li key={campaign.id}>
                <Link href={`/vendor/events/${campaign.id}`} className="group flex min-w-0 flex-wrap items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5 shadow-sm transition-colors hover:border-primary/25 hover:bg-secondary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary sm:flex-nowrap sm:gap-5 sm:px-6">
                  <div className="flex size-[4.5rem] shrink-0 flex-col items-center justify-center rounded-2xl bg-secondary/60 text-primary" aria-hidden="true">
                    <span className="text-xs font-bold uppercase tracking-widest">{date.month}</span>
                    <span className="text-3xl font-bold leading-none tabular-nums">{date.day}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-base font-bold leading-snug text-foreground sm:text-lg">{campaign.title}</h2>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5"><CalendarDays size={15} aria-hidden="true" />{formatDate(campaign.startsAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })} – {formatDate(campaign.endsAt, locale, { timeZone: 'Asia/Kuala_Lumpur' })}</span>
                      <span className="inline-flex items-center gap-1.5"><MapPin size={15} aria-hidden="true" />{t('ui.events.locations.count', { count: campaign.locations.length })}</span>
                    </div>
                  </div>
                  <div className="ml-auto flex shrink-0 items-center gap-2 pl-1">
                    {joined > 0
                      ? <span className="rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground">{t('ui.events.locations.joined', { joined, total: campaign.locations.length })}</span>
                      : <span className="text-sm font-bold text-primary">{t('ui.events.registerCta')}</span>}
                    <ChevronRight size={18} className="text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
