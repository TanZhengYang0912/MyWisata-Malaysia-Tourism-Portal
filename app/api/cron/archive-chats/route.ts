import { NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase/service';
import { getChatArchiveDays } from '@/lib/chat/settings';

/**
 * POST /api/cron/archive-chats
 *
 * Marks open chat threads idle past the configured threshold as 'archived'.
 * Status-only — message history is untouched, and sendMessage reopens a
 * thread automatically the next time either side sends a message.
 */
export async function POST(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get('authorization') !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const service = createServiceClient();
  const days = await getChatArchiveDays(service);
  const { data, error } = await service.rpc('archive_inactive_chats', { days });
  if (error) {
    console.error('[cron/archive-chats] archive failed', error.message);
    return NextResponse.json({ error: 'archive_unavailable' }, { status: 500 });
  }

  return NextResponse.json({ archived: data ?? 0, thresholdDays: days });
}
