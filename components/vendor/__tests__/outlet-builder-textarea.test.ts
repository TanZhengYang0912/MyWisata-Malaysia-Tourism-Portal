import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const outletStudioTextareaSources = [
  "components/vendor/outlet-builder-inspector.tsx",
  "components/outlet/outlet-block-renderer.tsx",
  "components/vendor/outlet-page-builder.tsx",
].map((path) => readFileSync(path, "utf8"));

describe("Outlet Studio textarea sizing", () => {
  it("keeps every editor textarea inside its containing box", () => {
    const textareas = outletStudioTextareaSources.flatMap(
      (source) => source.match(/<textarea[\s\S]*?\/>/g) ?? [],
    );

    expect(textareas).toHaveLength(5);
    expect(textareas.every((textarea) => textarea.includes("resize-none"))).toBe(true);
  });
});
