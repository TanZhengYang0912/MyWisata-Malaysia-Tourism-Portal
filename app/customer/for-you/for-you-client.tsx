'use client';

import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { ActivityCard } from '@/components/customer/activity-card';
import type { ComputedActivity } from '@/backend/core/types';

type Card = { activity: ComputedActivity; score?: number; whyItFits?: string };
type Result = { mode: 'generic' | 'personalized'; locationSource: 'browser' | 'city' | 'none'; activities: Card[] };

export default function ForYouClient() {
  const { t } = useTranslation('customer');
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);

  const load = useCallback(async (coordinates?: { latitude: number; longitude: number }) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/personalized-recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(coordinates ?? {}) });
      const body = await response.json() as { data?: Result; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? t('ui.forYou.loadError'));
      setResult(body.data);
    } catch (err) { setError(err instanceof Error ? err.message : t('ui.forYou.loadError')); }
    finally { setLoading(false); }
  }, [t]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function useMyLocation() {
    if (!navigator.geolocation) { setError(t('ui.forYou.locationUnsupported')); return; }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLocationBusy(false); void load({ latitude: position.coords.latitude, longitude: position.coords.longitude }); },
      () => { setLocationBusy(false); setError(t('ui.forYou.locationNotShared')); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  const personalized = result?.mode === 'personalized';
  return <div className="mx-auto max-w-7xl px-5 py-10">
    <Link href="/customer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
      <ArrowLeft size={16} aria-hidden="true" />
      {t('ui.forYou.backHome')}
    </Link>
    <p className="mt-8 text-xs font-semibold tracking-[0.18em] text-primary">{personalized ? t('ui.forYou.personalised') : t('ui.forYou.title')}</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-foreground">{t('ui.forYou.heading')}</h1><p className="mt-2 text-muted-foreground">{personalized ? t('ui.forYou.personalisedDescription') : t('ui.forYou.genericDescription')}</p></div><button type="button" onClick={useMyLocation} disabled={locationBusy || loading} aria-busy={locationBusy} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-50"><MapPin size={16} aria-hidden="true" />{locationBusy ? t('ui.states.loading') : t('ui.map.useCurrentLocation')}</button></div>
    {error && <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {result?.locationSource === 'city' && <p className="mt-4 text-xs text-muted-foreground">{t('ui.forYou.profileCityDistance')}</p>}
    {!personalized && !loading && <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">{t('ui.forYou.unlock')} <Link href="/customer/profile" className="font-semibold text-primary">{t('ui.forYou.continueVerification')}</Link></p>}
    {loading ? <div role="status" aria-live="polite" className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={18} aria-hidden="true" /> {t('ui.states.loading')}</div> : <div className="mt-8 grid items-stretch grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">{result?.activities.map(({ activity, whyItFits }) => <ActivityCard key={activity.id} activity={activity} recommendationReason={personalized ? whyItFits : undefined} returnTo="/customer/for-you" />)}</div>}
    <Link href="/customer/profile#preferences" className="mt-8 inline-block font-semibold text-primary">{t('ui.forYou.editPreferences')}</Link>
  </div>;
}
