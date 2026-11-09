import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const cardSource = readFileSync(resolve(workspace, "components/customer/product-card.tsx"), "utf8");
const saveToggleSource = readFileSync(resolve(workspace, "components/customer/save-toggle-button.tsx"), "utf8");
const storyMapSource = readFileSync(resolve(workspace, "components/demo-map/story-map.tsx"), "utf8");
const customerHomeSource = readFileSync(resolve(workspace, "app/customer/customer-home-client.tsx"), "utf8");
const customerHomePageSource = readFileSync(resolve(workspace, "app/customer/page.tsx"), "utf8");
const designDemoSource = readFileSync(resolve(workspace, "app/customer/design-demo/design-demo-client.tsx"), "utf8");
const destinationPreviewSource = readFileSync(resolve(workspace, "components/customer/destination-preview-modal.tsx"), "utf8");

describe("customer activity image handling", () => {
  it("shows a visible fallback when a cover is missing or fails to load", () => {
    const frameSource = readFileSync(resolve(workspace, "components/customer/card-frame.tsx"), "utf8");
    expect(frameSource).toContain("const [imageFailed, setImageFailed] = useState(false)");
    expect(frameSource).toContain("onError={() => setImageFailed(true)}");
    expect(frameSource).toContain("src && !imageFailed");
    expect(cardSource).toContain('t("ui.activity.imageUnavailable", { name: cardName })');
  });

  it("shows the canonical category on generic activity cards without implying outlet badges are product-wide", () => {
    expect(cardSource).toContain("canonicalCategorySlug(activity.categorySlug)");
    expect(cardSource).toContain("getDiscoveryCategoryLabelKey(categorySlug)");
    expect(cardSource).not.toContain("activity.isHiddenGem");
    expect(cardSource).not.toContain('t("categories.hiddenGem")');
  });

  it("shows no Sponsored, Featured or status badges, and keeps the sponsored click tracking", () => {
    expect(cardSource).not.toContain("PhotoCardLabels");
    expect(cardSource).not.toContain('t("ui.labels.verified")');
    expect(cardSource).not.toContain('t("ui.labels.closed")');
    expect(cardSource).toContain("onSponsoredClick");
  });

  it("keeps recommendation ranking but removes AI reason copy from listing cards", () => {
    expect(cardSource).not.toContain("AiTag");
    expect(cardSource).not.toContain("recommendationReason");
    expect(customerHomeSource).not.toContain("recommendationReason=");
    expect(customerHomePageSource).toContain("getRecommendedFeed");
    expect(customerHomePageSource).not.toContain("reasonLabel");
  });

  it("uses the reusable save toggle instead of a card-local heart icon", () => {
    expect(cardSource).toContain('import { SaveToggleButton } from "@/components/customer/save-toggle-button"');
    expect(cardSource).toContain("<SaveToggleButton");
    expect(cardSource).not.toContain("Heart");
  });

  it("keeps the save icon and pressed-state contract in one reusable component", () => {
    expect(saveToggleSource).toContain('import { Bookmark } from "lucide-react"');
    expect(saveToggleSource).toContain("aria-pressed={saved}");
    expect(saveToggleSource).toContain('fill={saved ? "currentColor" : "none"}');
    expect(saveToggleSource).toContain("children");
    expect(storyMapSource).toContain('import { SaveToggleButton } from "@/components/customer/save-toggle-button"');
    expect(storyMapSource).toContain("<SaveToggleButton");
  });

  it("uses the saved-places navy bookmark style across customer save controls", () => {
    expect(saveToggleSource).toContain('appearance?: "icon" | "pill"');
    expect(saveToggleSource).toMatch(/bg-white(?: dark:bg-card)? text-primary/);
    expect(cardSource).toContain('appearance="icon"');
    expect(storyMapSource).toContain('appearance="icon"');
    expect(customerHomeSource).toContain('appearance="icon"');
    expect(designDemoSource).toContain('appearance="pill"');
    expect(destinationPreviewSource).toContain('appearance="pill"');
  });
});
