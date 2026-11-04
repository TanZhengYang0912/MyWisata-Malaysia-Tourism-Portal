import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const cardSource = readFileSync(resolve(workspace, "components/customer/activity-card.tsx"), "utf8");
const saveToggleSource = readFileSync(resolve(workspace, "components/customer/save-toggle-button.tsx"), "utf8");
const storyMapSource = readFileSync(resolve(workspace, "components/demo-map/story-map.tsx"), "utf8");
const customerHomeSource = readFileSync(resolve(workspace, "app/customer/customer-home-client.tsx"), "utf8");
const designDemoSource = readFileSync(resolve(workspace, "app/customer/design-demo/design-demo-client.tsx"), "utf8");
const destinationPreviewSource = readFileSync(resolve(workspace, "components/customer/destination-preview-modal.tsx"), "utf8");

describe("customer activity image handling", () => {
  it("shows a visible fallback when a cover is missing or fails to load", () => {
    expect(cardSource).toContain("const [imageFailed, setImageFailed] = useState(false)");
    expect(cardSource).toContain("onError={() => setImageFailed(true)}");
    expect(cardSource).toContain("!imageSrc || imageFailed");
    expect(cardSource).toContain('t("ui.labels.imageUnavailable")');
  });

  it("shows the canonical category on generic activity cards without implying outlet badges are product-wide", () => {
    expect(cardSource).toContain('import { CategoryIcon } from "@/components/customer/category-icon"');
    expect(cardSource).toContain("canonicalCategorySlug(activity.categorySlug)");
    expect(cardSource).toContain("getDiscoveryCategoryLabelKey(categorySlug)");
    expect(cardSource).toContain('<CategoryIcon category={categorySlug}');
    expect(cardSource).not.toContain("activity.isHiddenGem");
    expect(cardSource).not.toContain('t("categories.hiddenGem")');
  });

  it("can hide discovery taxonomy and promotional badges in dense listing views", () => {
    expect(cardSource).toContain("hideDiscoveryBadges = false");
    expect(cardSource).toContain("!hideDiscoveryBadges && activity.hot");
    expect(cardSource).toContain("activity.sponsorship && <span");
    expect(cardSource).toContain('t("ui.labels.verified")');
  });

  it("keeps only the Sponsored label on the photo; status badges live in the details drawer", () => {
    const discovery = cardSource.slice(cardSource.indexOf("function DiscoveryActivityCard"));
    const media = discovery.slice(discovery.indexOf("media={<>"), discovery.indexOf("<SaveToggleButton"));
    expect(media).toContain("<img");
    expect(media).toContain('t("ui.labels.sponsored")');
    expect(media).not.toContain('t("ui.labels.verified")');
    expect(media).not.toContain('t("ui.labels.closed")');
  });

  it("labels sponsored activities and shows the outlet's operating hours", () => {
    expect(cardSource).toContain('t("ui.labels.sponsored")');
    expect(cardSource).toContain("onSponsoredClick");
    expect(cardSource).toContain('t("ui.labels.operatingHours")');
    expect(cardSource).toContain("activity.outlet.hours");
    expect(cardSource).toContain("<OperatingHoursSummary");
  });

  it("has one detail style: the drawer under the price, with no caption, overlay or info toggle", () => {
    const shellSource = readFileSync(resolve(process.cwd(), "components/customer/expand-card.tsx"), "utf8");
    expect(cardSource).toContain('import { ExpandCard } from "@/components/customer/expand-card"');
    expect(cardSource).toContain("<ExpandCard");
    expect(cardSource).toContain("details={detailContent}");
    expect(shellSource).toContain('className="mw-card mw-card-expand-card group"');
    expect(shellSource).toContain('<div id={detailsId} data-card-details-inline="true" className="mw-card-details-expand">');
    expect(cardSource).toContain("activity.outlet.hours");
    expect(cardSource).not.toContain("detailsRevealStyle");
    expect(cardSource).not.toContain("CardMediaHoverCaption");
    expect(cardSource).not.toContain("setDetailsOpen");
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
