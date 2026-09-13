import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const workspace = process.cwd();
const cardSource = readFileSync(resolve(workspace, "components/customer/activity-card.tsx"), "utf8");
const saveToggleSource = readFileSync(resolve(workspace, "components/customer/save-toggle-button.tsx"), "utf8");
const storyMapSource = readFileSync(resolve(workspace, "components/demo-map/story-map.tsx"), "utf8");

describe("customer activity image handling", () => {
  it("shows a visible fallback when a cover is missing or fails to load", () => {
    expect(cardSource).toContain("const [imageFailed, setImageFailed] = useState(false)");
    expect(cardSource).toContain("onError={() => setImageFailed(true)}");
    expect(cardSource).toContain("!imageSrc || imageFailed");
    expect(cardSource).toContain('t("ui.labels.imageUnavailable")');
  });

  it("shows the canonical category and optional hidden-gem badge on every activity image", () => {
    expect(cardSource).toContain('import { CategoryIcon } from "@/components/customer/category-icon"');
    expect(cardSource).toContain("canonicalCategorySlug(activity.categorySlug)");
    expect(cardSource).toContain("getDiscoveryCategoryLabelKey(categorySlug)");
    expect(cardSource).toContain('<CategoryIcon category={categorySlug}');
    expect(cardSource).toContain('t("categories.hiddenGem")');
    expect(cardSource).toContain("activity.isHiddenGem");
  });

  it("keeps image badges in one overlay group so status labels cannot overlap", () => {
    expect(cardSource).toContain('className="absolute left-3 top-3 flex max-w-[calc(100%-5rem)] flex-wrap gap-1.5"');
    expect(cardSource).not.toContain('activity.sponsorship ? "top-10"');
  });

  it("labels sponsored activities and shows the outlet's operating hours", () => {
    expect(cardSource).toContain('t("ui.labels.sponsored")');
    expect(cardSource).toContain("onSponsoredClick");
    expect(cardSource).toContain('t("ui.labels.operatingHours")');
    expect(cardSource).toContain("activity.outlet.hours");
    expect(cardSource).toContain("<OperatingHoursSummary");
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
});
