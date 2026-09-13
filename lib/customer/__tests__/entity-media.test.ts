import { describe, expect, it } from "vitest";
import {
  hasUniqueGalleryContent,
  selectEntityGallery,
  type EntityMediaRow,
} from "@/lib/customer/entity-media";

const rows: EntityMediaRow[] = [
  { url: "https://cdn.example/vendor-1.svg", altText: "Front", mediaType: "gallery", sortOrder: 2, contentHash: "hash-2" },
  { url: "https://cdn.example/vendor-0.svg", altText: "Exterior", mediaType: "gallery", sortOrder: 1, contentHash: "hash-1" },
  { url: "https://cdn.example/logo.svg", altText: "Logo", mediaType: "logo", sortOrder: 0, contentHash: "logo-hash" },
  { url: "https://cdn.example/vendor-0.svg", altText: "Duplicate URL", mediaType: "gallery", sortOrder: 3, contentHash: "hash-1" },
];

describe("entity media", () => {
  it("selects ordered, unique gallery items without treating logos as slides", () => {
    expect(selectEntityGallery(rows)).toEqual([
      { url: "https://cdn.example/vendor-0.svg", alt: "Exterior" },
      { url: "https://cdn.example/vendor-1.svg", alt: "Front" },
    ]);
  });

  it("rejects duplicate content hashes across gallery assets", () => {
    expect(hasUniqueGalleryContent(rows)).toBe(false);
    expect(hasUniqueGalleryContent(rows.slice(0, 3))).toBe(true);
  });

  it("requires the requested minimum gallery size", () => {
    expect(selectEntityGallery(rows, 3)).toHaveLength(0);
    expect(selectEntityGallery([
      ...rows,
      { url: "https://cdn.example/vendor-2.svg", altText: "Detail", mediaType: "gallery", sortOrder: 4, contentHash: "hash-3" },
    ], 3)).toHaveLength(3);
  });
});
