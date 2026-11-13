'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { formatDate } from '@/lib/i18n/format';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { getMalaysiaDateInputValue } from '@/lib/datetime/date-input';
import { formatEventDateRange } from '@/lib/promotion-campaigns/locations';

interface Assignment {
  vendorId: string;
  vendorName: string;
  campaignId: string;
  campaignTitle: string;
  expiresAt: string;
  locations: { id: string; name: string; startsOn: string; endsOn: string }[];
}

/** Event staff home: the events this person may scan for, with today's scan links. */
export default function EventStaffHomePage() {
  const router = useRouter();
  const { t, i18n } = useTranslation('vendor');
  const locale = isAppLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : DEFAULT_LOCALE;
  const { user, loading: authLoading } = useAuth();
  const [assignments, setAssignments] = useState<Assignment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const today = getMalaysiaDateInputValue();

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.replace('/login?next=/event-staff'); return; }
    let active = true;
    void fetch('/api/event-staff/assignments', { cache: 'no-store' })
      .then(async (response) => {
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { data: Assignment[] };
        if (active) setAssignments(body.data);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [authLoading, user, router]);

  function scanHref(assignment: Assignment, location: Assignment['locations'][number]) {
    const params = new URLSearchParams({ vendorId: assignment.vendorId, mode: 'event-pickup', locationId: location.id, date: today, locationName: location.name });
    return `/event-staff/scan?${params.toString()}`;
  }

  return (
    <main className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
      <h1 className="text-xl font-bold text-foreground">{t('ui.eventStaff.home.title')}</h1>
      {failed ? (
        <p role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{t('errors.generic', { ns: 'common' })}</p>
      ) : !assignments ? (
        <Loader2 size={20} className="animate-spin text-muted-foreground" aria-label={t('ui.events.loading')} />
      ) : assignments.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('ui.eventStaff.home.empty')}</p>
      ) : assignments.map((assignment) => (
        <div key={`${assignment.vendorId}:${assignment.campaignId}`} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div>
            <p className="font-semibold text-foreground">{assignment.vendorName}</p>
            <p className="text-xs text-muted-foreground">
              {assignment.campaignTitle} · {t('ui.events.staff.validUntil', { date: formatDate(assignment.expiresAt, locale, { timeZone: 'Asia/Kuala_Lumpur' }) })}
            </p>
          </div>
          <ul className="space-y-2">
            {assignment.locations.map((location) => {
              const isToday = location.startsOn <= today && today <= location.endsOn;
              return (
                <li key={location.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{location.name}</p>
                    <p className="text-xs text-muted-foreground">{formatEventDateRange(location.startsOn, location.endsOn, locale)}</p>
                  </div>
                  {isToday ? (
                    <Button asChild size="sm"><Link href={scanHref(assignment, location)}>{t('ui.eventStaff.home.scan')}</Link></Button>
                  ) : (
                    <Button size="sm" variant="outline" disabled>{t('ui.eventStaff.home.notToday')}</Button>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </main>
  );
}
