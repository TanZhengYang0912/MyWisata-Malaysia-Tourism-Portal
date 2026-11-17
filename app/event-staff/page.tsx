'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/hooks/use-auth';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/badge';
import { DEFAULT_LOCALE, isAppLocale } from '@/lib/i18n/locale';
import { getMalaysiaDateInputValue } from '@/lib/datetime/date-input';
import { formatEventDateRange } from '@/lib/promotion-campaigns/locations';

/** One stall this person joined. */
interface Assignment {
  vendorId: string;
  vendorName: string;
  campaignId: string;
  campaignTitle: string;
  expiresAt: string;
  // pending: joined through the link, waiting for the vendor owner's approval.
  status: 'active' | 'pending';
  location: { id: string; name: string; startsOn: string; endsOn: string };
}

/** Event staff home: the stalls this person joined, grouped by vendor × event, with today's scan links. */
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

  function scanHref(assignment: Assignment) {
    const params = new URLSearchParams({ vendorId: assignment.vendorId, mode: 'event-pickup', locationId: assignment.location.id, date: today, locationName: assignment.location.name });
    return `/event-staff/scan?${params.toString()}`;
  }

  const groups = new Map<string, Assignment[]>();
  for (const assignment of assignments ?? []) {
    const key = `${assignment.vendorId}:${assignment.campaignId}`;
    groups.set(key, [...(groups.get(key) ?? []), assignment]);
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
      ) : [...groups.entries()].map(([key, stalls]) => (
        <div key={key} className="space-y-3 rounded-xl border border-border bg-card p-5">
          <div className="min-w-0">
            <p className="font-semibold text-foreground">{stalls[0].vendorName}</p>
            <p className="text-xs text-muted-foreground">{stalls[0].campaignTitle}</p>
          </div>
          <ul className="space-y-2">
            {stalls.map((assignment) => {
              const { location } = assignment;
              const isToday = location.startsOn <= today && today <= location.endsOn;
              return (
                <li key={location.id} className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{location.name}</p>
                    <p className="text-xs text-muted-foreground">{formatEventDateRange(location.startsOn, location.endsOn, locale)}</p>
                  </div>
                  {assignment.status === 'pending' ? (
                    <StatusBadge status="pending" label={t('ui.eventStaff.home.pending')} />
                  ) : isToday ? (
                    <Button asChild size="sm"><Link href={scanHref(assignment)}>{t('ui.eventStaff.home.scan')}</Link></Button>
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
