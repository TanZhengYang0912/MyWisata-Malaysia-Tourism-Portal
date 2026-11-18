import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MediaGallery } from "@/components/customer/media-gallery";

const PROJECT = "https://abcdefghijklmnop.supabase.co";

function render(urls: string[]) {
  return renderToStaticMarkup(
    <MediaGallery items={urls.map((url) => ({ url, alt: "" }))} label="Gallery" previousLabel="Previous" nextLabel="Next" slideLabel="Slide" roleDescription="carousel" />,
  ).match(/<img [^>]*>/g) ?? [];
}

describe("MediaGallery images", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("serves this project's Storage photos resized by Supabase instead of the original", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT);
    const [first, second] = render([
      `${PROJECT}/storage/v1/object/public/vendor-products/v1/gallery/a.jpg`,
      `${PROJECT}/storage/v1/object/public/vendor-products/v1/gallery/b.jpg`,
    ]);
    expect(first).toContain(`${PROJECT}/storage/v1/render/image/public/vendor-products/v1/gallery/a.jpg?width=`);
    expect(first).toContain("resize=contain");
    expect(first).toContain("srcSet=");
    expect(first).not.toContain(`src="${PROJECT}/storage/v1/object/public/`);
    expect(first).not.toContain('loading="lazy"');
    expect(second).toContain('loading="lazy"');
  });

  it("leaves photos from other hosts untouched", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", PROJECT);
    const [external] = render(["https://example.test/gallery.jpg"]);
    expect(external).toContain('src="https://example.test/gallery.jpg"');
    expect(external).not.toContain("/_next/image");
    expect(external).not.toContain("/render/image/");
  });
});
