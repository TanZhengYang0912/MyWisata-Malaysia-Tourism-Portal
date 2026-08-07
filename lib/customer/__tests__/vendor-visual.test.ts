import { describe, expect, it } from "vitest";
import { getVendorVisual } from "../vendor-visual";

describe("getVendorVisual", () => {
  it("accepts vendor media uploaded to the vendor storage bucket", () => {
    expect(getVendorVisual({
      name: "Rasa Malaysia Kitchen",
      coverUrl: "https://demo.supabase.co/storage/v1/object/public/vendor-products/vendor-id/cover.jpg",
      logoUrl: "https://demo.supabase.co/storage/v1/object/public/vendor-products/vendor-id/logo.jpg",
    })).toEqual({
      coverUrl: "https://demo.supabase.co/storage/v1/object/public/vendor-products/vendor-id/cover.jpg",
      logoUrl: "https://demo.supabase.co/storage/v1/object/public/vendor-products/vendor-id/logo.jpg",
      initials: "RM",
    });
  });

  it("rejects stock/demo URLs and returns a branded identity visual", () => {
    expect(getVendorVisual({
      name: "Explore Outdoors Malaysia",
      coverUrl: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e",
      logoUrl: "https://images.unsplash.com/photo-1534422298391-e4f8c172dddb",
    })).toEqual({
      coverUrl: null,
      logoUrl: null,
      initials: "EO",
    });
  });
});
