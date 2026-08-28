import { expect, test } from "@playwright/test";

const CUSTOMER_EMAIL = "customer1@demo.local";

test("Guest Mode signs out and booking requires sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /guest mode/i }).click();
  await expect(page).toHaveURL(/\/customer\/explore$/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Explore", exact: true }).first()).toBeVisible();

  const listing = page.locator('a[href^="/customer/activity/"]').first();
  await expect(listing).toBeVisible();
  await listing.click();
  await page.getByRole("button", { name: /add (to cart|booking to cart)|book now|buy now/i }).last().click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomer%2Factivity%2F/);
  await page.getByPlaceholder("Email address").fill(CUSTOMER_EMAIL);
  await page.getByPlaceholder("Password").fill("demo123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(/\/customer\/activity\//, { timeout: 15_000 });
});

test("Guest Mode can open an approved vendor", async ({ page }) => {
  await page.goto("/guest/explore");
  await expect(page).toHaveURL(/\/customer\/explore$/, { timeout: 15_000 });
  const vendor = page.locator('a[href^="/customer/vendor/"]').first();
  await expect(vendor).toBeVisible();
  await vendor.click();
  await expect(page).toHaveURL(/\/customer\/vendor\//);
});
