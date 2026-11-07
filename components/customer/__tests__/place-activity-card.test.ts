import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/place-activity-card.tsx"), "utf8");
const placeActivitySource = readFileSync(resolve(process.cwd(), "components/customer/place-activity-section.tsx"), "utf8");
const placeAccessSource = readFileSync(resolve(process.cwd(), "components/customer/place-access-section.tsx"), "utf8");
const placeInformationSource = readFileSync(resolve(process.cwd(), "components/customer/place-informational-activity-section.tsx"), "utf8");

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

  it("keeps item descriptions out of all shared place activity cards", () => {
    expect(source).not.toContain("description");
    expect(placeActivitySource).not.toContain("description={");
    expect(placeAccessSource).not.toContain("description={");
    expect(placeInformationSource).not.toContain("description={");
    expect(source).toContain("text-lg font-bold leading-tight text-foreground");
    expect(source).toContain("price: ReactNode");
    expect(source).toContain("footer: ReactNode");
  });

  it("uses serializable localized heading props for translated activity titles", () => {
    expect(source).toContain("<LocalizedContentHeading");
    expect(source).not.toContain("{({ text, control }) =>");
  });
});
