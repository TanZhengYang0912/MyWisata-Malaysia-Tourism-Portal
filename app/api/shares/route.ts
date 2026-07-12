// P4 — Member 4: share tracking
// POST /api/shares — log a Share-button press into share_events.
// share_events has a real insert-own RLS policy (007_public_read_policies.sql:
// user_id = auth.uid() OR user_id IS NULL), so the cookie-aware client is fine
// here — see CLAUDE.md Section 2 for when that's NOT true on the other tables.

import { createClient } from '@/lib/supabase/server';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { shareEventSchema } from '@/lib/validation/affiliate-schemas';

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiFail('UNAUTHORIZED', 'Sign in required', 401);

  const parsed = await parseBody(request, shareEventSchema);
  if (!parsed.ok) return parsed.response;
  const { productId, platform } = parsed.data;

  const { data: link } = await supabase
    .from('affiliate_links')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle();

  const { data, error } = await supabase
    .from('share_events')
    .insert({
      user_id: user.id,
      content_type: 'product',
      content_id: productId,
      platform,
      affiliate_id: link?.id ?? null,
    })
    .select('id')
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  return apiOk({ id: data.id }, { status: 201 });
}
