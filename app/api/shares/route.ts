// P4 — Member 4: share tracking
// POST /api/shares — log a Share-button press into share_events.
//
// Anonymous shares (a logged-out user sharing a plain, non-affiliate link —
// a normal flow) are logged too, with user_id: null — share_events' RLS
// insert policy already allows this (007_public_read_policies.sql:
// user_id = auth.uid() OR user_id IS NULL). But the `anon` Postgres role was
// only ever GRANTed SELECT on all tables (006_fix_default_grants.sql), never
// INSERT, so an anonymous request through the cookie-aware client would
// still fail at the grants layer before RLS is even reached — same root
// cause lib/affiliate/redirect.ts already works around for affiliate_clicks.
// Same fix here: the service-role client for an anonymous request, the
// cookie-aware one (RLS-scoped to the caller) for a logged-in one.

import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { parseBody, apiOk, apiFail } from '@/lib/validation/schemas';
import { shareEventSchema } from '@/lib/validation/affiliate-schemas';
import { recordInteraction, type InteractionEntity } from '@/lib/interactions';
import { classifyUserAgent } from '@/lib/device/classify-user-agent';

export async function POST(request: Request) {
  const authClient = await createClient();
  const { data: { user } } = await authClient.auth.getUser();
  const db = user ? authClient : createServiceClient();

  const parsed = await parseBody(request, shareEventSchema);
  if (!parsed.ok) return parsed.response;
  const { shareType, contentId, platform } = parsed.data;

  const link = user
    ? (await db.from('affiliate_links').select('id').eq('user_id', user.id).maybeSingle()).data
    : null;

  const device = classifyUserAgent(request.headers.get('user-agent'));

  const { data, error } = await db
    .from('share_events')
    .insert({
      user_id: user?.id ?? null,
      content_type: shareType,
      content_id: contentId,
      platform,
      affiliate_id: link?.id ?? null,
      device,
    })
    .select('id')
    .single();

  if (error) return apiFail('DB_ERROR', error.message, 500);
  if (user && (['vendor', 'outlet', 'product'] as string[]).includes(shareType)) {
    await recordInteraction(authClient, user.id, 'share', shareType as InteractionEntity, contentId);
  }
  return apiOk({ id: data.id }, { status: 201 });
}
