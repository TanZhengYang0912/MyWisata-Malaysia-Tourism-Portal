import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ guest: vi.fn(), query: {} as Record<string, ReturnType<typeof vi.fn>>, service: vi.fn() }));
vi.mock('@/lib/checkout/guest-session', () => ({ resolveGuestSession: mocks.guest, guestPrivateResponse: (data: unknown, status = 200) => Response.json({ data }, { status }) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.service }));

import { GET } from '../route';

beforeEach(() => {
  vi.clearAllMocks();
  const q = mocks.query;
  const queryResult = { data: { id: 'order-1', status: 'pending_payment' }, error: null };
  for (const method of ['select', 'eq', 'is', 'in', 'order', 'limit']) q[method] = vi.fn(() => q);
  q.maybeSingle = vi.fn(async () => queryResult);
  mocks.service.mockReturnValue({ from: vi.fn(() => q) });
  mocks.guest.mockResolvedValue({ guestSubjectId: 'guest-1' });
});

describe('GET /api/guest/orders/current', () => {
  it('returns only the latest active order for the authenticated guest subject', async () => {
    const response = await GET(new Request('https://example.test/api/guest/orders/current', { headers: { cookie: 'mylawatan-guest=test' } }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { orderId: 'order-1', status: 'pending_payment' } });
    expect(mocks.query.select).toHaveBeenCalledWith('id,status');
    expect(mocks.query.eq).toHaveBeenCalledWith('guest_subject_id', 'guest-1');
    expect(mocks.query.is).toHaveBeenCalledWith('user_id', null);
    expect(mocks.query.order).toHaveBeenCalledWith('created_at', { ascending: false });
    expect(mocks.query.limit).toHaveBeenCalledWith(1);
  });

  it('does not query or disclose an order without a valid guest session', async () => {
    mocks.guest.mockResolvedValue(null);
    const response = await GET(new Request('https://example.test/api/guest/orders/current'));
    expect(response.status).toBe(401);
    expect(mocks.service).not.toHaveBeenCalled();
  });
});
