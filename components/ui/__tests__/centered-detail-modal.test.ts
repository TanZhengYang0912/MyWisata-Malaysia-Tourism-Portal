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

  it("supports a fixed heading and content region for long forms", () => {
    expect(source).toContain("layout?: 'scroll' | 'fixed'");
    expect(source).toContain("layout === 'fixed'");
    expect(source).toContain("headerClassName");
    expect(source).toContain("overflow-hidden");
  });

  it("keeps fixed long-form dialogs readable in dark mode", () => {
    expect(source).toContain("bg-white dark:bg-card");
    expect(source).toContain("dark:text-foreground");
  });
});
