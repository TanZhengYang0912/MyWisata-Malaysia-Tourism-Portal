import { describe, expect, it, vi, beforeEach } from 'vitest';

const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient }));

const { GET } = await import('../route');

/** Chainable stub matching .select().eq().order().order() resolving to a result. */
function queryStub(result: { data: unknown; error: unknown }) {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  // The route chains .order() twice; the last call is awaited.
  builder.order = vi.fn(() => builder);
  builder.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return builder;
}

describe('GET /api/chatbot/faq', () => {
  let from: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    from = vi.fn();
    createClient.mockResolvedValue({ from });
  });

  it('groups active KB entries by category, sorted by category name', async () => {
    from.mockReturnValue(queryStub({
      data: [
        { id: 'w1', title: 'Withdrawal timeline?', category: 'wallet' },
        { id: 'b1', title: 'How to book an activity?', category: 'booking' },
        { id: 'b2', title: 'Can I reschedule or cancel my booking?', category: 'booking' },
      ],
      error: null,
    }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.categories).toEqual([
      {
        category: 'booking',
        questions: [
          { id: 'b1', question: 'How to book an activity?' },
          { id: 'b2', question: 'Can I reschedule or cancel my booking?' },
        ],
      },
      { category: 'wallet', questions: [{ id: 'w1', question: 'Withdrawal timeline?' }] },
    ]);
  });

  it('files an uncategorised entry under "general" rather than a null bucket', async () => {
    from.mockReturnValue(queryStub({
      data: [{ id: 'x1', title: 'Something uncategorised', category: null }],
      error: null,
    }));

    const body = await (await GET()).json();

    expect(body.data.categories).toEqual([
      { category: 'general', questions: [{ id: 'x1', question: 'Something uncategorised' }] },
    ]);
  });

  it('filters to active entries only', async () => {
    const stub = queryStub({ data: [], error: null });
    from.mockReturnValue(stub);

    await GET();

    expect(stub.eq).toHaveBeenCalledWith('is_active', true);
  });

  it('returns an empty list (not an error) when the KB has no entries', async () => {
    from.mockReturnValue(queryStub({ data: [], error: null }));

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.categories).toEqual([]);
  });

  it('surfaces a database failure as a 500', async () => {
    from.mockReturnValue(queryStub({ data: null, error: { message: 'kb unavailable' } }));

    const response = await GET();

    expect(response.status).toBe(500);
  });
});
