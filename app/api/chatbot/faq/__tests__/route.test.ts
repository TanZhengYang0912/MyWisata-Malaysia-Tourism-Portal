import { describe, expect, it, vi, beforeEach } from 'vitest';

const createClient = vi.fn();
vi.mock('@/lib/supabase/server', () => ({ createClient }));

const { GET } = await import('../route');

function queryStub(resultForRange: (from: number, to: number) => { data: unknown; error: unknown; count: number }) {
  const builder: Record<string, unknown> = {};
  let from = 0;
  let to = 9;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.or = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.range = vi.fn((nextFrom: number, nextTo: number) => {
    from = nextFrom;
    to = nextTo;
    return builder;
  });
  builder.then = (resolve: (value: unknown) => unknown) => Promise.resolve(resultForRange(from, to)).then(resolve);
  return builder;
}

function request(search = '') {
  return new Request(`http://localhost/api/chatbot/faq${search}`);
}

describe('GET /api/chatbot/faq', () => {
  let from: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    from = vi.fn();
    rpc = vi.fn();
    createClient.mockResolvedValue({ from, rpc });
  });

  it('loads bounded category counts from the database', async () => {
    rpc.mockResolvedValue({ data: [{ category: 'booking', question_count: 15 }], error: null });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('list_support_faq_categories');
    expect(body.data.categories).toEqual([{ category: 'booking', count: 15 }]);
    expect(from).not.toHaveBeenCalled();
  });

  it('loads one stable database page of active questions for the selected category', async () => {
    const query = queryStub((_start, _end) => ({
      data: [{ id: 'q11', title: 'Question 11', category: 'wallet' }],
      error: null,
      count: 11,
    }));
    from.mockReturnValue(query);

    const response = await GET(request('?category=wallet&page=2'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(query.select).toHaveBeenCalledWith('id,title', { count: 'exact' });
    expect(query.eq).toHaveBeenCalledWith('is_active', true);
    expect(query.eq).toHaveBeenCalledWith('category', 'wallet');
    expect(query.order).toHaveBeenNthCalledWith(1, 'title');
    expect(query.order).toHaveBeenNthCalledWith(2, 'id');
    expect(query.range).toHaveBeenCalledWith(10, 19);
    expect(body.data).toMatchObject({
      category: 'wallet',
      questions: [{ id: 'q11', question: 'Question 11' }],
      page: 2,
      pageSize: 10,
      total: 11,
      totalPages: 2,
    });
  });

  it('includes uncategorised rows in the general category', async () => {
    const query = queryStub(() => ({ data: [{ id: 'q1', title: 'General question' }], error: null, count: 1 }));
    from.mockReturnValue(query);

    const response = await GET(request('?category=general'));

    expect(response.status).toBe(200);
    expect(query.or).toHaveBeenCalledWith('category.is.null,category.eq.general');
  });

  it('clamps an out-of-range page and re-reads only the last page', async () => {
    const query = queryStub((start, _end) => ({
      data: start === 10 ? [
        { id: 'q11', title: 'Question 11' },
        { id: 'q12', title: 'Question 12' },
      ] : [],
      error: null,
      count: 12,
    }));
    from.mockReturnValue(query);

    const response = await GET(request('?category=booking&page=8'));
    const body = await response.json();

    expect(query.range).toHaveBeenNthCalledWith(1, 70, 79);
    expect(query.range).toHaveBeenNthCalledWith(2, 10, 19);
    expect(body.data).toMatchObject({ page: 2, totalPages: 2, total: 12 });
    expect(body.data.questions).toHaveLength(2);
  });

  it('rejects invalid category and page values before reading the database', async () => {
    expect((await GET(request('?category=not a category'))).status).toBe(400);
    expect((await GET(request('?category=wallet&page=-2'))).status).toBe(400);
    expect(from).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('returns a safe retryable error when category counts fail', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'postgres://internal.invalid/private' } });

    const response = await GET(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('postgres://internal.invalid/private');
  });

  it('returns a safe retryable error when a question page fails', async () => {
    from.mockReturnValue(queryStub(() => ({ data: null, error: { message: 'private diagnostic' }, count: 0 })));

    const response = await GET(request('?category=wallet'));
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.code).toBe('READ_UNAVAILABLE');
    expect(JSON.stringify(body)).not.toContain('private diagnostic');
  });
});
