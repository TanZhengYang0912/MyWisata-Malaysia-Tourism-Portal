import { describe, expect, it } from "vitest";
import { placeImageUrl } from "@/lib/storage/place-image";

describe("placeImageUrl", () => {
  it("returns null for empty input", () => {
    expect(placeImageUrl(null)).toBeNull();
    expect(placeImageUrl(undefined)).toBeNull();
    expect(placeImageUrl("")).toBeNull();
  });

  it("builds a public storage URL from a bucket-relative path", () => {
    expect(placeImageUrl("penang/chew-jetty.webp")).toBe(
      "/storage/v1/object/public/place-images/penang/chew-jetty.webp",
    );
  });

  it("is idempotent for already-absolute URLs", () => {
    const absolute = "https://example.supabase.co/storage/v1/object/public/place-images/penang/chew-jetty.webp";
    expect(placeImageUrl(absolute)).toBe(absolute);
  });

  it("tolerates a leading slash", () => {
    expect(placeImageUrl("/penang/chew-jetty.webp")).toBe(
      "/storage/v1/object/public/place-images/penang/chew-jetty.webp",
    );
  });

  it("tolerates legacy /assets/customer/ paths so migration order does not matter", () => {
    expect(placeImageUrl("/assets/customer/penang/chew-jetty.webp")).toBe(
      "/storage/v1/object/public/place-images/penang/chew-jetty.webp",
    );
  });
});
