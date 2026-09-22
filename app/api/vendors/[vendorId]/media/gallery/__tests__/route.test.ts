import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ authorizeVendor: vi.fn() }));
vi.mock('@/lib/vendor-authorization', () => ({ authorizeVendor: mocks.authorizeVendor }));

import { DELETE, GET, PUT } from '../route';

const vendorId = 'vendor-1';
const pngBytes = Uint8Array.from([137, 80, 78, 71, 13, 10, 26, 10]);
const oldRows = [
  { id: 'media-1', url: 'https://storage.example/storage/v1/object/public/vendor-products/vendor-1/gallery/old-1.png', sort_order: 0 },
  { id: 'media-2', url: 'https://storage.example/storage/v1/object/public/vendor-products/vendor-1/gallery/old-2.png', sort_order: 1 },
  { id: 'media-3', url: 'https://storage.example/storage/v1/object/public/vendor-images/curated/vendor-3.png', sort_order: 2 },
];

function requestWithFiles(count = 3) {
  const form = new FormData();
  for (let index = 0; index < count; index += 1) {
    form.append('galleryFiles', new Blob([pngBytes], { type: 'image/png' }), `gallery-${index + 1}.png`);
  }
  return new Request('http://localhost/api/vendors/vendor-1/media/gallery', { method: 'PUT', body: form });
}

function params() { return { params: Promise.resolve({ vendorId }) }; }

describe('/api/vendors/[vendorId]/media/gallery', () => {
  let upload: ReturnType<typeof vi.fn>;
  let remove: ReturnType<typeof vi.fn>;
  let rpc: ReturnType<typeof vi.fn>;
  let from: ReturnType<typeof vi.fn>;
  let order: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    upload = vi.fn().mockResolvedValue({ error: null });
    remove = vi.fn().mockResolvedValue({ error: null });
    rpc = vi.fn().mockResolvedValue({ data: null, error: null });
    order = vi.fn().mockResolvedValue({ data: oldRows, error: null });
    const mediaQuery = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      is: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      order,
    };
    from = vi.fn(() => mediaQuery);
    const bucket = {
      upload,
      remove,
      getPublicUrl: vi.fn((path: string) => ({ data: { publicUrl: `https://storage.example/storage/v1/object/public/vendor-products/${path}` } })),
    };
    mocks.authorizeVendor.mockResolvedValue({
      ok: true,
      access: {
        userId: 'user-1',
        vendorId,
        isOwner: true,
        authDb: { rpc },
        serviceDb: { from, storage: { from: vi.fn(() => bucket) } },
      },
    });
  });

  it('only exposes gallery data after vendor-owner authorization', async () => {
    const response = await GET(new Request('http://localhost'), params());
    expect(response.status).toBe(200);
    expect(mocks.authorizeVendor).toHaveBeenCalledWith(vendorId, ['vendor_owner']);
    expect(from).toHaveBeenCalledWith('media_assets');
  });

  it('replaces the gallery transactionally and removes only managed old objects', async () => {
    const response = await PUT(requestWithFiles(), params());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(upload).toHaveBeenCalledTimes(3);
    expect(rpc).toHaveBeenCalledWith('set_vendor_gallery', expect.objectContaining({ p_vendor_id: vendorId, p_gallery: expect.any(Array) }));
    expect(remove).toHaveBeenCalledWith(['vendor-1/gallery/old-1.png', 'vendor-1/gallery/old-2.png']);
    expect(payload.data.items).toHaveLength(3);
  });

  it('rejects fewer than three replacement images without changing the gallery', async () => {
    const response = await PUT(requestWithFiles(1), params());
    expect(response.status).toBe(422);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cleans earlier uploads if a later image upload fails', async () => {
    upload.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: { message: 'storage unavailable' } });
    const response = await PUT(requestWithFiles(), params());
    expect(response.status).toBe(502);
    expect(remove).toHaveBeenCalledTimes(1);
    expect(remove.mock.calls[0][0]).toHaveLength(1);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('cleans all new objects and preserves the old row set if replacement fails', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '23505', status: 400, message: 'database rejected transaction' } });
    const response = await PUT(requestWithFiles(), params());
    expect(response.status).toBe(500);
    expect(remove).toHaveBeenCalledWith(expect.arrayContaining([
      expect.stringMatching(/^vendor-1\/gallery\//),
    ]));
    expect(remove.mock.calls[0][0]).toHaveLength(3);
  });

  it('keeps newly uploaded objects when the RPC outcome is ambiguous and readback cannot confirm the write', async () => {
    rpc.mockRejectedValueOnce(new Error('connection lost'));
    const response = await PUT(requestWithFiles(), params());
    const payload = await response.json();
    expect(response.status).toBe(503);
    expect(payload.error.code).toBe('GALLERY_STATUS_UNCONFIRMED');
    expect(remove).not.toHaveBeenCalled();
  });

  it('reconciles a committed gallery when the RPC response is lost', async () => {
    rpc.mockRejectedValueOnce(new Error('connection lost after commit'));
    order
      .mockResolvedValueOnce({ data: oldRows, error: null })
      .mockImplementationOnce(async () => ({
        data: (rpc.mock.calls[0][1].p_gallery as string[]).map((url, index) => ({
          id: `new-${index + 1}`,
          url,
          alt_text: `Business gallery image ${index + 1}`,
          sort_order: index,
        })),
        error: null,
      }));

    const response = await PUT(requestWithFiles(), params());
    const payload = await response.json();
    expect(response.status).toBe(200);
    expect(payload.data.items).toHaveLength(3);
    expect(remove).toHaveBeenCalledWith(['vendor-1/gallery/old-1.png', 'vendor-1/gallery/old-2.png']);
  });

  it('clears the rows but only deletes objects in this vendor gallery folder', async () => {
    const response = await DELETE(new Request('http://localhost', { method: 'DELETE' }), params());
    expect(response.status).toBe(200);
    expect(rpc).toHaveBeenCalledWith('set_vendor_gallery', { p_vendor_id: vendorId, p_gallery: [] });
    expect(remove).toHaveBeenCalledWith(['vendor-1/gallery/old-1.png', 'vendor-1/gallery/old-2.png']);
  });

  it('does not upload when owner authorization fails', async () => {
    mocks.authorizeVendor.mockResolvedValue({ ok: false, response: Response.json({ error: { code: 'FORBIDDEN' } }, { status: 403 }) });
    const response = await PUT(requestWithFiles(), params());
    expect(response.status).toBe(403);
    expect(upload).not.toHaveBeenCalled();
  });
});
