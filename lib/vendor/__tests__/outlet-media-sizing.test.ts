import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  BLOCK_DEFAULT_SIZE,
  BLOCK_MIN_SIZE,
  canResizeBlockTo,
  createOutletPageBlock,
} from "@/lib/vendor/outlet-page-schema";
import { GRID_SIZE_PRESETS } from "@/lib/vendor/outlet-grid";

const rendererSource = readFileSync(
  "components/outlet/outlet-block-renderer.tsx",
  "utf8",
);

describe("outlet media block sizing", () => {
  it("starts image-bearing blocks at a size that can show their media", () => {
    expect(BLOCK_DEFAULT_SIZE.image).toEqual([2, 3]);
    expect(BLOCK_DEFAULT_SIZE.image_text).toEqual([4, 3]);
    expect(BLOCK_DEFAULT_SIZE.gallery).toEqual([4, 3]);
    expect(BLOCK_DEFAULT_SIZE.product_grid).toEqual([4, 3]);

    expect(BLOCK_MIN_SIZE.image).toEqual([2, 3]);
    expect(BLOCK_MIN_SIZE.image_text).toEqual([4, 3]);
    expect(BLOCK_MIN_SIZE.gallery).toEqual([4, 3]);
    expect(BLOCK_MIN_SIZE.product_grid).toEqual([4, 3]);

    expect(GRID_SIZE_PRESETS).toContainEqual([2, 3]);
    expect(GRID_SIZE_PRESETS).toContainEqual([4, 3]);

    const legacyImageBlock = { ...createOutletPageBlock("image"), x: 0, y: 0, w: 3, h: 2 };
    expect(canResizeBlockTo([legacyImageBlock], legacyImageBlock, 3, 2)).toBe(false);
    expect(canResizeBlockTo([legacyImageBlock], legacyImageBlock, 3, 3)).toBe(true);
  });

  it("creates new image blocks with the media-safe dimensions", () => {
    expect(createOutletPageBlock("image")).toMatchObject({ w: 2, h: 3 });
    expect(createOutletPageBlock("image_text")).toMatchObject({ w: 4, h: 3 });
    expect(createOutletPageBlock("gallery")).toMatchObject({ w: 4, h: 3 });
    expect(createOutletPageBlock("product_grid")).toMatchObject({ w: 4, h: 3 });
  });

  it("uses compact editor previews so media content stays inside the block", () => {
    expect(rendererSource).toContain("mode === 'editor' ? 'h-28' : 'h-40'");
    expect(rendererSource).toContain("mode === 'editor' ? 'p-2' : 'p-4'");
  });
});
