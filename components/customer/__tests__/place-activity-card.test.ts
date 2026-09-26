import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/place-activity-card.tsx"), "utf8");

describe("place activity card", () => {
  it("provides the shared horizontal card frame for free and paid activities", () => {
    expect(source).toContain("sm:flex-row");
    expect(source).toContain("sm:w-[35%]");
    expect(source).toContain("border-t border-border pt-4");
    expect(source).toContain("action?: ReactNode");
  });

  it("supports a non-link public activity without an external destination", () => {
    expect(source).toContain("href?: string");
    expect(source).toContain("href ? (");
    expect(source).toContain("imageUrl ? (");
  });

  it("does not render a customer-facing third-party source link", () => {
    expect(source).not.toContain("sourceUrl");
    expect(source).not.toContain('target="_blank"');
  });

  it("shows full activity titles and descriptions on place detail cards", () => {
    expect(source).not.toContain("line-clamp-2");
    expect(source).toContain("text-lg font-bold leading-tight text-foreground");
    expect(source).toContain("mb-5 mt-3 break-words whitespace-normal text-xs leading-5 text-muted-foreground");
  });
});
