import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ getUser: vi.fn(), rpc: vi.fn(), createServiceClient: vi.fn(), serviceRpc: vi.fn(), sendOtp: vi.fn() }));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.rpc })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));
vi.mock('@/lib/twilio', () => ({ sendOtp: mocks.sendOtp }));

import { POST } from '../route';

function request(phone = '+60123456789') {
  return new Request('http://localhost/api/phone/send-otp', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ phone }),
  });
}

describe('POST /api/phone/send-otp', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null });
    mocks.rpc.mockImplementation(async (name: string) => name === 'check_phone_collision'
      ? { data: false, error: null }
      : { data: null, error: { message: `unexpected client RPC: ${name}` } });
    mocks.serviceRpc.mockResolvedValue({ data: { reservation_id: 'reservation-1' }, error: null });
    mocks.createServiceClient.mockReturnValue({ rpc: mocks.serviceRpc });
    mocks.sendOtp.mockResolvedValue({ ok: true });
  });

  it('atomically reserves the account and phone quota before sending', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.rpc.mock.calls.map(([name]) => name)).toEqual(['check_phone_collision']);
    expect(mocks.serviceRpc).toHaveBeenCalledWith('reserve_phone_otp_send', {
      p_user_id: 'user-1',
      p_phone: '+60123456789',
    });
    expect(mocks.sendOtp).toHaveBeenCalledWith('+60123456789');
  });

  it('does not send when the atomic quota is exhausted', async () => {
    mocks.serviceRpc.mockResolvedValue({ data: null, error: { message: 'otp_rate_limited' } });

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect(mocks.sendOtp).not.toHaveBeenCalled();
  });

  it('fails closed when the phone collision lookup fails', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'database unavailable' } });
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.sendOtp).not.toHaveBeenCalled();
  });

  it('fails closed when privileged quota reservation is not configured', async () => {
    mocks.createServiceClient.mockImplementation(() => { throw new Error('service key unavailable'); });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.sendOtp).not.toHaveBeenCalled();
  });

  it('returns a generic provider failure when Twilio configuration or transport throws', async () => {
    mocks.sendOtp.mockRejectedValue(new Error('Twilio credentials not configured'));
    const response = await POST(request());

    expect(response.status).toBe(502);
    expect(JSON.stringify(await response.json())).not.toContain('credentials');
  });
});
