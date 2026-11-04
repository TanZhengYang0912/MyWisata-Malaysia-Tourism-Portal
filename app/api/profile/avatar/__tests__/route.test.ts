import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(), authRpc: vi.fn(), from: vi.fn(), rpc: vi.fn(), upload: vi.fn(), download: vi.fn(), getPublicUrl: vi.fn(),
}));
vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => ({ auth: { getUser: mocks.getUser }, rpc: mocks.authRpc })) }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: vi.fn(() => ({ from: mocks.from, rpc: mocks.rpc, storage: { from: () => ({ upload: mocks.upload, download: mocks.download, getPublicUrl: mocks.getPublicUrl }) } })) }));

import { POST } from '../route';

const ownerId = '11111111-1111-4111-8111-111111111111';
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1]);

function uploadRequest(bytes = pngBytes) {
  const form = new FormData();
  form.set('file', new File([bytes], 'avatar.png', { type: 'image/png' }));
  return new Request('http://localhost/api/profile/avatar', { method: 'POST', body: form });
}

describe('POST /api/profile/avatar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://project.supabase.co');
    mocks.getUser.mockResolvedValue({ data: { user: { id: ownerId, is_anonymous: false } }, error: null });
    mocks.authRpc.mockResolvedValue({ data: null, error: null });
    mocks.upload.mockResolvedValue({ data: { path: 'uploaded' }, error: null });
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValueOnce({ data: { status: 'active', avatar_url: 'https://cdn.test/old.png', tier: 'profile_complete' }, error: null })
      .mockResolvedValueOnce({ data: { tier: 'profile_complete' }, error: null });
    mocks.from.mockReturnValue(query);
    mocks.getPublicUrl.mockImplementation((path: string) => ({ data: { publicUrl: `https://cdn.test/${path}` } }));
  });

  it('reuses a same-account digest and avoids a new Storage write', async () => {
    const publicUrl = 'https://cdn.test/user/avatar.png';
    mocks.rpc.mockImplementation(async (name: string) => name === 'find_profile_avatar_asset'
      ? { data: [{ storage_path: 'user/avatar.png', state: 'active' }], error: null }
      : name === 'reserve_profile_avatar_asset'
        ? { data: [{ storage_path: 'user/avatar.png', state: 'active' }], error: null }
        : { data: [{ changed: true, avatar_url: publicUrl }], error: null });
    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_profile_avatar_asset', expect.objectContaining({ p_owner_user_id: ownerId, p_digest: expect.stringMatching(/^[0-9a-f]{64}$/) }));
  });

  it('registers and reuses a matching legacy avatar owned by this account', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValueOnce({ data: { status: 'active', avatar_url: `https://project.supabase.co/storage/v1/object/public/avatars/${ownerId}/legacy.png`, tier: 'profile_complete' } });
    query.maybeSingle.mockResolvedValueOnce({ data: { tier: 'profile_complete' } });
    mocks.from.mockReturnValue(query);
    mocks.download.mockResolvedValue({ data: new Blob([pngBytes]), error: null });
    mocks.rpc.mockImplementation(async (name: string, args?: { p_storage_path?: string }) => {
      if (name === 'find_profile_avatar_asset') return { data: [], error: null };
      if (name === 'reserve_profile_avatar_asset') return { data: [{ storage_path: args?.p_storage_path, state: 'pending' }], error: null };
      if (name === 'activate_profile_avatar_asset') return { data: true, error: null };
      return { data: [{ changed: true, avatar_url: 'https://cdn.test/avatar.png' }], error: null };
    });

    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    expect(mocks.download).toHaveBeenCalledWith(`${ownerId}/legacy.png`);
    expect(mocks.upload).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith('reserve_profile_avatar_asset', expect.objectContaining({ p_storage_path: `${ownerId}/legacy.png` }));
  });

  it('does not fetch an external avatar URL while checking for a legacy duplicate', async () => {
    const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: vi.fn() };
    query.select.mockReturnValue(query); query.eq.mockReturnValue(query);
    query.maybeSingle.mockResolvedValueOnce({ data: { status: 'active', avatar_url: `https://attacker.test/${ownerId}/avatar.png`, tier: 'profile_complete' } });
    query.maybeSingle.mockResolvedValueOnce({ data: { tier: 'profile_complete' } });
    mocks.from.mockReturnValue(query);
    mocks.rpc.mockImplementation(async (name: string) => name === 'find_profile_avatar_asset'
      ? { data: [], error: null }
      : name === 'reserve_profile_avatar_asset'
        ? { data: [{ storage_path: `${ownerId}/new.png`, state: 'pending' }], error: null }
        : name === 'activate_profile_avatar_asset'
          ? { data: true, error: null }
          : { data: [{ changed: true, avatar_url: 'https://cdn.test/new.png' }], error: null });

    const response = await POST(uploadRequest());
    expect(response.status).toBe(200);
    expect(mocks.download).not.toHaveBeenCalled();
    expect(mocks.upload).toHaveBeenCalledOnce();
  });

  it('rejects bytes that do not match the claimed image type before reserving storage', async () => {
    const response = await POST(uploadRequest(new Uint8Array([1, 2, 3])));
    expect(response.status).toBe(422);
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(mocks.upload).not.toHaveBeenCalled();
  });
});
