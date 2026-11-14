import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ uploads: [] as Array<{ bucket: string; path: string }> }));

vi.mock("@/lib/vendor-authorization", () => ({
  authorizeOutlet: vi.fn(async () => ({
    ok: true,
    access: {
      userId: "u1", vendorId: "v1",
      serviceDb: {
        storage: {
          from: (bucket: string) => ({
            upload: async (path: string) => { state.uploads.push({ bucket, path }); return { error: null }; },
            getPublicUrl: (path: string) => ({ data: { publicUrl: `https://x.supabase.co/storage/v1/object/public/${bucket}/${path}` } }),
          }),
        },
      },
    },
  })),
}));
vi.mock("@/lib/customer/hotel-outlet", () => ({ isHotelOutlet: vi.fn(async () => true) }));
const media = vi.hoisted(() => ({ reserve: vi.fn(), markStored: vi.fn() }));
vi.mock("@/lib/vendor/media-objects", () => ({
  reserveVendorMediaObject: media.reserve,
  markVendorMediaObjectStored: media.markStored,
  MEDIA_RESERVE_FAILED: { code: "UPLOAD_UNAVAILABLE", message: "Uploads are temporarily unavailable. Please try again.", status: 503 },
}));

const route = await import("../route");
const params = { params: Promise.resolve({ vendorId: "v1", outletId: "o1" }) };
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function upload(file: File) {
  const form = new FormData();
  form.append("file", file);
  return route.POST(new Request("http://localhost/x", { method: "POST", body: form }), params);
}

describe("hotel profile photo upload", () => {
  beforeEach(() => {
    state.uploads = [];
    media.reserve.mockReset().mockResolvedValue({ ok: true, objectId: "media-object-1" });
    media.markStored.mockReset().mockResolvedValue(undefined);
  });

  it("registers the photo for cleanup before writing it, and marks it stored after", async () => {
    await upload(new File([PNG], "room.png", { type: "image/png" }));
    expect(media.reserve).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ bucket: "vendor-products", vendorId: "v1", userId: "u1", purpose: "hotel_photo", path: state.uploads[0].path }));
    expect(media.markStored).toHaveBeenCalledWith(expect.anything(), "media-object-1");
  });

  it("uploads nothing when the photo cannot be registered", async () => {
    media.reserve.mockResolvedValue({ ok: false });
    const response = await upload(new File([PNG], "room.png", { type: "image/png" }));
    expect(response.status).toBe(503);
    expect(state.uploads).toHaveLength(0);
  });

  it("stores a real image under the hotel's own folder and returns its URL", async () => {
    const response = await upload(new File([PNG], "room.png", { type: "image/png" }));
    expect(response.status).toBe(201);
    expect(state.uploads).toHaveLength(1);
    expect(state.uploads[0].bucket).toBe("vendor-products");
    expect(state.uploads[0].path).toMatch(/^v1\/hotel\/o1\/[0-9a-f-]+\.png$/);
    expect((await response.json()).data.url).toContain("/vendor-products/v1/hotel/o1/");
  });

  it("rejects files that are not images or whose bytes do not match", async () => {
    expect((await upload(new File(["hello"], "notes.txt", { type: "text/plain" }))).status).toBe(422);
    expect((await upload(new File(["not really a png"], "fake.png", { type: "image/png" }))).status).toBe(422);
    expect(state.uploads).toHaveLength(0);
  });
});
