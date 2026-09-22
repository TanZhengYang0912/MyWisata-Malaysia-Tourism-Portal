import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: mocks.createClient }));
vi.mock('@/lib/supabase/service', () => ({ createServiceClient: mocks.createServiceClient }));

import { POST } from '../route';

const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);

function galleryForm(count: number) {
  const form = new FormData();
  form.set('name', 'Gallery Test Vendor');
  for (let index = 0; index < count; index += 1) {
    form.append('galleryFiles', new Blob([pngBytes], { type: 'image/png' }), `gallery-${index + 1}.png`);
  }
  return new Request('http://localhost/api/vendors', { method: 'POST', body: form });
}

describe('POST /api/vendors registration gallery', () => {
  let rpc: ReturnType<typeof vi.fn>;
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let rpcArgs: Record<string, unknown> | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    rpcArgs = undefined;
    rpc = vi.fn().mockImplementation((_name: string, args: Record<string, unknown>) => {
      rpcArgs = args;
      return Promise.resolve({ data: { vendor_id: 'vendor-1', slug: 'gallery-test-vendor' }, error: null });
    });
    upload = vi.fn().mockResolvedValue({ error: null });
    remove = vi.fn().mockResolvedValue({ error: null });
    const bucket = {
      upload,
      remove,
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/vendor-products/${path}` } })),
    };
    mocks.createClient.mockResolvedValue({
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1', email: 'owner@example.com' } } }) },
      rpc,
      from: vi.fn(() => ({
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: { id: 'vendor-1', name: 'Gallery Test Vendor' }, error: null }),
      })),
    });
    mocks.createServiceClient.mockReturnValue({ storage: { from: vi.fn(() => bucket) } });
  });

  it('uploads exactly three photos and passes their URLs into the atomic registration RPC', async () => {
    const response = await POST(galleryForm(3));
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith('register_vendor_with_outlet', expect.any(Object));
    expect(rpcArgs?.p_gallery).toHaveLength(3);
    expect(rpcArgs?.p_gallery).toEqual(expect.arrayContaining([
      expect.stringMatching(/^https:\/\/storage\.example\/vendor-products\/user-1\/registrations\//),
    ]));
    expect(payload.data.id).toBe('vendor-1');
  });

  it('rejects a partial gallery before uploading any files', async () => {
    const response = await POST(galleryForm(2));
    const payload = await response.json();

    expect(response.status).toBe(422);
    expect(payload.error.code).toBe('INVALID_GALLERY_COUNT');
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cleans the uploaded gallery objects when atomic registration fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', status: 409, message: 'vendor_exists' } });

    const response = await POST(galleryForm(3));
    expect(response.status).toBe(409);
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([
      expect.stringMatching(/^user-1\/registrations\//),
    ]));
  });

  it('preserves uploaded files when the registration RPC response is lost', async () => {
    rpc.mockRejectedValueOnce(new Error('connection lost after commit'));

    const response = await POST(galleryForm(3));
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('REGISTRATION_STATUS_UNCONFIRMED');
    expect(remove).not.toHaveBeenCalled();
  });
});
