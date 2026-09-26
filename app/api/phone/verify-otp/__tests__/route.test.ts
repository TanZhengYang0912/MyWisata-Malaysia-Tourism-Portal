import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), from: vi.fn(), serviceFrom: vi.fn(), rpc: vi.fn(), verifyOtp: vi.fn(),
  auditUpdate: null as Record<string, ReturnType<typeof vi.fn>> | null,
}));

function query(data: unknown, error: unknown = null) {
  const terminal = Promise.resolve({ data, error });
  const builder: Record<string, ReturnType<typeof vi.fn>> = {};
  for (const method of ['select', 'eq', 'is', 'gt', 'order', 'limit', 'update']) builder[method] = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => terminal);
  builder.then = terminal.then.bind(terminal) as ReturnType<typeof vi.fn>;
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({
  auth: { getUser: mocks.getUser }, from: mocks.from, rpc: mocks.rpc,
})) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.serviceFrom, rpc: mocks.rpc })) }));
vi.mock('@/lib/twilio', () => ({ verifyOtp: mocks.verifyOtp }));

import { POST } from '../route';

function request(phone = '+60123456789') {
  return new Request('http://localhost/api/phone/verify-otp', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone, code: '123456' }),
  });
}

describe('POST /api/phone/verify-otp', () => {
  let serviceReadCount = 0;

  beforeEach(() => {
    vi.clearAllMocks();
    serviceReadCount = 0;
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.from.mockImplementation(() => query({ id: 'reservation-1' }));
    mocks.serviceFrom.mockImplementation(() => {
      serviceReadCount += 1;
      mocks.auditUpdate = query({ id: 'reservation-1' });
      return mocks.auditUpdate;
    });
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    mocks.verifyOtp.mockResolvedValue({ ok: true });
  });

  it('requires an unexpired OTP reservation owned by this user before verifying', async () => {
    mocks.serviceFrom.mockImplementation(() => query(null));
    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(mocks.verifyOtp).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalledWith('promote_to_phone_verified', expect.anything());
  });

  it('promotes only after provider approval and records the exact reservation as verified', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc).toHaveBeenCalledWith('promote_to_phone_verified', { p_user_id: 'user-1', p_phone: '+60123456789' });
    expect(mocks.auditUpdate?.update).toHaveBeenCalledWith({ verified_at: expect.any(String) });
    expect(mocks.auditUpdate?.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(mocks.auditUpdate?.eq).toHaveBeenCalledWith('phone', '+60123456789');
  });

  it('keeps identity promotion successful but reports when its audit row could not be marked', async () => {
    mocks.serviceFrom.mockImplementation(() => {
      serviceReadCount += 1;
      return serviceReadCount === 1 ? query({ id: 'reservation-1' }) : query(null, { message: 'audit write failed' });
    });
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ data: { verified: true, auditRecorded: false } });
  });
});
