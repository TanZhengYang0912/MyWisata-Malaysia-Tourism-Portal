import { describe, expect, it } from "vitest";

import {
  isEligibleImageBucket,
  isImageObject,
  isSafeObjectPath,
  needsObjectRepair,
  validateSyncEndpoints,
} from "../lib/local-storage-image-sync.mjs";

describe("local Storage image sync guards", () => {
  it("accepts the matching hosted FYP source and loopback local target", () => {
    expect(validateSyncEndpoints(
      "https://ncdlaehknicabzjqskvk.supabase.co",
      "http://127.0.0.1:54321",
    )).toEqual({
      sourceOrigin: "https://ncdlaehknicabzjqskvk.supabase.co",
      targetOrigin: "http://127.0.0.1:54321",
    });
  });

  it("rejects any hosted or non-loopback target", () => {
    for (const targetUrl of [
      "https://ncdlaehknicabzjqskvk.supabase.co",
      "https://other-project.supabase.co",
      "http://127.0.0.1:54322",
      "http://127.0.0.1.attacker.test:54321",
    ]) {
      expect(() => validateSyncEndpoints(
        "https://ncdlaehknicabzjqskvk.supabase.co",
        targetUrl,
      )).toThrow();
    }
  });

  it("allows only approved public image buckets and image MIME objects", () => {
    for (const id of ["avatars", "event-posters", "place-images", "product-images", "vendor-images"]) {
      expect(isEligibleImageBucket({ id, public: true })).toBe(true);
    }
    expect(isEligibleImageBucket({ id: "vendor-products", public: true })).toBe(false);
    expect(isEligibleImageBucket({ id: "chat-attachments", public: false })).toBe(false);
    expect(isEligibleImageBucket({ id: "vendor-images", public: false })).toBe(false);

    expect(isImageObject({ id: "object-id", metadata: { mimetype: "image/jpeg" } })).toBe(true);
    expect(isImageObject({ id: "document-id", metadata: { mimetype: "application/pdf" } })).toBe(false);
    expect(isImageObject({ id: null, metadata: null })).toBe(false);
  });

  it("repairs missing local bodies but skips a matching local ETag", () => {
    expect(needsObjectRepair('"remote-etag"', { status: 500, etag: null })).toBe(true);
    expect(needsObjectRepair('"remote-etag"', { status: 206, etag: '"remote-etag"' })).toBe(false);
    expect(needsObjectRepair('"remote-etag"', { status: 206, etag: '"different-etag"' })).toBe(true);
  });

  it("does not treat authorization or throttling responses as missing image files", () => {
    expect(() => needsObjectRepair('"remote-etag"', { status: 401, etag: null })).toThrow();
    expect(() => needsObjectRepair('"remote-etag"', { status: 429, etag: null })).toThrow();
  });

  it("rejects unsafe object paths", () => {
    expect(isSafeObjectPath("products/hotel-room.jpg")).toBe(true);
    expect(isSafeObjectPath("/products/hotel-room.jpg")).toBe(false);
    expect(isSafeObjectPath("products/../secret.jpg")).toBe(false);
    expect(isSafeObjectPath("products\\hotel-room.jpg")).toBe(false);
    expect(isSafeObjectPath("products//hotel-room.jpg")).toBe(false);
  });
});
