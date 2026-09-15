// P4 — recommendation earnings for the current recommender.
// GET /api/recommendations/earnings — pending/cleared totals + a per-commission
// list, the recommendation-side mirror of GET /api/affiliate/stats. No
// capability gate: a user with no recommendations just gets zeros.

import { createClient } from '@/lib/supabase/server';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { getRecommendationEarnings } from '@/lib/recommendations/earnings';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  return apiOk(await getRecommendationEarnings(supabase, user.id));
}
