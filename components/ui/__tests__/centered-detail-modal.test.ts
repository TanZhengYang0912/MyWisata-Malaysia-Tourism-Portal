import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "components/ui/centered-detail-modal.tsx"),
  "utf8",
);

describe("CenteredDetailModal", () => {
  it("provides one reusable accessible centered overlay contract", () => {
    expect(source).toContain("role=\"dialog\"");
    expect(source).toContain("aria-modal=\"true\"");
    expect(source).toContain("items-center justify-center");
    expect(source).toContain("event.key === \"Escape\"");
    expect(source).toContain("previousActiveElement?.focus()");
    expect(source).not.toContain("absolute right-0 top-0");
  });
});
