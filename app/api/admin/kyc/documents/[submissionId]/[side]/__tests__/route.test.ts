import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const getClaims = vi.fn(async () => ({ data: { claims: { sub: '33333333-3333-4333-8333-333333333333', aal: 'aal2' } }, error: null }));
const getUser = vi.fn();
const rpc = vi.fn();
const createServiceClient = vi.fn();

vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => ({ auth: { getUser, getClaims }, rpc }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient,
}));

const { GET } = await import('../route');

describe('GET /api/admin/kyc/documents/[submissionId]/[side]', () => {
  // Exercise the existing KYC boundary against the explicit pre-rollout local mode.
  beforeEach(() => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MYWISATA_DEMO_TOOLS', 'true');
    vi.stubEnv('MYWISATA_LOCAL_LEGACY_STAFF_AUTH', 'true');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  });
  afterEach(() => vi.unstubAllEnvs());
  beforeEach(() => vi.clearAllMocks());
  it.each(['image/jpeg', 'application/pdf'])('returns private %s bytes without signed URLs or internal paths and disables caching', async (contentType) => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    rpc.mockResolvedValue({ data: true, error: null });
    const download = vi.fn().mockResolvedValue({ data: new Blob(['image-bytes'], { type: contentType }), error: null });
    const serviceRpc = vi.fn().mockResolvedValue({ data: { storage_path: 'private/user/front.jpg', access_id: '66666666-6666-4666-8666-666666666666' }, error: null });
    createServiceClient.mockReturnValue({ rpc: serviceRpc, storage: { from: () => ({ download }) } });
    const response = await GET(new Request('http://localhost'), { params: Promise.resolve({ submissionId: '22222222-2222-4222-8222-222222222222', side: 'front' }) });
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('no-store');
    expect(response.headers.get('content-type')).toBe(contentType);
    expect(response.headers.get('x-kyc-document-access-id')).toBe('66666666-6666-4666-8666-666666666666');
    expect(serviceRpc).toHaveBeenCalledWith('get_kyc_document_view_v2', expect.objectContaining({ p_side: 'front' }));
    expect(await response.text()).toBe('image-bytes');
  });
  it('returns 401 before validating malformed route parameters', async () => {
    getUser.mockResolvedValue({ data: { user: null } });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({ submissionId: 'not-a-uuid', side: 'unexpected' }),
    });

    expect(response.status).toBe(401);
  });

  it('rejects callers without the KYC review capability before resolving a private path', async () => {
    getUser.mockResolvedValue({ data: { user: { id: '33333333-3333-4333-8333-333333333333' } } });
    rpc.mockResolvedValue({ data: false, error: null });

    const response = await GET(new Request('http://localhost'), {
      params: Promise.resolve({
        submissionId: '22222222-2222-4222-8222-222222222222',
        side: 'front',
      }),
    });

    expect(response.status).toBe(403);
    expect(rpc).toHaveBeenCalledWith('has_staff_permission', {
      p_user_id: '33333333-3333-4333-8333-333333333333',
      p_permission_key: 'admin.kyc.review',
    });
    expect(createServiceClient).not.toHaveBeenCalled();
  });
});
