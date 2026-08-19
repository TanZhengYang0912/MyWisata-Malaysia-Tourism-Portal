import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(new URL("../resilient-image.tsx", import.meta.url), "utf8");

describe("resilient image", () => {
  it("resets failures for a changed source and renders an accessible fallback", () => {
    expect(source).toContain("setFailed(false)");
    expect(source).toContain("onError={() => setFailed(true)}");
    expect(source).toContain('role="img"');
    expect(source).toContain("image unavailable");
  });
});
