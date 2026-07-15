import { describe, expect, it } from "vitest";
import { syncHeroBlockImage } from "@/lib/vendor/outlet-page-builder";

describe("outlet page builder contract", () => {
  it("keeps the public Hero block image aligned with the page Hero image", () => {
    expect(syncHeroBlockImage([
      { id: "hero", type: "hero", image: "https://old.example/hero.jpg" },
      { id: "intro", type: "intro", image: "https://intro.example/image.jpg" },
    ], "https://new.example/hero.jpg")).toEqual([
      { id: "hero", type: "hero", image: "https://new.example/hero.jpg" },
      { id: "intro", type: "intro", image: "https://intro.example/image.jpg" },
    ]);
  });

  it("removes a stale Hero block image when the page Hero image is cleared", () => {
    expect(syncHeroBlockImage([
      { id: "hero", type: "hero", image: "https://old.example/hero.jpg" },
    ], "")).toEqual([
      { id: "hero", type: "hero" },
    ]);
  });
});
