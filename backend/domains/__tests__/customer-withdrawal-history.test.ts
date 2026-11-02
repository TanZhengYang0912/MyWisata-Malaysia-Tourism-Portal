import { beforeEach, describe, expect, it, vi } from 'vitest';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('@/backend/supabase', async () => {
  const { createClient } = await import('@supabase/supabase-js');
  return { supabase: createClient('https://wallet.test', 'test-anon-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: request },
  }) };
});

import { getMyWithdrawalHistoryPage } from '../commerce';
import { supabase } from '@/backend/supabase';

function withdrawalRow(index: number) {
  return {
    id: `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`,
    user_id: 'owner-1',
    amount: 51,
    status: index === 0 ? 'failed' : 'completed',
    requires_dual_approval: false,
    destination_label: 'Bank account ••••1234',
    created_at: new Date(Date.UTC(2026, 9, 28) - index * 1000).toISOString(),
  };
}

function response(rows: object[], total: number) {
  return new Response(JSON.stringify(rows), {
    headers: { 'content-type': 'application/json', 'content-range': `0-${rows.length - 1}/${total}` },
  });
}

describe('customer withdrawal history query', () => {
  beforeEach(() => request.mockReset());

  it('reads a bounded owner-scoped page and uses a stable next cursor', async () => {
    request.mockResolvedValue(response(Array.from({ length: 26 }, (_, index) => withdrawalRow(index)), 42));

    const page = await getMyWithdrawalHistoryPage(supabase, 'owner-1', { pageSize: 25, cursor: null });
    const url = new URL(String(request.mock.calls[0][0]));

    expect(url.pathname).toBe('/rest/v1/withdrawal_requests');
    expect(url.searchParams.get('user_id')).toBe('eq.owner-1');
    expect(url.searchParams.get('order')).toBe('created_at.desc,id.desc');
    expect(url.searchParams.get('limit')).toBe('26');
    expect(url.searchParams.get('select')).toBe('id,user_id,amount,status,requires_dual_approval,destination_label,created_at');
    expect(page.requests).toHaveLength(25);
    expect(page.totalCount).toBe(42);
    expect(page.hasMore).toBe(true);
    expect(page.nextCursor).toEqual({ createdAt: withdrawalRow(24).created_at, id: withdrawalRow(24).id });
  });

  it('uses both timestamp and id in the descending cursor predicate', async () => {
    request.mockResolvedValue(response([withdrawalRow(2)], 3));
    const cursor = { createdAt: '2026-10-28T00:00:00.000Z', id: withdrawalRow(0).id };

    await getMyWithdrawalHistoryPage(supabase, 'owner-1', { pageSize: 25, cursor });
    const url = new URL(String(request.mock.calls[0][0]));

    expect(url.searchParams.get('or')).toContain('created_at.lt.2026-10-28T00:00:00.000Z');
    expect(url.searchParams.get('or')).toContain(`and(created_at.eq.2026-10-28T00:00:00.000Z,id.lt.${cursor.id})`);
    expect(url.searchParams.get('user_id')).toBe('eq.owner-1');
  });

  it('returns an empty terminal page without inventing a next cursor', async () => {
    request.mockResolvedValue(response([], 0));

    const page = await getMyWithdrawalHistoryPage(supabase, 'owner-1', { pageSize: 25, cursor: null });

    expect(page.requests).toEqual([]);
    expect(page.hasMore).toBe(false);
    expect(page.nextCursor).toBeNull();
  });
});
