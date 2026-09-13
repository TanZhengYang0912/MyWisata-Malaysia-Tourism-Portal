import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("unified checkbox UI contract", () => {
  it("styles native checkboxes across the application states", () => {
    const css = read("app/globals.css");
    expect(css).toContain('input[type="checkbox"]');
    expect(css).toContain("appearance: none");
    expect(css).toContain(":checked");
    expect(css).toContain(":indeterminate");
    expect(css).toContain(":focus-visible");
    expect(css).toContain(":disabled");
    expect(css).toContain(".dark input[type=\"checkbox\"]");
  });

  it("keeps the shared Radix checkbox aligned with the global treatment", () => {
    const source = read("components/ui/checkbox.tsx");
    expect(source).toContain("rounded-lg");
    expect(source).toContain("data-[state=checked]:bg-primary");
    expect(source).toContain("focus-visible:ring");
    expect(source).toContain("disabled:opacity-50");
  });
});
