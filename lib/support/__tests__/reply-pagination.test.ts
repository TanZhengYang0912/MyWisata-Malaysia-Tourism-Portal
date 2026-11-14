import { describe, expect, it, vi } from 'vitest';
import { loadSupportReplyPage, SUPPORT_REPLY_PAGE_SIZE } from '../reply-pagination';

function createClient(rows: unknown[]) {
  const query: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'or', 'order']) query[method] = vi.fn(() => query);
  query.limit = vi.fn(async () => ({ data: rows, error: null }));
  return {
    client: { from: vi.fn(() => query) } as never,
    query,
  };
}

describe('support reply cursor pagination', () => {
  it('bounds reads to one extra row and returns a stable cursor for older replies', async () => {
    const rows = Array.from({ length: SUPPORT_REPLY_PAGE_SIZE + 1 }, (_, index) => {
      const number = SUPPORT_REPLY_PAGE_SIZE + 1 - index;
      return {
        id: `reply-${String(number).padStart(2, '0')}`,
        sender_id: number === 31 ? 'viewer' : 'customer',
        sender_role: number === 31 ? 'admin' : 'customer',
        body: `Reply ${number}`,
        attachment_url: number === 31 ? 'private/reply-31.pdf' : null,
        created_at: new Date(Date.UTC(2026, 0, number)).toISOString(),
      };
    });
    const { client, query } = createClient(rows);

    const page = await loadSupportReplyPage(client, 'ticket-1', 'viewer');

    expect(query.eq).toHaveBeenCalledWith('ticket_id', 'ticket-1');
    expect(query.order).toHaveBeenNthCalledWith(1, 'created_at', { ascending: false });
    expect(query.order).toHaveBeenNthCalledWith(2, 'id', { ascending: false });
    expect(query.limit).toHaveBeenCalledWith(SUPPORT_REPLY_PAGE_SIZE + 1);
    expect(page.replies).toHaveLength(SUPPORT_REPLY_PAGE_SIZE);
    expect(page.replies?.[0].body).toBe('Reply 2');
    expect(page.replies?.at(-1)).toMatchObject({ id: 'reply-31', is_mine: true, attachment_type: 'document' });
    expect(page.nextCursor).toEqual({ createdAt: new Date(Date.UTC(2026, 0, 2)).toISOString(), id: 'reply-02' });
    expect(JSON.stringify(page)).not.toContain('private/reply-31.pdf');
  });

  it('uses a composite cursor and returns no next cursor when the page is complete', async () => {
    const { client, query } = createClient([]);
    const cursor = { createdAt: '2026-01-01T00:00:00.000Z', id: 'reply-id' };

    const page = await loadSupportReplyPage(client, 'ticket-1', 'viewer', cursor);

    expect(query.or).toHaveBeenCalledWith(`created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`);
    expect(page).toMatchObject({ replies: [], nextCursor: null, error: null });
  });
});
