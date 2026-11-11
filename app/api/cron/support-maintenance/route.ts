import { cleanupSupportAttachments, reconcileSupportAttachments } from '@/lib/support/attachment-cleanup';
import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const reconciliation = await reconcileSupportAttachments();
    const result = await cleanupSupportAttachments();
    const { data: expiredHandoffTokens, error: handoffCleanupError } = await createServiceClient().rpc('cleanup_support_handoff_tokens');
    if (handoffCleanupError || typeof expiredHandoffTokens !== 'number') {
      return Response.json({ error: 'support_maintenance_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ ...result, reconciliation, expiredHandoffTokens }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'support_maintenance_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
