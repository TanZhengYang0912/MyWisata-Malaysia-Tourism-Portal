import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { searchActivities } from '@/backend/domains/catalogue';
import { rankPersonalizedActivities } from '@/lib/personalization/scorer';
import { toRM } from '@/lib/money';

export default async function ForYouPage() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) return null;
  const [{ data: profile }, { data: survey }, activities] = await Promise.all([
    db.from('users').select('tier').eq('id', user.id).maybeSingle(),
    db.from('preference_survey_responses').select('interests,budget_range,mobility_needs,preferred_distance').eq('user_id', user.id).maybeSingle(),
    searchActivities({ category: null, sort: 'recommended' }, db),
  ]);
  const personalized = profile?.tier === 'profile_complete' || profile?.tier === 'kyc_verified';
  const cards = personalized && survey ? rankPersonalizedActivities(activities, { interests: survey.interests ?? [], budgetRange: survey.budget_range, mobilityNeeds: survey.mobility_needs, preferredDistance: survey.preferred_distance ?? 'no_preference' }) : activities.map((activity) => ({ activity, score: 0, whyItFits: 'A popular choice from MyWisata.' }));
  return <div className="mx-auto max-w-7xl px-5 py-10"><p className="text-xs font-semibold tracking-[0.18em] text-primary">{personalized ? 'PERSONALISED FOR YOU' : 'FOR YOU'}</p><h1 className="mt-2 font-[family-name:var(--font-display)] text-4xl font-bold text-foreground">Your Malaysia, your way</h1><p className="mt-2 text-muted-foreground">{personalized ? 'Handpicked recommendations that match your travel preferences.' : 'Verify your profile and survey to unlock personalised recommendations.'}</p>{personalized && <div className="mt-5 flex flex-wrap gap-2 text-xs">{[...(survey?.interests ?? []), survey?.budget_range?.replace('_', ' '), survey?.preferred_distance?.replace('_', ' ')].filter(Boolean).map((label) => <span key={label} className="rounded-full border border-border px-3 py-1.5">{label}</span>)}</div>}<div className="mt-8 grid gap-5 md:grid-cols-3">{cards.slice(0, 6).map(({ activity, whyItFits }) => <article key={activity.id} className="overflow-hidden rounded-2xl border border-border bg-card"><img src={activity.image} alt="" className="h-44 w-full object-cover" /><div className="p-4"><p className="text-xs font-semibold text-primary">{activity.category}</p><h2 className="mt-1 font-bold text-foreground">{activity.name}</h2><p className="mt-1 text-sm text-muted-foreground">{activity.outlet.city}, {activity.outlet.state}</p><p className="mt-2 text-sm font-semibold">{toRM(activity.price)}</p><div className="mt-3 rounded-xl bg-primary p-3 text-sm text-white"><strong>Why it fits you</strong><p className="mt-1 text-primary-foreground/90">{whyItFits}</p></div></div></article>)}</div><Link href="/customer/profile#preferences" className="mt-8 inline-block font-semibold text-primary">Edit preferences →</Link></div>;
}
