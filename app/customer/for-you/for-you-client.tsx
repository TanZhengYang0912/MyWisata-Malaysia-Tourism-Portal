'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, MapPin } from 'lucide-react';
import { toRM } from '@/lib/money';
import type { ComputedActivity } from '@/backend/core/types';

type Card = { activity: ComputedActivity; score?: number; whyItFits?: string };
type Result = { mode: 'generic' | 'personalized'; locationSource: 'browser' | 'city' | 'none'; activities: Card[] };

export default function ForYouClient() {
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [locationBusy, setLocationBusy] = useState(false);

  const load = useCallback(async (coordinates?: { latitude: number; longitude: number }) => {
    setLoading(true); setError(null);
    try {
      const response = await fetch('/api/personalized-recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(coordinates ?? {}) });
      const body = await response.json() as { data?: Result; error?: { message?: string } };
      if (!response.ok || !body.data) throw new Error(body.error?.message ?? 'Unable to load recommendations');
      setResult(body.data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Unable to load recommendations'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  function useMyLocation() {
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
    <p className="text-xs font-semibold tracking-[0.18em] text-primary">{personalized ? 'PERSONALISED FOR YOU' : 'FOR YOU'}</p>
    <div className="mt-2 flex flex-wrap items-end justify-between gap-4"><div><h1 className="font-[family-name:var(--font-display)] text-4xl font-bold text-foreground">Your Malaysia, your way</h1><p className="mt-2 text-muted-foreground">{personalized ? 'Handpicked recommendations that match your travel preferences.' : 'Popular experiences from MyWisata.'}</p></div><button type="button" onClick={useMyLocation} disabled={locationBusy || loading} className="inline-flex items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-primary hover:bg-secondary disabled:opacity-50"><MapPin size={16} />{locationBusy ? 'Locating…' : 'Use my location'}</button></div>
    {error && <p className="mt-5 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error}</p>}
    {result?.locationSource === 'city' && <p className="mt-4 text-xs text-muted-foreground">Showing distances from your profile city.</p>}
    {!personalized && !loading && <p className="mt-5 rounded-xl bg-secondary p-4 text-sm text-muted-foreground">Complete your profile and travel survey to unlock personalised suggestions. <Link href="/customer/profile" className="font-semibold text-primary">Continue verification →</Link></p>}
    {loading ? <div className="flex min-h-64 items-center justify-center text-sm text-muted-foreground"><Loader2 className="mr-2 animate-spin" size={18} /> Loading recommendations…</div> : <div className="mt-8 grid gap-5 md:grid-cols-3">{result?.activities.map(({ activity, whyItFits }) => <article key={activity.id} className="overflow-hidden rounded-2xl border border-border bg-card"><img src={activity.image} alt="" className="h-44 w-full object-cover" /><div className="p-4"><p className="text-xs font-semibold text-primary">{activity.category}</p><h2 className="mt-1 font-bold text-foreground">{activity.name}</h2><p className="mt-1 text-sm text-muted-foreground">{activity.outlet.city}, {activity.outlet.state}</p><p className="mt-2 text-sm font-semibold">{toRM(activity.price)}</p>{personalized && <div className="mt-3 rounded-xl bg-primary p-3 text-sm text-white"><strong>Why it fits you</strong><p className="mt-1 text-primary-foreground/90">{whyItFits}</p></div>}</div></article>)}</div>}
    <Link href="/customer/profile#preferences" className="mt-8 inline-block font-semibold text-primary">Edit preferences →</Link>
  </div>;
}
