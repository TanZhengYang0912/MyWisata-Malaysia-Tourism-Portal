import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), createServiceClient: vi.fn(), isSuperAdmin: vi.fn() }));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/affiliate/admin-guard', () => ({ isSuperAdmin: mocks.isSuperAdmin }));

import { GET } from '../route';

function document(id: string) {
  return { id, title: `Guide ${id}`, body: 'Body', keywords: [], category: 'general', is_active: true, embedded_at: null, updated_at: '2026-11-11T00:00:00.000Z', created_at: '2026-11-10T00:00:00.000Z' };
}

function configurePages(pages: Array<{ data: ReturnType<typeof document>[]; count: number | null; error: unknown }>) {
  const range = vi.fn();
  for (const page of pages) range.mockResolvedValueOnce(page);
  const query: Record<string, (...args: unknown[]) => unknown> = {};
  query.select = () => query;
  query.order = () => query;
  query.range = range;
  mocks.createServiceClient.mockReturnValue({ from: vi.fn(() => query) });
  return range;
}

describe('GET /api/admin/chatbot/kb pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({ auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'admin-1' } } }) } });
    mocks.isSuperAdmin.mockResolvedValue(true);
  });

  it('returns a bounded page with its exact total', async () => {
    const rows = Array.from({ length: 4 }, (_, index) => document(`doc-${index + 11}`));
    const range = configurePages([{ data: rows, count: 14, error: null }]);
    const response = await GET(new Request('http://localhost/api/admin/chatbot/kb?page=2'));
    const body = await response.json();

    expect(range).toHaveBeenCalledWith(10, 19);
    expect(body.data).toMatchObject({ page: 2, pageSize: 10, total: 14, totalPages: 2, documents: expect.any(Array) });
    expect(response.headers.get('Cache-Control')).toBe('private, no-store');
  });

  it('clamps a stale page when documents have been removed', async () => {
    const range = configurePages([
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
});
