import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));
const mediaMocks = vi.hoisted(() => ({ reserve: vi.fn(), markStored: vi.fn() }));
vi.mock('@/lib/vendor/media-objects', () => ({
  reserveVendorMediaObject: mediaMocks.reserve,
  markVendorMediaObjectStored: mediaMocks.markStored,
  MEDIA_RESERVE_FAILED: { code: 'UPLOAD_UNAVAILABLE', message: 'Uploads are temporarily unavailable. Please try again.', status: 503 },
}));


import { POST } from '../route';

const vendorId = 'vendor-1';
const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
function params() { return { params: Promise.resolve({ vendorId }) }; }

function requestWithFile(file: File | null) {
  const form = new FormData();
  if (file) form.append('file', file);
  return new Request('http://localhost/api/vendors/vendor-1/event-promotions/upload', { method: 'POST', body: form });
}

describe('/api/vendors/[vendorId]/event-promotions/upload', () => {
  let upload: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    upload = vi.fn().mockResolvedValue({ error: null });
    mediaMocks.reserve.mockResolvedValue({ ok: true, objectId: 'media-object-1' });
    mediaMocks.markStored.mockResolvedValue(undefined);
    const bucket = {
      upload,
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/event-posters/${path}` } })),
    };
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: { userId: 'user-1', vendorId, serviceDb: { storage: { from: vi.fn(() => bucket) } } },
    });
  });

  it('uploads a valid poster image to the event-posters bucket', async () => {
    const file = new File([pngBytes], 'poster.png', { type: 'image/png' });
    const response = await POST(requestWithFile(file), params());
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.data.url).toContain('event-posters');
    expect(upload).toHaveBeenCalledTimes(1);
    expect(upload.mock.calls[0][0]).toMatch(new RegExp(`^${vendorId}/`));
  });

  it('rejects a non-image file type', async () => {
    const file = new File([pngBytes], 'poster.pdf', { type: 'application/pdf' });
    const response = await POST(requestWithFile(file), params());
    expect(response.status).toBe(422);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects when no file is present', async () => {
    const response = await POST(requestWithFile(null), params());
    expect(response.status).toBe(422);
    expect(upload).not.toHaveBeenCalled();
  });

  it('rejects a file over the size limit', async () => {
    const bigBytes = new Uint8Array(10 * 1024 * 1024 + 1);
    const file = new File([bigBytes], 'poster.png', { type: 'image/png' });
    const response = await POST(requestWithFile(file), params());
    expect(response.status).toBe(422);
    expect(upload).not.toHaveBeenCalled();
  });

  it('propagates an authorization failure', async () => {
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) });
    const file = new File([pngBytes], 'poster.png', { type: 'image/png' });
    const response = await POST(requestWithFile(file), params());
    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });

  it('registers the poster before writing it and marks it stored after', async () => {
    const file = new File([pngBytes], 'poster.png', { type: 'image/png' });
    await POST(requestWithFile(file), params());
    const path = upload.mock.calls[0][0];
    expect(mediaMocks.reserve).toHaveBeenCalledWith(expect.anything(), { bucket: 'event-posters', path, vendorId, userId: 'user-1', purpose: 'event_poster' });
    expect(mediaMocks.reserve.mock.invocationCallOrder[0]).toBeLessThan(upload.mock.invocationCallOrder[0]);
    expect(mediaMocks.markStored).toHaveBeenCalledWith(expect.anything(), 'media-object-1');
  });

  it('uploads nothing when the poster cannot be registered', async () => {
    mediaMocks.reserve.mockResolvedValue({ ok: false });
    const file = new File([pngBytes], 'poster.png', { type: 'image/png' });
    const response = await POST(requestWithFile(file), params());
    expect(response.status).toBe(503);
    expect(upload).not.toHaveBeenCalled();
  });
});
