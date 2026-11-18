import { afterEach, describe, expect, it, vi } from "vitest";
import { isOptimizableImageUrl, storageImageLoader, supabaseImageLoader } from "@/lib/storage/optimizable-image";

const PUBLIC_PATH = "/storage/v1/object/public/product-images/x.jpg";

describe("isOptimizableImageUrl", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("accepts public storage on the configured Supabase host", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.mylawatan.test");
    expect(isOptimizableImageUrl(`https://storage.mylawatan.test${PUBLIC_PATH}`)).toBe(true);
  });

  it("accepts public storage on any supabase.co project", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://storage.mylawatan.test");
    expect(isOptimizableImageUrl(`https://abcdefghijklmnop.supabase.co${PUBLIC_PATH}`)).toBe(true);
  });

  it("rejects non-public paths on the Supabase host", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcdefghijklmnop.supabase.co");
    expect(isOptimizableImageUrl("https://abcdefghijklmnop.supabase.co/storage/v1/object/sign/x.jpg")).toBe(false);
  });

  it("rejects third-party hosts", () => {
    expect(isOptimizableImageUrl("https://example.test/x.jpg")).toBe(false);
  });

  it("rejects a localhost Supabase URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://localhost:54321");
    expect(isOptimizableImageUrl(`https://localhost${PUBLIC_PATH}`)).toBe(false);
    expect(isOptimizableImageUrl(`http://localhost:54321${PUBLIC_PATH}`)).toBe(false);
  });

  it("accepts local Supabase storage only in development", () => {
    const local = `http://127.0.0.1:54321${PUBLIC_PATH}`;
    vi.stubEnv("NODE_ENV", "development");
    expect(isOptimizableImageUrl(local)).toBe(true);
    vi.stubEnv("NODE_ENV", "production");
    expect(isOptimizableImageUrl(local)).toBe(false);
  });

  it("accepts local paths without a query string", () => {
    expect(isOptimizableImageUrl("/customer/x.webp")).toBe(true);
    expect(isOptimizableImageUrl("/x.png?v=2")).toBe(false);
    expect(isOptimizableImageUrl("//example.test/x.png")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isOptimizableImageUrl(null)).toBe(false);
    expect(isOptimizableImageUrl(undefined)).toBe(false);
    expect(isOptimizableImageUrl("")).toBe(false);
  });
});

describe("storageImageLoader", () => {
  const project = "https://abcdefghijklmnop.supabase.co";
  afterEach(() => vi.unstubAllEnvs());

  it("routes this project's public Storage objects through Supabase's resizer", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", project);
    const src = `${project}${PUBLIC_PATH}`;
    const loader = storageImageLoader(src);
    expect(loader).toBe(supabaseImageLoader);
    expect(loader?.({ src, width: 640, quality: 90 })).toBe(
      `${project}/storage/v1/render/image/public/product-images/x.jpg?width=640&quality=90&resize=contain`,
    );
  });

  it("caps the width at Supabase's 2500 limit and defaults the quality to 75", () => {
    const src = `${project}${PUBLIC_PATH}`;
    expect(supabaseImageLoader({ src, width: 3840 })).toBe(
      `${project}/storage/v1/render/image/public/product-images/x.jpg?width=2500&quality=75&resize=contain`,
    );
  });

  it("keeps an encoded object path intact", () => {
    const src = `${project}/storage/v1/object/public/vendor-images/a%20b/caf%C3%A9.jpg`;
    expect(supabaseImageLoader({ src, width: 384 })).toContain("/storage/v1/render/image/public/vendor-images/a%20b/caf%C3%A9.jpg?");
  });

  it("leaves every other image on the default loader", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", project);
    expect(storageImageLoader(`https://otherprojectabcdef.supabase.co${PUBLIC_PATH}`)).toBeUndefined();
    expect(storageImageLoader(`${project}/storage/v1/object/sign/product-images/x.jpg?token=t`)).toBeUndefined();
    expect(storageImageLoader("https://example.test/x.jpg")).toBeUndefined();
    expect(storageImageLoader("/customer/x.webp")).toBeUndefined();
    expect(storageImageLoader(`http://abcdefghijklmnop.supabase.co${PUBLIC_PATH}`)).toBeUndefined();
    expect(storageImageLoader(null)).toBeUndefined();
    expect(storageImageLoader("")).toBeUndefined();
  });

  it("leaves local Supabase Storage on the default loader", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321");
    expect(storageImageLoader(`http://127.0.0.1:54321${PUBLIC_PATH}`)).toBeUndefined();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://localhost");
    expect(storageImageLoader(`https://localhost${PUBLIC_PATH}`)).toBeUndefined();
  });
});
