import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/shared/appearance-control.tsx"), "utf8");

describe("AppearanceControl popover placement", () => {
  it("renders the light-variant popover at <body>, outside any blurred header", () => {
    // A header with backdrop-blur is the containing block for position:fixed
    // children, which shifted the popover by the header's own offset (240px
    // behind the vendor sidebar) and pushed it off the right edge.
    expect(source).toContain('import { createPortal } from "react-dom";');
    expect(source).toMatch(/variant === "light" && mounted \? createPortal\(panel, document\.body\) : panel/);
  });

  it("still closes on an outside click without treating the portalled panel as outside", () => {
    expect(source).toContain("!ref.current.contains(target) && !panelRef.current?.contains(target)");
  });
});
