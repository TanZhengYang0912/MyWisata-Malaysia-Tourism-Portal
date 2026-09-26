import { expect, test } from "@playwright/test";
import type { PromotionCampaignPublic } from "@/lib/promotion-campaigns/types";

const heritageCampaignSlug = "heritage-walk-kl-current-offers";

async function readHeritageCampaign(page: import("@playwright/test").Page): Promise<PromotionCampaignPublic> {
  const response = await page.request.get("/api/customer/promotion-campaigns");
  expect(response.ok(), "the public campaign projection should be available").toBeTruthy();
  const payload = await response.json() as { data?: { campaigns?: PromotionCampaignPublic[] } };
  const campaign = payload.data?.campaigns?.find((item) => item.slug === heritageCampaignSlug);
  expect(campaign, "the live Heritage Walk KL campaign should exist in Supabase").toBeDefined();
  expect(campaign?.offers.length, "the live campaign should have linked live offers").toBeGreaterThan(0);
  const chickenRiceOffer = campaign?.offers.find((offer) => offer.kind === "product" && offer.product.name === "Chicken Rice Set");
  expect(chickenRiceOffer?.kind).toBe("product");
  if (!chickenRiceOffer || chickenRiceOffer.kind !== "product") throw new Error("The Heritage Walk KL Chicken Rice Set offer is missing");
  expect(chickenRiceOffer.product.imageUrl).toContain("heritage-walk-kl-chicken-rice-set-semantic.jpg");
  return campaign!;
}

test.describe("Customer pop-up campaign journeys", () => {
  test("home, Browse all, and campaign detail show live offers from the exact Heritage Walk KL outlet", async ({ page }) => {
    test.setTimeout(150_000);
    const campaign = await readHeritageCampaign(page);
    const productOffer = campaign.offers.find((offer) => offer.kind === "product" && offer.product.name === "Jalan Alor Heritage & Food Walk");
    expect(productOffer?.kind).toBe("product");
    if (!productOffer || productOffer.kind !== "product") throw new Error("The exact Heritage Walk KL product offer is missing");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/customer");
    await expect(page.getByRole("heading", { name: campaign.title })).toBeVisible({ timeout: 45_000 });
    const browseAllEventsLink = page.getByRole("link", { name: "Browse all events" });
    await expect(browseAllEventsLink).toHaveAttribute("href", "/customer/events");
    await Promise.all([
      page.waitForURL("**/customer/events", { timeout: 45_000 }),
      browseAllEventsLink.click(),
    ]);
    await expect(page.getByRole("heading", { name: campaign.title })).toBeVisible({ timeout: 45_000 });
    await expect(page.getByText("Jalan Alor Heritage & Food Walk", { exact: true })).toBeVisible();
    await Promise.all([
      page.waitForURL(new RegExp(`/customer/events/${heritageCampaignSlug}$`), { timeout: 45_000 }),
      page.getByRole("link", { name: "View details" }).click(),
    ]);

    await expect(page.getByRole("heading", { name: campaign.title })).toBeVisible();
    await expect(page.getByText("Heritage Walk KL · Kuala Lumpur, Kuala Lumpur", { exact: true })).toHaveCount(
      campaign.offers.filter((offer) => offer.kind === "product").length,
    );
    await expect(page.getByRole("article")).toHaveCount(campaign.offers.length);
    const chickenRiceImage = page.getByRole("img", { name: "Chicken Rice Set", exact: true });
    await expect(chickenRiceImage).toHaveAttribute("src", /heritage-walk-kl-chicken-rice-set-semantic\.jpg/);
    await expect.poll(() => chickenRiceImage.evaluate((image) => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(0);
    const expectedProductHrefs = campaign.offers
      .filter((offer) => offer.kind === "product")
      .map((offer) => `/customer/activity/${offer.product.id}?outletId=${offer.outlet.id}`)
      .sort();
    const displayedProductHrefs = await page.getByRole("link", { name: "See this outlet offer" })
      .evaluateAll((links) => links.map((link) => link.getAttribute("href") ?? "").sort());
    expect(displayedProductHrefs).toEqual(expectedProductHrefs);
    const campaignContent = await page.evaluate(() => {
      const main = document.querySelector("main");
      return {
        contentRight: main ? Math.round(main.getBoundingClientRect().right) : Number.POSITIVE_INFINITY,
        contentWidth: main?.scrollWidth ?? Number.POSITIVE_INFINITY,
        viewportWidth: window.innerWidth,
      };
    });
    expect(campaignContent.contentRight, JSON.stringify(campaignContent)).toBeLessThanOrEqual(campaignContent.viewportWidth);
    expect(campaignContent.contentWidth, JSON.stringify(campaignContent)).toBeLessThanOrEqual(campaignContent.viewportWidth);
  });

  test("an unpublished campaign slug returns a not-found page instead of an endless loading state", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/customer/events/no-such-campaign");
    await expect(page.getByRole("heading", { name: "This event is no longer available" })).toBeVisible();
    await expect(page.locator("main").getByRole("link", { name: "Back to events" }).last()).toHaveAttribute("href", "/customer/events");
    await expect(page.getByRole("status")).toHaveCount(0);
  });
});
