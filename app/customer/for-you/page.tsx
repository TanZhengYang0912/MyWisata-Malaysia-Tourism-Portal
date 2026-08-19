import ForYouClient from './for-you-client';
import { createClient } from '@/lib/supabase/server';
import { searchActivities } from '@/backend/domains/catalogue';

export default async function ForYouPage() {
  const db = await createClient();
  const activities = await searchActivities({ category: null, sort: "recommended" }, db);
  return <ForYouClient initialPopular={activities.slice(0, 6)} />;
}
