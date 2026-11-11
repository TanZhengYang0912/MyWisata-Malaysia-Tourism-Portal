import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  getLatestReplyTimestamps: vi.fn(),
  isUnread: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from }) }));
vi.mock('@/lib/support/unread', () => ({ getLatestReplyTimestamps: mocks.getLatestReplyTimestamps, isUnread: mocks.isUnread }));

import { GET } from '../route';

function row(id: string) {
  return { id, subject: `Question ${id}`, category: 'general', status: 'open', withdrawal_id: null, created_at: '2026-11-11T00:00:00.000Z', last_reply_at: null, customer_last_read_at: null };
}

function configurePages(pages: Array<{ data: ReturnType<typeof row>[]; count: number | null; error: unknown }>) {
  const range = vi.fn();
  for (const page of pages) range.mockResolvedValueOnce(page);
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  query.select = () => query;
  query.eq = () => query;
  query.order = () => query;
  query.range = range;
  mocks.from.mockReturnValue(query);
  return range;
}

describe('GET /api/support/tickets customer pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
    mocks.getLatestReplyTimestamps.mockResolvedValue(new Map());
    mocks.isUnread.mockReturnValue(false);
  });

  it('reads one bounded page, counts the owner-filtered result, and aggregates unread only for that page', async () => {
    const rows = Array.from({ length: 10 }, (_, index) => row(`ticket-${index + 1}`));
    const range = configurePages([{ data: rows, count: 12, error: null }]);
    const response = await GET(new Request('http://localhost/api/support/tickets?page=2'));
    const body = await response.json();

    expect(range).toHaveBeenCalledWith(10, 19);
    expect(mocks.getLatestReplyTimestamps).toHaveBeenCalledWith(expect.anything(), rows.map((ticket) => ticket.id), 'admin');
    expect(body.data).toMatchObject({ page: 2, pageSize: 10, total: 12, totalPages: 2, tickets: expect.any(Array) });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('clamps a stale page to the last page after the result count shrinks', async () => {
    const lastPage = [row('ticket-11'), row('ticket-12')];
    const range = configurePages([
      { data: [], count: 12, error: null },
      { data: lastPage, count: null, error: null },
    ]);
    const response = await GET(new Request('http://localhost/api/support/tickets?page=5'));
    const body = await response.json();

    expect(range.mock.calls).toEqual([[40, 49], [10, 19]]);
    expect(body.data).toMatchObject({ page: 2, total: 12, totalPages: 2 });
    expect(body.data.tickets.map((ticket: { id: string }) => ticket.id)).toEqual(['ticket-11', 'ticket-12']);
  });

  it('rejects malformed page values without querying ticket data', async () => {
    const range = configurePages([]);
    const response = await GET(new Request('http://localhost/api/support/tickets?page=1.5'));

    expect(response.status).toBe(400);
    expect(range).not.toHaveBeenCalled();
  });

  it('returns an actionable safe error without database diagnostics', async () => {
    configurePages([{ data: [], count: null, error: { message: 'ECONNREFUSED 127.0.0.1:5432' } }]);
    const response = await GET(new Request('http://localhost/api/support/tickets'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('ECONNREFUSED');
    expect(JSON.stringify(body)).not.toContain('127.0.0.1');
  });
});
