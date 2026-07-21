import { createServiceClient } from '@/lib/supabase/service';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const service = createServiceClient();
    const { error } = await service.from('platform_settings').select('key').limit(1);
    if (error) {
      return Response.json({ status: 'unavailable', checks: { database: 'failed', cron: process.env.CRON_SECRET ? 'configured' : 'missing' } }, { status: 503 });
    }
    return Response.json({ status: 'ok', checks: { database: 'ok', cron: process.env.CRON_SECRET ? 'configured' : 'missing' } });
  } catch (error) {
    console.error('[health] database check failed:', error instanceof Error ? error.message : error);
    return Response.json({ status: 'unavailable', checks: { database: 'failed', cron: process.env.CRON_SECRET ? 'configured' : 'missing' } }, { status: 503 });
  }
}
