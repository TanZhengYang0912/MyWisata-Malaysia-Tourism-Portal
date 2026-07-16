// P4 — Member 4: user-facing leaderboard rank. CLAUDE-QUICKWINS.md Item 1.
// GET /api/affiliate/rank — "this month" rank by commission earned, same
// ranking algorithm the admin leaderboard uses (see lib/affiliate/leaderboard.ts).

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { apiOk, apiFail } from '@/lib/validation/schemas';
import { getUserRank } from '@/lib/affiliate/leaderboard';

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  // affiliate_clicks/affiliate_attributions have own-link-scoped SELECT RLS
  // (migration 011) and affiliate_links its own-row policy — but this route
  // needs to see OTHER users' links/attributions too, to compute where the
  // caller ranks among everyone. Service-role after the auth check above:
  // there's no per-row permission to check here, ranking is inherently a
  // cross-user computation. Only the aggregate rank number and anonymised
  // peer codes ever leave this route — never another user's identity.
  const service = createServiceClient();

  const rank = await getUserRank(service, user.id);
  return apiOk(rank);
}
