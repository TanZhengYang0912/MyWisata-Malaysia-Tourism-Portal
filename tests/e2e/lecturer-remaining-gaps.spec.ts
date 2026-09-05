import { expect, test, type Page } from "@playwright/test";

async function activityHrefs(page: Page) {
  return page.locator('article a[href^="/customer/activity/"]').evaluateAll((links) => (
    [...new Set(links.map((link) => link.getAttribute("href")).filter(Boolean))]
  ));
}

async function openExperiences(page: Page) {
  await page.getByRole("button", { name: "Experiences", exact: true }).click();
  await expect(page.getByRole("region", { name: "Advanced filters" })).toBeVisible();
  await expect(page.getByText(/\d+ results/, { exact: true })).toBeVisible();
}

test("a copied Explore URL restores every lecturer filter and the same results", async ({ page }) => {
  const query = "state=Sabah&category=activity&priceMax=100&free=1&bookable=1&hiddenGem=1";
  await page.goto(`/customer/explore?${query}`);
  await openExperiences(page);

  await expect(page.getByLabel("State")).toHaveValue("Sabah");
  await expect(page.getByLabel("Maximum price")).toHaveValue("100");
  await expect(page.getByRole("button", { name: "Activity", exact: true }).first()).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Free entry", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Booking required", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Hidden Gem", exact: true }).last()).toHaveAttribute("aria-pressed", "true");

  const beforeReload = await activityHrefs(page);
  await page.reload();
  await openExperiences(page);

  await expect(page).toHaveURL(/state=Sabah/);
  await expect(page).toHaveURL(/category=activity/);
  await expect(page).toHaveURL(/priceMax=100/);
  await expect(page).toHaveURL(/free=1/);
  await expect(page).toHaveURL(/bookable=1/);
  await expect(page).toHaveURL(/hiddenGem=1/);
  await expect.poll(() => activityHrefs(page)).toEqual(beforeReload);
});

test("eligible sponsored results are labelled, capped at four, and precede organic results", async ({ page }) => {
  await page.goto("/customer/explore");
  await openExperiences(page);

  const cards = page.locator("article");
  const sponsored = cards.filter({ hasText: "Sponsored" });
  const sponsoredCount = await sponsored.count();
  test.skip(sponsoredCount === 0, "No active sponsored placement exists in the connected acceptance database.");

  expect(sponsoredCount).toBeLessThanOrEqual(4);
  const sponsorshipFlags = await cards.evaluateAll((items) => items.map((item) => item.textContent?.includes("Sponsored") ?? false));
  const firstOrganic = sponsorshipFlags.indexOf(false);
  expect(firstOrganic).toBeGreaterThanOrEqual(0);
  expect(sponsorshipFlags.slice(0, firstOrganic)).toEqual(Array(firstOrganic).fill(true));
  expect(sponsorshipFlags.slice(firstOrganic)).not.toContain(true);
});

test("a Vendor Reviewer can approve a vendor but remains forbidden from KYC and withdrawal approval", () => {
  test.skip(
    true,
    "Live Staff RBAC acceptance needs an isolated disposable database with a reversible vendor-conversion fixture; route/RPC integration coverage runs in Vitest.",
  );
});

test("a real ToyyibPay Sandbox return does not settle without verified provider evidence", () => {
  test.skip(
    true,
    "Live ToyyibPay acceptance is external/manual: it requires sandbox credentials, a public HTTPS callback, a disposable checkout, provider payment completion, and callback/reconciliation evidence.",
  );
});
