'use client';

import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, MapPin } from 'lucide-react';
import { ActivityCard } from '@/components/customer/activity-card';
import type { ComputedActivity } from '@/backend/core/types';
import { useAuth } from '@/components/providers/auth';
import { useCustomerCapabilityGate } from '@/components/customer/use-customer-capability-gate';
import { CUSTOMER_CAPABILITY, resolveCustomerAccess } from '@/lib/auth/customer-capabilities';

type Card = { activity: ComputedActivity; score?: number; whyItFits?: string };
type Result = { mode: 'generic' | 'personalized'; locationSource: 'browser' | 'city' | 'none'; activities: Card[] };

export default function ForYouClient({ initialPopular }: { initialPopular: ComputedActivity[] }) {
  const { t: tCustomer } = useTranslation('customer');
  const { currentUser } = useAuth();
  const gate = useCustomerCapabilityGate();
  const aiAllowed = resolveCustomerAccess(currentUser, CUSTOMER_CAPABILITY.BASIC_AI) === 'allowed';
  const genericResult: Result = { mode: 'generic', locationSource: 'none', activities: initialPopular.map((activity) => ({ activity })) };
  const [result, setResult] = useState<Result>(genericResult);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(aiAllowed);
  const [locationBusy, setLocationBusy] = useState(false);

  const load = useCallback(async (coordinates?: { latitude: number; longitude: number }) => {
    if (!aiAllowed) {
      setResult({ mode: 'generic', locationSource: 'none', activities: initialPopular.map((activity) => ({ activity })) });
      setLoading(false);
      return;
    }
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/personalized-recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(coordinates ?? {}) });
      const body = await response.json() as { data?: Result; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'Unable to load recommendations');
      setResult(body.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load recommendations'); }
    finally { setLoading(false); }
  }, [aiAllowed, initialPopular]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);

  function useMyLocation() {
    if (!gate(CUSTOMER_CAPABILITY.BASIC_AI, '/customer/for-you')) return;
    if (!navigator.geolocation) { setError('Your browser does not support location. Showing your profile city instead.'); return; }
    setLocationBusy(true);
    navigator.geolocation.getCurrentPosition(
      (position) => { setLocationBusy(false); void load({ latitude: position.coords.latitude, longitude: position.coords.longitude }); },
      () => { setLocationBusy(false); setError('Location was not shared. Showing your profile city instead.'); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 300_000 },
    );
  }

  const personalized = result?.mode === 'personalized';
  return <div className="mx-auto max-w-7xl px-5 py-10">
    <Link href="/customer" className="inline-flex items-center gap-2 text-sm font-semibold text-primary transition hover:text-primary/75 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/20">
      <ArrowLeft size={16} aria-hidden="true" />
      {tCustomer('ui.actions.backToResults')}
    </Link>
    <p className="text-xs font-semibold tracking-[0.18em] text-primary">{personalized ? tCustomer('ui.labels.trending') : tCustomer('ui.labels.details')}</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-foreground">{tCustomer('ui.map.searchMalaysia')}</h1><p className="mt-2 text-muted-foreground">{personalized ? tCustomer('ui.map.searchHint') : tCustomer('ui.labels.placeBasedExperience')}</p></div><button type="button" onClick={useMyLocation} disabled={locationBusy || loading} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-50"><MapPin size={16} />{locationBusy ? tCustomer('ui.states.loading') : tCustomer('ui.labels.location')}</button></div>
    {error && <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {result?.locationSource === 'city' && <p className="mt-4 text-xs text-muted-foreground">Showing distances from your profile city.</p>}
    {!personalized && !loading && <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">{currentUser ? 'Verify your phone and complete your travel preferences to unlock personalised suggestions.' : 'Sign in and verify your phone to unlock personalised suggestions.'} <button type="button" onClick={() => gate(CUSTOMER_CAPABILITY.BASIC_AI, '/customer/for-you')} className="font-semibold text-primary">Continue verification →</button></p>}
    {loading ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={18} /> {tCustomer('ui.states.loading')}</div> : <div className="mt-8 grid items-stretch grid-cols-2 gap-4 sm:gap-5 md:grid-cols-4">{result?.activities.map(({ activity, whyItFits }) => <ActivityCard key={activity.id} activity={activity} recommendationReason={personalized ? whyItFits : undefined} returnTo="/customer/for-you" />)}</div>}
    <Link href="/customer/profile#preferences" className="mt-8 inline-block font-semibold text-primary">Edit preferences →</Link>
  </div>;
}
