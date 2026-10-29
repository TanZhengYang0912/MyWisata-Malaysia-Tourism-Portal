import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ db: { auth: { getUser: vi.fn(), getClaims: vi.fn() }, rpc: vi.fn() }, service: { rpc: vi.fn() } }));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => mocks.db }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: () => mocks.service }));
import { POST as challenge } from '@/app/api/auth/staff-passkey/challenge/route';
import { GET as credentials } from '@/app/api/auth/staff-passkey/credentials/route';
const user = '11111111-1111-4111-8111-111111111111';
const session = '22222222-2222-4222-8222-222222222222';
const request = (body: unknown, origin = 'https://mylawatan.my') => new Request('https://mylawatan.my/api/auth/staff-passkey/challenge', { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: JSON.stringify(body) });
beforeEach(() => {
  vi.resetAllMocks(); vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://mylawatan.my');
  mocks.db.auth.getUser.mockResolvedValue({ data: { user: { id: user } }, error: null });
  mocks.db.auth.getClaims.mockResolvedValue({ data: { claims: { sub: user, session_id: session, amr: [{ method: 'password', timestamp: 100 }] } }, error: null });
  mocks.db.rpc.mockResolvedValue({ data: { required: true, verified: false, passwordAuthenticated: true }, error: null });
  mocks.service.rpc.mockResolvedValue({ data: [], error: null });
});
describe('staff Passkey API', () => {
  it('uses MYLawatan in new credential prompts without changing the relying-party ID', async () => {
    mocks.service.rpc
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: { id: '33333333-3333-4333-8333-333333333333', userHandle: 'A'.repeat(43) }, error: null });
    const response = await challenge(request({ operation: 'register', grant: 'a'.repeat(43), label: 'Device' }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.options.rp).toEqual({ id: 'mylawatan.my', name: 'MYLawatan' });
    expect(body.data.options.user.name).toBe('MYLawatan staff');
  });
  it('denies cross-origin writes before accessing account or credential data', async () => {
    expect((await challenge(request({ operation: 'login' }, 'https://evil.example'))).status).toBe(403);
    expect(mocks.db.auth.getUser).not.toHaveBeenCalled(); expect(mocks.service.rpc).not.toHaveBeenCalled();
  });
  it('rejects attacker-selected user/session fields', async () => {
    expect((await challenge(request({ operation: 'login', userId: user, sessionId: session }))).status).toBe(422);
    expect(mocks.service.rpc).not.toHaveBeenCalled();
  });
  it('does not use OAuth or a customer session to enroll a privileged device', async () => {
    mocks.db.auth.getClaims.mockResolvedValueOnce({ data: { claims: { sub: user, session_id: session, amr: [{ method: 'oauth', timestamp: 100 }] } }, error: null });
    expect((await challenge(request({ operation: 'register', grant: 'a'.repeat(43), label: 'Device' }))).status).toBe(403);
    mocks.db.rpc.mockResolvedValueOnce({ data: { required: false, verified: false, passwordAuthenticated: false }, error: null });
    expect((await challenge(request({ operation: 'register', label: 'Device' }))).status).toBe(403);
    expect(mocks.service.rpc).not.toHaveBeenCalled();
  });
  it('never returns public keys, session IDs, counters or user handles in credential management', async () => {
    mocks.service.rpc.mockResolvedValueOnce({ data: [{ id: 'credential', label: 'Phone', publicKey: 'private-record', counter: 42, userHandle: 'internal-handle', transports: [] }], error: null });
    const response = await credentials(); const body = await response.json();
    expect(response.status).toBe(200); expect(body.data.credentials).toEqual([{ id: 'credential', label: 'Phone' }]);
    expect(JSON.stringify(body)).not.toMatch(/private-record|internal-handle|counter|sessionId/);
    expect(response.headers.get('cache-control')).toContain('no-store');
  });
  it('fails closed without leaking database/provider errors', async () => {
    mocks.service.rpc.mockResolvedValueOnce({ data: null, error: { message: 'secret storage /internal/keys' } });
    const response = await credentials(); expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('/internal/keys');
  });
});
