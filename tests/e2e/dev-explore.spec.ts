import { expect, test } from "@playwright/test";

// /dev/explore is a read-only prototype (docs/plans/2026-08-03-0237-dev-explore-discovery-map.md),
// not linked from anywhere in the product and requiring no login — same convention as the
// other /dev/* pages.

test("loads, and the old /demo/explore prototype no longer hosts it", async ({ page }) => {
  await page.goto("/dev/explore");
  await expect(page.getByRole("heading", { name: "District & discovery map" })).toBeVisible();

  const response = await page.goto("/demo/explore");
  expect(response?.status()).toBe(404);
});

test("plots all 116 district dots nationally, unlabelled until hover/focus (spec Δ1)", async ({ page }) => {
  await page.goto("/dev/explore");

  // District dots carry "<name>, <state>"; state pin-cards carry "Open <state>, N listings" —
  // excluding the "Open " prefix isolates the district layer. 116, not the
  // original 115: Kinabatangan was added to Sabah for Δ2 (River & Rainforest
  // Discovery's place coordinate).
  const districtDots = page.locator('svg g[role="button"][aria-label]:not([aria-label^="Open "])');
  await expect(districtDots).toHaveCount(116);

  const kinta = page.locator('svg g[aria-label="Kinta, Perak"]');
  await expect(kinta.locator("text")).toHaveCount(0);
  await kinta.focus();
  await expect(kinta.locator("text")).toHaveCount(1);
  await expect(kinta.locator("text")).toHaveText("Kinta");
});

test("selecting a state shows every district name permanently and reveals its pins", async ({ page }) => {
  await page.goto("/dev/explore");
  await page.locator('g[aria-label^="Open Penang,"] path').first().click();

  await expect(page.getByText(/\d+ daerah · \d+ with listings/)).toBeVisible();
  // Once a state is open, district labels no longer need hover — five of Penang's are always on screen.
  for (const name of ["Timur Laut", "Barat Daya", "Seberang Perai Utara", "Seberang Perai Tengah", "Seberang Perai Selatan"]) {
    await expect(page.locator("svg text", { hasText: name }).first()).toBeVisible();
  }

  const markers = page.locator('svg g[aria-label*="Outlet"], svg g[aria-label*="Activity place"], svg g[aria-label*="places here"]');
  await expect(markers.first()).toBeVisible();
});

test("a place-bound activity plots at its own district, not the provider outlet's (the Δ this route exists to prove)", async ({ page }) => {
  await page.goto("/dev/explore");
  await page.locator('g[aria-label^="Open Penang,"] path').first().click();

  await page.locator('svg g[aria-label*="Monkey Beach"]').first().click({ force: true });
  await expect(page.getByRole("heading", { name: "Activity place", level: 3 })).toBeVisible();
  await expect(page.getByText("Barat Daya, Penang")).toBeVisible();
});

test("clicking a district dot from the national view jumps into that state and district together", async ({ page }) => {
  await page.goto("/dev/explore");
  const kinta = page.locator('svg g[aria-label="Kinta, Perak"]');
  await kinta.locator("circle").last().click({ force: true });

  await expect(page.getByRole("heading", { name: "Perak" })).toBeVisible();
});

test("an outlet pin opens a preview linking to the outlet and each of its products", async ({ page }) => {
  await page.goto("/dev/explore");
  await page.locator('g[aria-label^="Open Sabah,"] path').first().click();
  await page.locator('svg g[aria-label*="Outlet"]').first().click({ force: true });

  const outletLink = page.locator("aside a").first();
  await expect(outletLink).toHaveAttribute("href", /^\/customer\/outlet\//);
  const productLink = page.locator('aside a[href^="/customer/activity/"]').first();
  await expect(productLink).toBeVisible();
});

test("a state with no listings still opens and says so explicitly", async ({ page }) => {
  await page.goto("/dev/explore");
  await page.locator('g[aria-label^="Open Perlis,"] path').first().click();

  await expect(page.getByText("No available outlets or activities")).toBeVisible();
});

test("the missing-place-coordinate warning names the omitted product (Batik Story Workshop, Δ3)", async ({ page }) => {
  await page.goto("/dev/explore");
  await expect(page.getByText("Batik Story Workshop")).toBeVisible();
});

test("keyboard: Tab reaches a district dot and Enter opens it", async ({ page }) => {
  await page.goto("/dev/explore");
  const kinta = page.locator('svg g[aria-label="Kinta, Perak"]');
  await kinta.focus();
  await page.keyboard.press("Enter");

  await expect(page.getByRole("heading", { name: "Perak" })).toBeVisible();
});

test("mobile viewport keeps text readable via horizontal scroll rather than shrinking", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/dev/explore");
  await expect(page.getByRole("heading", { name: "District & discovery map" })).toBeVisible();
  const svg = page.locator('svg[role="img"]').first();
  await expect(svg).toBeVisible();
});
