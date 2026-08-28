import { existsSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  ownerEqId: vi.fn(),
  ownerEqUser: vi.fn(),
  ownerMaybeSingle: vi.fn(),
  serviceFrom: vi.fn(),
  eventSelect: vi.fn(),
  eventEq: vi.fn(),
  eventOrder: vi.fn(),
  vendorSelect: vi.fn(),
  vendorEq: vi.fn(),
  vendorMaybeSingle: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: () => ({ select: () => ({ eq: mocks.ownerEqId }) }),
  })),
}));
vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom })),
}));

const routeModule = existsSync('app/api/recommendations/[id]/route.ts')
  ? await import('../route')
  : null;
const GET = routeModule?.GET;

const context = { params: Promise.resolve({ id: '11111111-1111-4111-8111-111111111111' }) };

describe('GET /api/recommendations/[id]', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'customer-1' } }, error: null });
    mocks.ownerEqId.mockReturnValue({ eq: mocks.ownerEqUser });
    mocks.ownerEqUser.mockReturnValue({ maybeSingle: mocks.ownerMaybeSingle });
    mocks.ownerMaybeSingle.mockResolvedValue({ data: {
      id: '11111111-1111-4111-8111-111111111111', recommender_id: 'customer-1', vendor_name: 'Kedai Makan', description: 'Local food', why_recommend: 'Authentic', status: 'changes_requested', state: 'Penang', created_at: '2026-08-24T00:00:00Z', reviewed_at: '2026-08-25T00:00:00Z', changes_requested_at: '2026-08-25T00:00:00Z', changes_requested_reason: 'Please add opening hours.', rejection_reason: null, converted_vendor_id: null, categories: { name: 'Food' },
    }, error: null });
    mocks.serviceFrom.mockImplementation((table: string) => table === 'recommendation_review_events'
      ? { select: mocks.eventSelect }
      : { select: mocks.vendorSelect });
    mocks.eventSelect.mockReturnValue({ eq: mocks.eventEq });
    mocks.eventEq.mockReturnValue({ order: mocks.eventOrder });
    mocks.eventOrder.mockResolvedValue({ data: [{ id: 'event-1', from_status: 'pending', to_status: 'changes_requested', action: 'request_changes', customer_message: 'Please add opening hours.', created_at: '2026-08-25T00:00:00Z' }], error: null });
    mocks.vendorSelect.mockReturnValue({ eq: mocks.vendorEq });
    mocks.vendorEq.mockReturnValue({ maybeSingle: mocks.vendorMaybeSingle });
    mocks.vendorMaybeSingle.mockResolvedValue({ data: null, error: null });
  });

  it('returns only customer-safe detail for the authenticated owner', async () => {
    expect(GET).toBeTypeOf('function');
    if (!GET) return;
    const response = await GET(new Request('http://localhost/api/recommendations/11111111-1111-4111-8111-111111111111'), context);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.ownerEqId).toHaveBeenCalledWith('id', '11111111-1111-4111-8111-111111111111');
    expect(mocks.ownerEqUser).toHaveBeenCalledWith('recommender_id', 'customer-1');
    expect(body.data.events[0].message).toBe('Please add opening hours.');
    expect(JSON.stringify(body)).not.toContain('internal_note');
    expect(JSON.stringify(body)).not.toContain('qualityScore');
  });

  it('returns 404 for a foreign or missing recommendation before service queries', async () => {
    expect(GET).toBeTypeOf('function');
    if (!GET) return;
    mocks.ownerMaybeSingle.mockResolvedValue({ data: null, error: null });

    const response = await GET(new Request('http://localhost/api/recommendations/11111111-1111-4111-8111-111111111111'), context);

    expect(response.status).toBe(404);
    expect(mocks.serviceFrom).not.toHaveBeenCalled();
  });
});
