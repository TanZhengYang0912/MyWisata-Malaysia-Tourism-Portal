import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "components/customer/place-activity-card.tsx"), "utf8");
const frameSource = readFileSync(resolve(process.cwd(), "components/customer/card-frame.tsx"), "utf8");
const placeActivitySource = readFileSync(resolve(process.cwd(), "components/customer/place-activity-section.tsx"), "utf8");
const placeAccessSource = readFileSync(resolve(process.cwd(), "components/customer/place-access-section.tsx"), "utf8");
const placeInformationSource = readFileSync(resolve(process.cwd(), "components/customer/place-informational-activity-section.tsx"), "utf8");

describe("place activity card", () => {
  it("uses the shared CardFrame place layout: photo 45% and 4:3 from md up, stacked on phones", () => {
    expect(source).toContain('layout="place"');
    expect(frameSource).toContain("md:grid md:grid-cols-[45%_minmax(0,1fr)]");
    expect(frameSource).toContain("aspect-[4/3]");
  });

  it("supports a non-link free or official item without an external destination", () => {
    expect(source).toContain("href?: string");
    expect(frameSource).toContain("{href ? (");
    expect(placeAccessSource).not.toContain("href=");
    expect(placeInformationSource).not.toContain("href=");
  });

  it("does not render a customer-facing third-party source link", () => {
    expect(source).not.toContain("sourceUrl");
    expect(source).not.toContain('target="_blank"');
  });

  it("shows each item's description on every place card", () => {
    expect(placeActivitySource).toContain("description={product.description}");
    expect(placeAccessSource).toContain("description={access.description}");
    expect(placeInformationSource).toContain("description={activity.description}");
  });

  it("drops the Venue Details entry, the relation row and the per-card action buttons", () => {
    expect(placeInformationSource).not.toContain("Dialog");
    expect(placeInformationSource).not.toContain("venueDetails");
    expect(placeActivitySource).not.toContain("ui.place.relations");
    expect(placeActivitySource).not.toContain("ui.actions.bookNow");
    expect(source).not.toContain("action?: ReactNode");
  });

  it("translates the description from the field the caller names, defaulting to description", () => {
    expect(source).toContain('descriptionField?: "description" | "tagline" | "intro"');
    expect(source).toContain('field={translation.descriptionField ?? "description"}');
    expect(source).toContain("description?: string");
  });

  it("keeps free and official items from looking purchasable", () => {
    expect(placeAccessSource).not.toContain("ReferencePrice");
    expect(placeInformationSource).not.toContain("ReferencePrice");
    expect(placeInformationSource).toContain("officialInformationLabel");
  });
});
