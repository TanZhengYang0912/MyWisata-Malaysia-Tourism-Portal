import { cleanupSupportAttachments } from '@/lib/support/attachment-cleanup';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return Response.json({ error: 'unauthorized' }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  }

  try {
    const result = await cleanupSupportAttachments();
    return Response.json(result, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ error: 'support_maintenance_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
