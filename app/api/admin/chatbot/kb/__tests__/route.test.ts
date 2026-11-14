import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createServiceClient: vi.fn(), isSuperAdmin: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { GET, POST } from '../route';

function document(id: string) {
  return { id, title: `Guide ${id}`, body: 'Body', keywords: [], category: 'general', is_active: true, embedded_at: null, updated_at: '2026-11-11T00:00:00.000Z', created_at: '2026-11-10T00:00:00.000Z', content_version: 1 };
}

function configurePages(pages: Array<{ data: ReturnType<typeof document>[]; count: number | null; error: unknown }>) {
  const range = vi.fn();
  const order = vi.fn();
  for (const page of pages) range.mockResolvedValueOnce(page);
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  query.select = () => query;
  query.order = (...args: unknown[]) => { order(...args); return query; };
  query.range = range;
  const revisionsQuery: Record<string, (...args: unknown[]) => unknown> = {};
  revisionsQuery.select = () => revisionsQuery;
  revisionsQuery.in = () => revisionsQuery;
  revisionsQuery.eq = () => revisionsQuery;
  revisionsQuery.then = (...args: unknown[]) => {
    const resolve = args[0] as ((value: unknown) => unknown) | undefined;
    return Promise.resolve({ data: [], error: null }).then(resolve);
  };
  mocks.createServiceClient.mockReturnValue({ from: vi.fn((table: string) => table === 'chatbot_kb_revisions' ? revisionsQuery : query) });
  return { range, order };
}

describe('GET /api/admin/chatbot/kb pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) } });
    mocks.isSuperAdmin.mockResolvedValue(true);
  });

  it('returns a bounded page with its exact total', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => document(`doc-${index + 11}`));
    const { range, order } = configurePages([{ data: rows, count: 14, error: null }]);
    const response = await GET(new Request('http://localhost/api/admin/chatbot/kb?page=2'));
    const body = await response.json();

    expect(range).toHaveBeenCalledWith(10, 19);
    expect(order.mock.calls).toEqual([
      ['is_active', { ascending: false }],
      ['title', { ascending: true }],
      ['created_at', { ascending: false }],
    ]);
    expect(body.data).toMatchObject({ page: 2, pageSize: 10, total: 14, totalPages: 2, documents: expect.any(Array) });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('clamps a stale page when documents have been removed', async () => {
    const { range } = configurePages([
      { data: [], count: 11, error: null },
      { data: [document('doc-11')], count: null, error: null },
    ]);
    const response = await GET(new Request('http://localhost/api/admin/chatbot/kb?page=4'));
    const body = await response.json();

    expect(range.mock.calls).toEqual([[30, 39], [10, 19]]);
    expect(body.data).toMatchObject({ page: 2, total: 11, totalPages: 2 });
  });

  it('keeps the super-admin check and hides database diagnostics', async () => {
    configurePages([{ data: [], count: null, error: { message: 'database connection password' } }]);
    const response = await GET(new Request('http://localhost/api/admin/chatbot/kb'));
    const body = await response.json();

    expect(mocks.isSuperAdmin).toHaveBeenCalledWith(expect.anything(), 'admin-1');
    expect(response.status).toBe(503);
    expect(JSON.stringify(body)).not.toContain('password');
  });

  it('creates a private review draft with a stable operation id', async () => {
    const operationId = '8ba6dd1a-255d-44dc-a416-aef13264efca';
    const rpc = vi.fn().mockResolvedValue({ data: { documentId: 'doc-1', revisionId: 'revision-1', changed: true, contentVersion: 0 }, error: null });
    mocks.createServiceClient.mockReturnValue({ rpc });
    const response = await POST(new Request('http://localhost/api/admin/chatbot/kb', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Refund status', body: 'Check your account page.', keywords: ['refund'], category: 'payment', sourceRefs: [], operationId }),
    }));
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('save_chatbot_kb_revision', expect.objectContaining({
      p_document_id: null,
      p_author_id: 'admin-1',
      p_operation_id: operationId,
    }));
  });
});
