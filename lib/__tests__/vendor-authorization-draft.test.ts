import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), from: vi.fn(), createServiceClient: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, from: mocks.from })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

import { authorizeVendor, authorizeVendorProductWrite } from '../vendor-authorization';

const VENDOR_ID = '5f2c1a7e-2026-4123-8123-0123456789ab';

function chain(result: unknown) {
  const value = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn(), then: vi.fn() };
  value.select.mockReturnValue(value);
  value.eq.mockReturnValue(value);
  value.maybeSingle.mockResolvedValue(result);
  value.then.mockImplementation((resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) => Promise.resolve(result).then(resolve, reject));
  return value;
}

describe('authorizeVendor draft owner access', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.createServiceClient.mockReturnValue({});
  });

  it('answers a malformed vendor id with 400 instead of letting the database error become a 500', async () => {
    const result = await authorizeVendor('null');

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(400);
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('allows the legal owner to edit a pending vendor draft', async () => {
    const vendor = chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status: 'pending' }, error: null });
    const outlets = chain({ data: [], error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors' ? vendor : outlets);

    const result = await authorizeVendor(VENDOR_ID, ['vendor_owner']);

    expect(result.ok).toBe(true);
    if (result.ok) expect(result.access.isOwner).toBe(true);
  });

  it('blocks pending owners from approved-vendor operations', async () => {
    const vendor = chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status: 'pending' }, error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors' ? vendor : chain({ data: [], error: null }));

    const result = await authorizeVendor(VENDOR_ID, undefined, { requireApproved: true });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect((await result.response.json()).error.code).toBe('FORBIDDEN');
    }
  });

  it('keeps approved owners authorized for operations', async () => {
    const vendor = chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status: 'approved' }, error: null });
    const outlets = chain({ data: [{ id: 'outlet-1' }], error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors' ? vendor : outlets);

    const result = await authorizeVendor(VENDOR_ID, undefined, { requireApproved: true });

    expect(result.ok).toBe(true);
  });
});

describe('authorizeVendor event vendors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.createServiceClient.mockReturnValue({});
  });

  function eventVendor() {
    const vendor = chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status: 'approved', kind: 'event' }, error: null });
    const outlets = chain({ data: [], error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors' ? vendor : outlets);
  }

  it('rejects the owner of an event vendor on routes that do not opt in', async () => {
    eventVendor();
    const result = await authorizeVendor(VENDOR_ID);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(403);
      expect((await result.response.json()).error.code).toBe('EVENT_VENDOR_FORBIDDEN');
    }
  });

  it('allows the owner of an event vendor on opted-in routes', async () => {
    eventVendor();
    const result = await authorizeVendor(VENDOR_ID, undefined, { allowEventVendor: true });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.access.isOwner).toBe(true);
  });
});


describe('product write authority', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'owner-1' } }, error: null });
    mocks.createServiceClient.mockReturnValue({});
  });

  it.each(['approved', 'suspended'])('rejects %s owners even when onboarding is requested', async (status) => {
    const vendor = chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status }, error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors' ? vendor : chain({ data: [{ id: 'outlet-1' }], error: null }));
    const result = await authorizeVendorProductWrite(VENDOR_ID, { allowOwnerSetup: true });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(403);
  });

  it.each(['pending', 'rejected'])('allows only explicit %s onboarding', async (status) => {
    const vendor = chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status }, error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors' ? vendor : chain({ data: [], error: null }));
    expect((await authorizeVendorProductWrite(VENDOR_ID)).ok).toBe(false);
    expect((await authorizeVendorProductWrite(VENDOR_ID, { allowOwnerSetup: true })).ok).toBe(true);
  });

  it('preserves assigned manager writes', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'manager-1' } }, error: null });
    mocks.from.mockImplementation((table: string) => table === 'vendors'
      ? chain({ data: { id: VENDOR_ID, owner_id: 'owner-1', status: 'approved' }, error: null })
      : chain({ data: [{ outlet_id: 'outlet-1', outlets: { vendor_id: VENDOR_ID } }], error: null }));
    const result = await authorizeVendorProductWrite(VENDOR_ID);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.access.outletIds).toEqual(['outlet-1']);
  });
});
