import { expect, test, type Page } from "@playwright/test";

const CUSTOMER_EMAIL = "customer1@demo.local";
const DEMO_PASSWORD = "demo123456";

async function firstActivityHref(page: Page) {
  const link = page.locator('a[href^="/customer/activity/"]').first();
  await expect(link).toBeVisible({ timeout: 15_000 });
  return await link.getAttribute("href");
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("Guest uses the Customer shell and account pages stay request-free", async ({ page }) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/\/api\/(wallet|stripe\/connect-status|support|notifications|wishlist|saved-destinations|chat)/.test(url)
      || /\/rest\/v1\/(orders|bookings|withdrawal_requests|chat_threads|chat_messages|customer_wishlists|customer_saved_destinations)/.test(url)) {
      privateRequests.push(url);
    }
  });

  await page.goto("/customer");
  await expect(page.getByText("Guest", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Explore", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Map", exact: true })).toBeVisible();

  for (const path of [
    "/customer/wallet",
    "/customer/orders",
    "/customer/calendar",
    "/customer/chat",
    "/customer/wishlist",
    "/customer/cart",
    "/customer/notifications",
    "/customer/support",
  ]) {
    await page.goto(path);
    await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  }

  await page.goto("/customer/wallet");
  await expect(page.getByText("RM 0.00", { exact: true })).toBeVisible();
  await expect(page.getByText(/sign in to view your wallet/i)).toBeVisible();
  expect(privateRequests).toEqual([]);
});

test("Guest mutation preserves the Listing continuation through sign-in", async ({ page }) => {
  const probe = await page.request.post("/api/auth/demo-signin", { data: { email: CUSTOMER_EMAIL } });
  if (probe.status() === 401) test.skip(true, "Seeded customer demo session is unavailable");
  await page.context().clearCookies();

  await page.goto("/customer");
  const href = await firstActivityHref(page);
  expect(href).toBeTruthy();
  await page.goto(href!);
  await page.getByRole("button", { name: /add (booking to cart|to cart)/i }).first().click();
  await expect(page).toHaveURL(new RegExp(`/login\\?next=${encodeURIComponent(href!).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));

  await page.getByPlaceholder("Email address").fill(CUSTOMER_EMAIL);
  await page.getByPlaceholder("Password").fill(DEMO_PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).last().click();
  await expect(page).toHaveURL(new RegExp(`${href!.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`), { timeout: 15_000 });
});

test("broken Listing media has a visible fallback and legacy Guest URLs canonicalize", async ({ page }) => {
  await page.route("**/*", async (route) => {
    if (route.request().resourceType() === "image") return route.abort();
    return route.continue();
  });
  await page.goto("/customer");
  const href = await firstActivityHref(page);
  await page.goto(href!);
  await expect(page.getByRole("img", { name: /image unavailable/i }).first()).toBeVisible();

  const activityId = new URL(href!, "http://localhost:3000").pathname.split("/").at(-1);
  await page.goto(`/guest/activity/${activityId}`);
  await expect(page).toHaveURL(new RegExp(`/customer/activity/${activityId}$`));
  await page.goto("/guest/explore");
  await expect(page).toHaveURL(/\/customer$/);
});
