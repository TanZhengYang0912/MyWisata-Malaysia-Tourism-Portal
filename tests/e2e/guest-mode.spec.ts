import { expect, test } from "@playwright/test";

const CUSTOMER_EMAIL = "customer1@demo.local";

test("Guest Mode enters Home and Trip navigation requires sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /guest mode/i }).click();
  await expect(page).toHaveURL(/\/customer$/, { timeout: 15_000 });
  await expect(page.getByRole("link", { name: "Home", exact: true }).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore", exact: true }).first()).toBeVisible();

  // Test Trip navigation in header gates sign-in
  await page.getByRole("link", { name: "Trip", exact: true }).first().click();
  const tripDialog = page.getByRole("dialog");
  await expect(tripDialog).toBeVisible();
  await tripDialog.getByRole("button", { name: "Continue browsing", exact: true }).click();
  await expect(tripDialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/customer$/);
});

test("Guest Mode signs out and booking requires sign-in", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("button", { name: /guest mode/i }).click();
  await expect(page).toHaveURL(/\/customer$/, { timeout: 15_000 });
  await page.goto("/customer/explore");

  await page.getByRole("button", { name: /^Open / }).first().click();
  await page.getByRole("link", { name: "View destination", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/activity\//);
  const listingUrl = page.url();
  const purchase = page.getByRole("button", { name: /add (to cart|booking to cart)|book now|buy now/i }).last();
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (request.method() === "POST" && /cart_items|\/api\/customer\/chat/.test(request.url())) mutations.push(request.url());
  });
  await purchase.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(listingUrl);
  await dialog.getByRole("button", { name: "Continue browsing", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(listingUrl);
  expect(mutations).toEqual([]);
  await purchase.click();
  await dialog.getByRole("button", { name: "Sign in / Register", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomer%2Factivity%2F/);
  await page.getByPlaceholder("Email address").fill(CUSTOMER_EMAIL);
  await page.getByPlaceholder("Password").fill("demo123456");
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(/\/customer\/activity\//, { timeout: 15_000 });
});

test("Guest private navigation offers one login-page button, with registration available there", async ({ page }) => {
  await page.goto("/customer/explore");
  const cart = page.getByRole("link", { name: "Shopping cart", exact: true });
  await cart.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/customer\/explore$/);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await expect(page).toHaveURL(/\/customer\/explore$/);
  await cart.click();
  await expect(dialog.getByRole("button", { name: "Create account", exact: true })).toHaveCount(0);
  await dialog.getByRole("button", { name: "Sign in / Register", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?next=%2Fcustomer%2Fcart$/);
  await page.getByRole("button", { name: "Create account", exact: true }).click();
  await expect(page.getByPlaceholder("Confirm password", { exact: true })).toBeVisible();
});

test("Guest Mode can open an approved vendor", async ({ page }) => {
  await page.goto("/guest/explore");
  await expect(page).toHaveURL(/\/customer\/explore$/, { timeout: 15_000 });
  await page.getByRole("link", { name: "Partners", exact: true }).first().click();
  await expect(page).toHaveURL(/\/customer\/partners$/);
  const vendor = page.locator('a[href^="/customer/vendor/"]').first();
  await expect(vendor).toBeVisible();
  await vendor.click();
  await expect(page).toHaveURL(/\/customer\/vendor\//);
});

test("Guest map save and notifications ask without making protected requests", async ({ page }) => {
  await page.goto("/customer/explore");
  await page.getByRole("button", { name: /^Open / }).first().click();
  const mutations: string[] = [];
  page.on("request", (request) => {
    if (["POST", "PATCH", "DELETE"].includes(request.method()) && /\/api\/(wishlist|notifications)/.test(request.url())) mutations.push(request.url());
  });
  const save = page.getByRole("button", { name: "Save place", exact: true });
  await save.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Continue browsing", exact: true }).click();
  await expect(save).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Notifications", exact: true }).click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/\/customer\/explore$/);
  expect(mutations).toEqual([]);
});
