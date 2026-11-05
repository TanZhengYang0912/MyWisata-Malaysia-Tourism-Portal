import { localEnv, signIn } from './helpers/demo';
import { expect, test, type Locator, type Page } from "@playwright/test";


type DemoRole =
  | "customer"
  | "vendor_owner"
  | "outlet_manager"
  | "admin"
  | "approver"
  | "super_admin";

type DemoAccount = {
  id: string;
  email: string;
  name: string;
  role: DemoRole;
};

type Locale = "en" | "zh-CN" | "ms";

const ADMIN_COPY: Record<Exclude<Locale, "en">, {
  queueTitle: string;
  recommendationNav: string;
  roleName: Record<DemoRole, string>;
  userManagementNav: string;
  detailEvidence: string;
  detailNotFound: string;
  reviewDecision: string;
  approve: string;
  requestChanges: string;
  reject: string;
}> = {
  ms: {
    queueTitle: "Moderasi Cadangan",
    recommendationNav: "Cadangan",
    roleName: {
      customer: "Pelanggan",
      vendor_owner: "Pemilik vendor",
      outlet_manager: "Pengurus outlet",
      admin: "Pentadbir",
      approver: "Pelulus",
      super_admin: "Pentadbir super",
    },
    userManagementNav: "Pengurusan pengguna",
    detailEvidence: "Bukti penyerahan",
    detailNotFound: "Cadangan tidak ditemui.",
    reviewDecision: "Keputusan semakan",
    approve: "Luluskan cadangan",
    requestChanges: "Minta perubahan",
    reject: "Tolak cadangan",
  },
  "zh-CN": {
    queueTitle: "推荐审核",
    recommendationNav: "推荐",
    roleName: {
      customer: "客户",
      vendor_owner: "商家所有者",
      outlet_manager: "门店经理",
      admin: "管理员",
      approver: "审批员",
      super_admin: "超级管理员",
    },
    userManagementNav: "用户管理",
    detailEvidence: "提交证据",
    detailNotFound: "未找到推荐。",
    reviewDecision: "审核决定",
    approve: "批准推荐",
    requestChanges: "要求修改",
    reject: "拒绝推荐",
  },
};

const VENDOR_COPY = {
  ms: {
    navigation: "Papan pemuka",
    managerNavigation: "Operasi",
    pageTitle: "Produk & aktiviti",
  },
  "zh-CN": {
    navigation: "仪表板",
    managerNavigation: "运营",
    pageTitle: "产品与活动",
  },
} as const;

function languageSelect(page: Page): Locator {
  // The shared LanguageSwitcher is a Radix combobox, not a native <select>.
  return page.getByRole("combobox").first();
}

async function switchLanguage(page: Page, locale: Locale) {
  const select = languageSelect(page);
  await expect(select).toBeVisible();

  const label = locale === "zh-CN" ? "简体中文" : locale === "ms" ? "Bahasa Melayu" : "English";
  if (!(await select.innerText()).includes(label)) {
    const responsePromise = page.waitForResponse((response) => {
      const url = new URL(response.url());
      return url.pathname === "/api/locale" && response.request().method() === "POST";
    });
    await select.click();
    await page.getByRole("option", { name: label, exact: true }).click();
    const response = await responsePromise;
    expect(response.status(), `Locale update to ${locale} failed`).toBe(200);
  }

  await expect(select).toContainText(label);
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

async function openCustomerAccountMenu(page: Page): Promise<Locator> {
  const menu = page.getByRole("menu", { name: /^(Account menu|Menu akaun|账户菜单)$/ });
  if (!(await menu.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: /account menu|akaun tetamu|账户菜单/i }).click();
  }
  await expect(menu).toBeVisible();
  return menu;
}

async function loadDemoAccounts(page: Page): Promise<DemoAccount[]> {
  const response = await page.request.get("/api/auth/demo-users");
  expect(response.status(), "Demo account list is unavailable").toBe(200);
  const payload = await response.json() as unknown;
  if (!Array.isArray(payload)) throw new Error("Demo account list did not return an array");
  return payload as DemoAccount[];
}

async function requireDemoAccount(page: Page, role: DemoRole, preferredEmail?: string): Promise<DemoAccount> {
  const accounts = await loadDemoAccounts(page);
  const account = (preferredEmail && accounts.find((candidate) => candidate.email === preferredEmail && candidate.role === role))
    ?? accounts.find((candidate) => candidate.role === role);

  if (!account) {
    throw new Error(`No seeded ${role} demo account is available`);
  }

  return account;
}

async function signInDemoAccount(page: Page, account: DemoAccount) {
  await signIn(page, account.email);
}

async function signOutCustomer(page: Page) {
  const menu = await openCustomerAccountMenu(page);
  await menu.getByRole("menuitem", { name: /switch account|切换账户|tukar akaun/i }).click();
  await page.waitForURL(/\/login/, { timeout: 15_000 });
}

async function verifyOptionalRecommendationDetail(page: Page, copy: typeof ADMIN_COPY["ms"]) {
  const detailLink = page.locator('a[href^="/admin/recommendations/"]').first();

  try {
    await expect(detailLink).toBeVisible({ timeout: 5_000 });
  } catch {
    return;
  }

  await detailLink.click();
  await expect(page).toHaveURL(/\/admin\/recommendations\/[^/]+$/);

  const detailContent = page.getByText(copy.detailEvidence, { exact: true })
    .or(page.getByText(copy.detailNotFound, { exact: true }));
  await expect(detailContent).toBeVisible({ timeout: 10_000 });

  const reviewDecision = page.getByRole("heading", { name: copy.reviewDecision, exact: true });
  if (await reviewDecision.isVisible().catch(() => false)) {
    await expect(page.getByRole("button", { name: copy.approve, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.requestChanges, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: copy.reject, exact: true })).toBeVisible();
  }
}

test.describe("Sitewide language switching", () => {
  test.describe.configure({ timeout: 60_000 });

  test.beforeAll(async ({ request }) => {
    const supabaseUrl = localEnv('NEXT_PUBLIC_SUPABASE_URL');
    const projectRef = supabaseUrl
      ? new URL(supabaseUrl).hostname.match(/^([a-z0-9]{20})\.supabase\.co$/)?.[1]
      : undefined;
    test.skip(
      !projectRef || localEnv('PORTAL_E2E_TEST_DB_CONFIRM') !== projectRef,
      'Requires PORTAL_E2E_TEST_DB_CONFIRM to match the exact isolated Supabase project; this suite changes seeded account language preferences.',
    );

    const baseURL = test.info().project.use.baseURL;
    const configuredSiteUrl = localEnv('NEXT_PUBLIC_SITE_URL');
    const isLoopback = (value: string | undefined) => {
      if (!value) return false;
      try {
        return ['localhost', '127.0.0.1'].includes(new URL(value).hostname);
      } catch {
        return false;
      }
    };
    test.skip(
      !isLoopback(baseURL) || !isLoopback(configuredSiteUrl),
      'Language-switching browser tests must target the local application, not the production website.',
    );

    // Compile and prove the locale route before browser interactions so a
    // Next.js dev-server cold start is not charged to the first UI assertion.
    const response = await request.post("/api/locale", { data: { locale: "en" } });
    expect(response.status()).toBe(200);
  });

  test.beforeEach(async ({ context }) => {
    await context.clearCookies();
  });

  test("anonymous login switches to Chinese and persists on refresh", async ({ page }) => {
    await page.goto("/login");
    await switchLanguage(page, "zh-CN");

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();

    await page.reload();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
  });

  test("guest Malay chrome leaves dynamic vendor names unchanged", async ({ page }) => {
    await page.goto("/login");
    const dynamicAccountNames = (await loadDemoAccounts(page))
      .filter((account) => account.role === "vendor_owner" || account.role === "outlet_manager")
      .slice(0, 3)
      .map((account) => account.name);
    for (const name of dynamicAccountNames) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await switchLanguage(page, "ms");
    await expect(page.getByRole("heading", { name: "Selamat kembali", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Teruskan dengan Google", exact: true })).toBeVisible();
    for (const name of dynamicAccountNames) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }

    await page.goto("/customer/explore?category=food&page=2");
    await expect(page.getByRole("link", { name: "Rakan kongsi", exact: true }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: "Terokai", exact: true }).first()).toBeVisible();
    await expect((await openCustomerAccountMenu(page)).getByRole("menuitem", { name: "Log masuk", exact: true })).toBeVisible();
  });

  test("customer demo preference survives refresh and sign-out/login", async ({ page }) => {
    const account = await requireDemoAccount(page, "customer", "customer1@demo.local");
    await signInDemoAccount(page, account);
    await page.goto("/customer/preferences");

    await switchLanguage(page, "zh-CN");
    await expect(page.getByRole("link", { name: "合作伙伴", exact: true }).first()).toBeVisible();
    await expect((await openCustomerAccountMenu(page)).getByRole("menuitem", { name: /我的活动/ })).toBeVisible();
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("link", { name: "合作伙伴", exact: true }).first()).toBeVisible();

    await signOutCustomer(page);
    await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();

    // Clear the anonymous cookie so the next sign-in proves the account value,
    // not only the browser cookie, is the durable preference source.
    await page.context().clearCookies();
    await signInDemoAccount(page, account);
    await page.goto("/customer/preferences");
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("link", { name: "合作伙伴", exact: true }).first()).toBeVisible();
  });

  test("vendor owner shell and listings switch through Malay and Chinese", async ({ page }) => {
    const account = await requireDemoAccount(page, "vendor_owner", "vendor.owner@demo.local");
    await signInDemoAccount(page, account);
    await page.goto("/vendor/products");

    await switchLanguage(page, "ms");
    await expect(page.getByRole("link", { name: VENDOR_COPY.ms.navigation, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: VENDOR_COPY.ms.pageTitle, exact: true })).toBeVisible();

    await switchLanguage(page, "zh-CN");
    await expect(page.getByRole("link", { name: VENDOR_COPY["zh-CN"].navigation, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: VENDOR_COPY["zh-CN"].pageTitle, exact: true })).toBeVisible();
  });

  test("outlet manager shell and listings switch through Malay and Chinese", async ({ page }) => {
    const account = await requireDemoAccount(page, "outlet_manager", "outlet.manager@demo.local");
    await signInDemoAccount(page, account);
    await page.goto("/vendor/products");

    await switchLanguage(page, "ms");
    await expect(page.getByRole("link", { name: VENDOR_COPY.ms.managerNavigation, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: VENDOR_COPY.ms.pageTitle, exact: true })).toBeVisible();

    await switchLanguage(page, "zh-CN");
    await expect(page.getByRole("link", { name: VENDOR_COPY["zh-CN"].managerNavigation, exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: VENDOR_COPY["zh-CN"].pageTitle, exact: true })).toBeVisible();
  });

  for (const [role, locale] of [["admin", "ms"], ["approver", "zh-CN"], ["super_admin", "zh-CN"]] as const) {
    test(`${role} shell and recommendation queue keep locale and role actions`, async ({ page }) => {
      const availableAccounts = await loadDemoAccounts(page);
      const account = availableAccounts.find((candidate) => candidate.role === role);
      test.skip(!account, `No seeded ${role} account is available in the isolated E2E project`);
      await signInDemoAccount(page, account!);
      await page.goto("/admin/recommendations");

      const copy = ADMIN_COPY[locale];
      await switchLanguage(page, locale);
      await expect(page.getByRole("heading", { name: copy.queueTitle, exact: true })).toBeVisible();
      await expect(page.getByRole("link", { name: copy.recommendationNav, exact: true })).toBeVisible();
      await expect(page.getByText(copy.roleName[role], { exact: true })).toBeVisible();

      const userManagement = page.getByRole("link", { name: copy.userManagementNav, exact: true });
      if (role === "super_admin") {
        await expect(userManagement).toBeVisible();
      } else {
        await expect(userManagement).toHaveCount(0);
      }

      await verifyOptionalRecommendationDetail(page, copy);
    });
  }

  test("language switching preserves filtered and paginated route query parameters", async ({ page }) => {
    await page.goto("/login?next=%2Fcustomer%2Factivity&tab=orders&history=past&page=2&state=Penang");
    await expect(page.getByRole("heading", { name: "Welcome back", exact: true })).toBeVisible();

    const before = new URL(page.url());
    await switchLanguage(page, "ms");

    const after = new URL(page.url());
    expect(after.pathname).toBe(before.pathname);
    expect(after.search).toBe(before.search);
  });

  test("Chinese route reload has translated first paint and html language", async ({ page }) => {
    await page.goto("/login");
    await switchLanguage(page, "zh-CN");
    await page.goto("/login?next=%2Fcustomer%2Factivity");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("html")).toHaveAttribute("lang", "zh-CN");
    await expect(page.getByRole("heading", { name: "欢迎回来", exact: true })).toBeVisible();
  });
});
