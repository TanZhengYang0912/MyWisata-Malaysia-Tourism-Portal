import { expect, test, type Page } from "@playwright/test";

type Tier = "email_verified" | "phone_verified" | "profile_complete" | "kyc_verified";

async function mockViewerTier(page: Page, tier: Tier) {
  await page.route("**/rest/v1/users*", async (route) => {
    const url = new URL(route.request().url());
    const select = url.searchParams.get("select");
    if (!url.pathname.endsWith("/rest/v1/users") || !select?.startsWith("id,email,full_name")) return route.continue();
    await route.fulfill({
      status: 200,
      contentType: "application/vnd.pgrst.object+json",
      body: JSON.stringify({
        id: "aaaaaaaa-0000-0000-0000-000000000005",
        email: "customer1@demo.local",
        full_name: "Customer Alice",
        city: "Kuala Lumpur",
        country: "Malaysia",
        phone: "+60123456789",
        status: "active",
        tier,
        user_roles: [{ vendor_id: null, outlet_id: null, roles: { name: "customer" }, outlets: null }],
      }),
    });
  });
}

async function signInFixture(page: Page, tier: Tier) {
  await mockViewerTier(page, tier);
  const response = await page.request.post("/api/auth/demo-signin", { data: { email: "customer1@demo.local" } });
  if (response.status() === 401) test.skip(true, "Seeded customer demo session is unavailable");
  expect(response.status()).toBe(200);
}

async function mockWallet(page: Page, earningsSen = 5000) {
  await page.route("**/api/wallet/summary", (route) => route.fulfill({ json: { data: { topupSen: 0, earningsSen, pendingEarningsSen: 0, reservedEarningsSen: 0, withdrawnEarningsSen: 0 } } }));
  await page.route("**/api/wallet/destinations", (route) => route.fulfill({ json: { data: { destinations: [], capabilities: { bank_account: { enabled: true, provider: "stripe_connect" }, e_wallet: { enabled: false, provider: null } } } } }));
  await page.route("**/rest/v1/withdrawal_requests*", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "[]" }));
}

test.beforeEach(async ({ context }) => {
  await context.clearCookies();
});

test("Email Verified is routed to phone verification before checkout", async ({ page }) => {
  await signInFixture(page, "email_verified");
  await page.goto("/customer/checkout");
  await expect(page).toHaveURL(/\/customer\/profile\?next=%2Fcustomer%2Fcheckout/);
});

test("Phone Verified reaches checkout but recommendation requires Profile Complete", async ({ page }) => {
  await signInFixture(page, "phone_verified");
  await page.goto("/customer/checkout");
  await expect(page).toHaveURL(/\/customer\/checkout$/);
  await expect(page.getByText("Nothing to check out")).toBeVisible();

  await page.goto("/customer/recommendations");
  await page.getByRole("button", { name: "Complete profile" }).click();
  await expect(page).toHaveURL(/\/customer\/profile\?next=%2Fcustomer%2Frecommendations/);
});

test("Profile Complete can recommend and use limited Affiliate, but withdrawal requires KYC", async ({ page }) => {
  await signInFixture(page, "profile_complete");
  await page.route("**/api/recommendations", (route) => route.fulfill({ json: { data: [] } }));
  await page.goto("/customer/recommendations");
  await expect(page.getByRole("button", { name: "Recommend", exact: true })).toBeVisible();

  await page.route("**/api/affiliate/stats", (route) => route.fulfill({ json: { data: {
    affiliateCode: null,
    affiliateUrl: null,
    totals: { clicks: 0, referrals: 0, pendingEarnings: 0, availableToWithdraw: 0 },
    byProduct: [], clicksByDay: [], commissions: [], funnel: {
      shares: 0,
      clicks: 0,
      conversions: 0,
      shareToClickRate: null,
      clickToConversionRate: null,
      byPlatform: [],
      sourceTrackingActive: false,
    },
    tier: { tierName: "Limited", rate: 0.01, referralCount: 0, nextTier: null, referralsToNext: null },
  } } }));
  await page.goto("/customer/affiliate");
  await expect(page.getByRole("button", { name: "Generate my link" })).toBeVisible();

  await mockWallet(page);
  await page.goto("/customer/wallet");
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page).toHaveURL(/\/customer\/kyc\?next=%2Fcustomer%2Fwallet/);
});

test("KYC Verified reaches the existing JIT withdrawal form", async ({ page }) => {
  await signInFixture(page, "kyc_verified");
  await mockWallet(page);
  await page.route("**/api/stripe/connect-status", (route) => route.fulfill({ json: { data: { accountId: "acct_browser_test", tier: "kyc_verified", payoutsEnabled: true, payoutStatus: "payouts_enabled" } } }));
  await page.goto("/customer/wallet");
  await expect(page.getByRole("heading", { name: "My Wallet" })).toBeVisible();
  await page.getByRole("button", { name: "Withdraw", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Request Withdrawal" })).toBeVisible();
});
