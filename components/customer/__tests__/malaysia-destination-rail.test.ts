import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const railSource = readFileSync(
  resolve(process.cwd(), "components/customer/malaysia-destination-rail.tsx"),
  "utf8",
);

describe("Malaysia destination rail", () => {
  it("derives the visible destination count from the shared source", () => {
    expect(railSource).toContain("{MALAYSIA_DESTINATIONS.length} destinations across Malaysia");
    expect(railSource).not.toContain("16 destinations across Malaysia");
  });

  it("applies the shared vivid treatment to spotlight and card imagery", () => {
    expect(railSource).toMatch(/active\.image[\s\S]*saturate-\[1\.35\]/);
    expect(railSource).toMatch(/destination\.image[\s\S]*saturate-\[1\.35\]/);
    expect(railSource).toContain("contrast-[1.08]");
    expect(railSource).toContain("brightness-[1.05]");
  });

  it("keeps the image-first palette with a restrained blue atmosphere", () => {
    expect(railSource).toContain("bg-[#101936]");
    expect(railSource).toContain("rgba(255,204,0,0.1)");
    expect(railSource).toContain("transparent_24%");
    expect(railSource).toContain("rgba(2,6,23,0.84)");
    expect(railSource).toContain("rgba(2,6,23,0.82)");
    expect(railSource).not.toContain("rgba(2,6,23,0.92)");
  });

  it("opens the shared destination preview from the spotlight action, not card selection", () => {
    expect(railSource).toContain("previewDestination");
    expect(railSource).toContain("<DestinationPreviewModal");
    expect(railSource).toContain("setPreviewDestination(active)");
    expect(railSource).not.toContain("setPreviewDestination(destination)");
    expect(railSource).toContain("View destination");
    expect(railSource).toContain("onExploreState");
    expect(railSource).toContain("getVisibleDestinationQueue(queue, activeId, 5)");
  });
});
