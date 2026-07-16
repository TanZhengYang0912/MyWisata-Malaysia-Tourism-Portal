import { expect, test } from "@playwright/test";

test("Guest Mode signs out and booking requires sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /guest mode/i }).click();
  await expect(page).toHaveURL(/\/guest\/explore$/);
  await expect(page.getByText("Guest Mode")).toBeVisible();

  const listing = page.getByRole("link", { name: /view listing/i }).first();
  await expect(listing).toBeVisible();
  await listing.click();
  await page.getByRole("link", { name: /sign in to (book|purchase)/i }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomer%2Factivity%2F/);
  await page.getByPlaceholder("Email address").fill("customer@demo.local");
  await page.getByPlaceholder("Password").fill("demo123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(/\/customer\/activity\//);
});

test("Guest Mode can open an approved vendor", async ({ page }) => {
  await page.goto("/guest/explore");
  const vendor = page.getByRole("link", { name: /view vendor/i }).first();
  await expect(vendor).toBeVisible();
  await vendor.click();
  await expect(page).toHaveURL(/\/guest\/vendor\//);
  await expect(page.getByRole("link", { name: /browse listings/i })).toBeVisible();
});
