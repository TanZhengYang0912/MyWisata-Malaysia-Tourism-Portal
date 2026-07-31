import { describe, expect, it } from 'vitest';
import { parseInboxResponse } from '@/lib/vendor/inbox-response';

describe('parseInboxResponse', () => {
  it('returns an API error instead of treating a failed Inbox request as empty data', async () => {
    const result = await parseInboxResponse(
      new Response(JSON.stringify({ error: { code: 'DB_ERROR', message: 'Inbox unavailable' } }), { status: 500 }),
    );

    expect(result).toEqual({ data: [], error: 'Inbox unavailable' });
  });
});
