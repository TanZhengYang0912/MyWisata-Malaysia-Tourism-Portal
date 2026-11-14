import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn(), reserve: vi.fn(), markStored: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
vi.mock('@/lib/vendor/media-objects', () => ({
  reserveVendorMediaObject: mocks.reserve,
  markVendorMediaObjectStored: mocks.markStored,
  MEDIA_RESERVE_FAILED: { code: 'UPLOAD_UNAVAILABLE', message: 'Uploads are temporarily unavailable. Please try again.', status: 503 },
}));

import { POST } from '../route';

const vendorId = '11111111-1111-4111-8111-111111111111';
const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const pdfBytes = new TextEncoder().encode('%PDF-1.7\n%test');

function request(file: File, kind?: string) {
  const form = new FormData();
  form.append('file', file);
  if (kind) form.append('kind', kind);
  return new Request('http://localhost/api/vendors/v/media/upload', { method: 'POST', body: form });
}
const params = () => ({ params: Promise.resolve({ vendorId }) });

describe('POST /api/vendors/[vendorId]/media/upload', () => {
  let upload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    upload = vi.fn().mockResolvedValue({ error: null });
    mocks.reserve.mockResolvedValue({ ok: true, objectId: 'media-object-1' });
    mocks.markStored.mockResolvedValue(undefined);
    const bucket = { upload, getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/vendor-products/${path}` } })) };
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: 'user-1', vendorId, outletIds: [], serviceDb: { storage: { from: vi.fn(() => bucket) } } },
    });
  });

  it('registers a public image before writing it and marks it stored after', async () => {
    const response = await POST(request(new File([pngBytes], 'cover.png', { type: 'image/png' })), params());
    expect(response.status).toBe(200);
    const path = upload.mock.calls[0][0];
    expect(path).toMatch(new RegExp(`^${vendorId}/draft-user-1/`));
    expect(mocks.reserve).toHaveBeenCalledWith(expect.anything(), { bucket: 'vendor-products', path, vendorId, userId: 'user-1', purpose: 'product_media' });
    expect(mocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(mocks.markStored).toHaveBeenCalledWith(expect.anything(), 'media-object-1');
  });

  it('uploads nothing when the image cannot be registered', async () => {
    mocks.reserve.mockResolvedValue({ ok: false });
    const response = await POST(request(new File([pngBytes], 'cover.png', { type: 'image/png' })), params());
    expect(response.status).toBe(503);
    expect(upload).not.toHaveBeenCalled();
  });

  it('does not mark a failed upload as stored', async () => {
    upload.mockResolvedValue({ error: { message: 'storage unavailable' } });
    const response = await POST(request(new File([pngBytes], 'cover.png', { type: 'image/png' })), params());
    expect(response.status).toBe(500);
    expect(mocks.markStored).not.toHaveBeenCalled();
  });

  it('leaves private digital downloads out of the public media registry', async () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    await POST(request(new File([pdfBytes], 'guide.pdf', { type: 'application/pdf' }), 'digital'), params());
    expect(mocks.reserve).not.toHaveBeenCalled();
    expect(upload).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });
});
