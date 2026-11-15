import { afterEach, describe, expect, it, vi } from "vitest";
import { isOptimizableImageUrl } from "@/lib/storage/optimizable-image";

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
