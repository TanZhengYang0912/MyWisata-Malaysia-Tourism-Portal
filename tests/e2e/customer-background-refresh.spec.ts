import { chromium, expect, test, type BrowserContext, type Browser, type Page, type Request } from "@playwright/test";
import { api, localEnv } from "./helpers/demo";
import { installPortalFixtureCleanup, portalArtifacts, PortalFixture, type PortalAccount } from "./helpers/portal-fixture";
import { computeProfileVerification } from "../../lib/verification/eligibility";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

test.use({ trace: "off", video: "off" });
test.setTimeout(240_000);
test.describe.configure({ retries: 0 });
installPortalFixtureCleanup();

type CatalogueRow = {
  id: string;
  name: string;
  outlet_id: string | null;
};

type AuthPayload = {
  user?: {
    capabilities?: Record<string, Record<string, unknown>>;
  };
};

type StatsRevision = 1 | 2;
type ReadProbe = { maximum: Record<string, number>; active: Record<string, number> };

async function readProbe(page: Page): Promise<ReadProbe> {
  return page.evaluate(() => (window as unknown as { customerReadProbe: ReadProbe }).customerReadProbe);
}

async function focus(page: Page) {
  await page.bringToFront();
  await expect.poll(() => page.evaluate(() => document.visibilityState)).toBe('visible');
}

async function nativeBrowser() {
  // Use a disposable profile, never the user's browser. Connecting with
  // noDefaults avoids Playwright's always-focused-page overrides entirely.
  const directory = mkdtempSync(join(tmpdir(), 'portal-native-refresh-'));
  const child = spawn(chromium.executablePath(), ['--remote-debugging-port=0', `--user-data-dir=${directory}`, '--no-first-run', '--no-default-browser-check'], { stdio: 'ignore' });
  const exited = new Promise<void>(resolve => child.once('exit', () => resolve()));
  let browser: Browser | undefined;
  const close = async () => {
    // Do not let a pending route handler keep the disposable OS process alive.
    void browser?.close().catch(() => undefined);
    if (child.exitCode === null) child.kill('SIGTERM');
    let timer: ReturnType<typeof setTimeout> | undefined;
    await Promise.race([exited, new Promise<void>(resolve => { timer = setTimeout(() => { child.kill('SIGKILL'); resolve(); }, 5_000); })]);
    clearTimeout(timer);
    rmSync(directory, { recursive: true, force: true });
  };
  try {
    const endpoint = join(directory, 'DevToolsActivePort');
    await expect.poll(() => existsSync(endpoint), { timeout: 15_000 }).toBe(true);
    const port = readFileSync(endpoint, 'utf8').split('\n')[0];
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`, { noDefaults: true });
    return { context: browser.contexts()[0], close };
  } catch (error) {
    await close();
    throw error;
  }
}

function statsPayload(revision: StatsRevision) {
  const marker = `Financial snapshot v${revision}`;
  return {
    affiliateCode: "qa-background-refresh",
    affiliateUrl: "http://localhost:3000/r/qa-background-refresh",
    totals: {
      clicks: revision,
      referrals: 0,
      pendingEarnings: revision,
      availableToWithdraw: 0,
      totalEarnings: revision,
    },
    byProduct: [
      {
        productId: `00000000-0000-0000-0000-00000000000${revision}`,
        productName: marker,
        shares: 10,
        clicks: revision,
        referrals: 0,
        earnings: revision,
        reversedReferrals: 0,
      },
      {
        productId: `00000000-0000-0000-0000-00000000001${revision}`,
        productName: `Secondary snapshot v${revision}`,
        shares: 1,
        clicks: 0,
        referrals: 0,
        earnings: 0,
        reversedReferrals: 0,
      },
    ],
    byCampaign: [{ campaign: "qa-campaign", clicks: revision, referrals: 0, earnings: 0 }],
    clicksByDay: [{ date: "2026-10-27", clicks: revision }],
    commissions: [],
    funnel: {
      shares: revision,
      clicks: revision,
      conversions: 0,
      shareToClickRate: 1,
      clickToConversionRate: 0,
      byPlatform: [],
      sourceTrackingActive: false,
    },
    tier: {
      tierName: "standard",
      rate: 0.03,
      referralCount: 0,
      nextTier: null,
      referralsToNext: null,
    },
  };
}

async function installCustomerMocks(context: BrowserContext) {
  let statsRevision: StatsRevision = 1;
  let statsUnavailable = false;
  let statsReads = 0;

  await context.route("**/api/auth/me", async (route) => {
    // A page can navigate or close while this test-only proxy is in flight.
    // Never surface Playwright's raw fetch error (which can include cookies).
    const response = await route.fetch().catch(() => null);
    if (!response) { await route.abort().catch(() => undefined); return; }
    if (!response.ok()) {
      await route.fulfill({ response });
      return;
    }

    const payload = await response.json() as AuthPayload;
    if (!payload.user) {
      await route.fulfill({ response });
      return;
    }

    const capabilities = { ...(payload.user.capabilities ?? {}) };
    const allow = (current: Record<string, unknown> | undefined) => ({
      ...(current ?? {}),
      allowed: true,
      blockerCode: null,
      currentTier: null,
      requiredTier: null,
      nextAction: "none",
      qualificationPaths: [],
      entitlementGeneration: typeof current?.entitlementGeneration === "number" ? current.entitlementGeneration : 1,
      source: current?.source ?? "policy",
    });
    for (const key of ["affiliate_full", "affiliate_limited", "affiliate.full", "affiliate.limited"]) {
      capabilities[key] = allow(capabilities[key]);
    }
    payload.user.capabilities = capabilities;
    await route.fulfill({ response, json: payload });
  });

  await context.route("**/api/affiliate/stats", async (route) => {
    statsReads += 1;
    if (statsUnavailable) {
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ data: null, error: { code: "TEST_STATS_UNAVAILABLE" } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: statsPayload(statsRevision), error: null }),
    });
  });

  return {
    setStatsRevision(revision: StatsRevision) {
      statsRevision = revision;
      statsUnavailable = false;
    },
    setStatsUnavailable(value: boolean) {
      statsUnavailable = value;
    },
    getStatsReads() {
      return statsReads;
    },
  };
}

async function discoverCatalogue(fixture: PortalFixture) {
  const productResult = await fixture.service
    .from("products")
    .select("id,name,outlet_id,vendors!inner(status),categories!inner(slug)")
    .eq("status", "active")
    .eq("review_status", "approved")
    .eq("vendors.status", "approved")
    .neq("categories.slug", "accommodation")
    .not("outlet_id", "is", null)
    .order("id")
    .limit(1)
    .single();
  expect(productResult.error).toBeNull();
  const product = productResult.data as unknown as CatalogueRow | null;
  expect(product?.id, "The authorized test project needs one active non-hotel product").toBeTruthy();

  const hotelResult = await fixture.service
    .from("products")
    .select("id,name,outlet_id,vendors!inner(status),categories!inner(slug)")
    .eq("status", "active")
    .eq("review_status", "approved")
    .eq("vendors.status", "approved")
    .eq("categories.slug", "accommodation")
    .not("outlet_id", "is", null)
    .order("id")
    .limit(1)
    .single();
  expect(hotelResult.error).toBeNull();
  const hotelProduct = hotelResult.data as unknown as CatalogueRow | null;
  expect(hotelProduct?.outlet_id, "The authorized test project needs one active hotel product").toBeTruthy();

  const outletResult = await fixture.service
    .from("outlets")
    .select("id,name")
    .eq("id", hotelProduct!.outlet_id)
    .single();
  expect(outletResult.error).toBeNull();
  const outlet = outletResult.data as unknown as { id: string; name: string } | null;
  expect(outlet?.name, "The hotel product must have an outlet card name").toBeTruthy();

  return { product: product!, hotelProduct: hotelProduct!, outlet: outlet! };
}

test("keeps profile drafts while two tabs refresh saved cards and mocked affiliate stats", async ({ baseURL }) => {
  test.skip(!localEnv("PORTAL_E2E_TEST_DB_CONFIRM"), "Requires explicit confirmation of the authorized shared test project.");

  const fixture = new PortalFixture();
  let context: BrowserContext | null = null;
  let native: Awaited<ReturnType<typeof nativeBrowser>> | null = null;
  let account: PortalAccount | null = null;
  let productId: string | null = null;
  let outletId: string | null = null;
  const requestCounts = new Map<string, number>();
  const activeReads = new Map<Request, { page: Page; path: string; documentKey: string; startedAt: number }>();
  const perPageReads = new Map<Page, Map<string, number>>();
  const perDocumentReads = new Map<Page, Map<string, number>>();
  const documentGenerations = new Map<Page, number>();
  const maxConcurrentGetsPerPageByEndpoint: Record<string, number> = {};
  const maxConcurrentGetsPerDocumentByEndpoint: Record<string, number> = {};
  const readDurationsMs: Record<string, number[]> = {};
  let affiliateMutations = 0;

  try {
    account = await fixture.createAccount();
    const catalogue = await discoverCatalogue(fixture);
    productId = catalogue.product.id;
    outletId = catalogue.outlet.id;

    native = await nativeBrowser();
    context = native.context;
    await context.addInitScript(() => {
      const probe: ReadProbe = { maximum: {}, active: {} };
      (window as unknown as { customerReadProbe: ReadProbe }).customerReadProbe = probe;
      const watched = new Set(['/api/wishlist', '/api/saved-outlets', '/api/saved-destinations', '/api/affiliate/stats']);
      const originalFetch = window.fetch.bind(window);
      window.fetch = async (input, init) => {
        const path = new URL(input instanceof Request ? input.url : String(input), location.href).pathname;
        const method = init?.method ?? (input instanceof Request ? input.method : 'GET');
        if (method !== 'GET' || !watched.has(path)) return originalFetch(input, init);
        const signal = init?.signal ?? (input instanceof Request ? input.signal : null);
        if (signal?.aborted) return originalFetch(input, init);
        probe.active[path] = (probe.active[path] ?? 0) + 1;
        probe.maximum[path] = Math.max(probe.maximum[path] ?? 0, probe.active[path]);
        let finished = false;
        const finish = () => {
          if (finished) return;
          finished = true; probe.active[path] -= 1;
          signal?.removeEventListener('abort', finish);
        };
        signal?.addEventListener('abort', finish, { once: true });
        try {
          const response = await originalFetch(input, init);
          // Track body completion, not just response headers, without consuming
          // the application's body. Record counters only; never data or headers.
          void response.clone().text().then(finish, finish);
          return response;
        } catch (error) { finish(); throw error; }
      };
    });
    const customerMocks = await installCustomerMocks(context);
    context.on("request", (request) => {
      const path = new URL(request.url()).pathname;
      if (request.isNavigationRequest() && request.frame() === request.frame().page().mainFrame()) {
        const page = request.frame().page();
        documentGenerations.set(page, (documentGenerations.get(page) ?? 0) + 1);
      }
      if (request.method() !== "GET" && path.startsWith("/api/affiliate/")) affiliateMutations += 1;
      if (request.method() === "GET" && ["/api/wishlist", "/api/saved-outlets", "/api/saved-destinations"].includes(path)) {
        requestCounts.set(path, (requestCounts.get(path) ?? 0) + 1);
      }
      if (request.method() === 'GET' && ['/api/wishlist', '/api/saved-outlets', '/api/saved-destinations', '/api/affiliate/stats'].includes(path)) {
        const page = request.frame().page();
        const counts = perPageReads.get(page) ?? new Map<string, number>();
        const pending = (counts.get(path) ?? 0) + 1;
        counts.set(path, pending); perPageReads.set(page, counts);
        maxConcurrentGetsPerPageByEndpoint[path] = Math.max(maxConcurrentGetsPerPageByEndpoint[path] ?? 0, pending);
        const documentKey = `${documentGenerations.get(page) ?? 0}:${path}`;
        const documentCounts = perDocumentReads.get(page) ?? new Map<string, number>();
        const documentPending = (documentCounts.get(documentKey) ?? 0) + 1;
        documentCounts.set(documentKey, documentPending); perDocumentReads.set(page, documentCounts);
        maxConcurrentGetsPerDocumentByEndpoint[path] = Math.max(maxConcurrentGetsPerDocumentByEndpoint[path] ?? 0, documentPending);
        activeReads.set(request, { page, path, documentKey, startedAt: Date.now() });
      }
    });
    const finishRead = (request: Request) => {
      const read = activeReads.get(request);
      if (!read) return;
      activeReads.delete(request);
      const counts = perPageReads.get(read.page);
      counts?.set(read.path, Math.max(0, (counts.get(read.path) ?? 0) - 1));
      const documentCounts = perDocumentReads.get(read.page);
      documentCounts?.set(read.documentKey, Math.max(0, (documentCounts.get(read.documentKey) ?? 0) - 1));
      (readDurationsMs[read.path] ??= []).push(Date.now() - read.startedAt);
    };
    context.on('requestfinished', finishRead);
    context.on('requestfailed', finishRead);

    await fixture.authenticateCustomer(context, account, baseURL!);
    // Reproduce returning from Preferences to Identity without changing the
    // account's real profile or bypassing any server authorization boundary.
    await context.route('**/api/profile/me', async route => {
      const response = await route.fetch().catch(() => null);
      if (!response) { await route.abort().catch(() => undefined); return; }
      expect(response.status()).toBe(200);
      const payload = await response.json();
      const savedProfile = { ...payload.data, fullName: 'QA profile', city: 'Kuala Lumpur', country: 'Malaysia', bio: 'I enjoy travel.', avatarUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=' };
      await route.fulfill({ response, json: { ...payload, data: { ...savedProfile, verification: computeProfileVerification({ ...savedProfile, surveyComplete: false }) } } });
    });
    const artifacts = portalArtifacts();
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    await pageA.setViewportSize({ width: 1440, height: 1000 });
    await pageB.setViewportSize({ width: 1440, height: 1000 });
    const localeResponse = await pageA.request.post(new URL("/api/locale", baseURL!).href, { data: { locale: "en" } });
    expect(localeResponse.status()).toBe(200);

    const identityInput = pageA.locator('input[placeholder="e.g. Ahmad Bin Ali"]');
    await pageA.goto(new URL("/customer/profile", baseURL!).href, { waitUntil: "domcontentloaded" });
    await focus(pageA);
    await expect(pageA.locator('[aria-current="step"]')).toContainText('Preferences', { timeout: 60_000 });
    await pageA.screenshot({ path: `${artifacts}/profile-before-return.png`, fullPage: true });
    await pageA.getByRole('button', { name: /Identity/ }).click();
    await expect(identityInput).toBeVisible({ timeout: 60_000 });
    const draftName = `QA draft ${fixture.runId.slice(0, 8)}`;
    await identityInput.fill(draftName);

    await pageB.goto(new URL("/customer", baseURL!).href, { waitUntil: "domcontentloaded" });
    await focus(pageB);
    await expect.poll(() => pageB.evaluate(() => document.visibilityState)).toBe("visible");
    await expect.poll(() => pageA.evaluate(() => document.visibilityState)).toBe('hidden');
    await focus(pageA);
    await expect.poll(() => pageA.evaluate(() => document.visibilityState)).toBe("visible");
    await expect(identityInput).toHaveValue(draftName);
    await expect(pageA.locator('[aria-current="step"]')).toContainText("Identity");
    await pageA.screenshot({ path: `${artifacts}/profile-retained-step.png`, fullPage: true });
    const profileProbe = await readProbe(pageA);

    await pageA.goto(new URL("/customer/saved", baseURL!).href, { waitUntil: "domcontentloaded" });
    await expect(pageA.getByRole("heading", { name: "Saved places & items", exact: true })).toBeVisible({ timeout: 60_000 });
    const placesTab = pageA.getByRole("tab", { name: /^places\s+\d+$/i });
    await placesTab.click();
    await expect(placesTab).toHaveAttribute("aria-selected", "true");
    await pageA.screenshot({ path: `${artifacts}/saved-before-update.png`, fullPage: true });

    await pageB.goto(new URL("/customer", baseURL!).href, { waitUntil: "domcontentloaded" });
    const beforeSavedRefresh = new Map(requestCounts);
    expect((await api(pageB, "POST", "/api/wishlist", { productId })).status).toBe(201);
    expect((await api(pageB, "POST", "/api/saved-outlets", { outletId })).status).toBe(201);
    expect((await api(pageB, "POST", "/api/saved-destinations", { destinationState: "Penang" })).status).toBe(201);

    await focus(pageB);
    await focus(pageA);
    await expect.poll(() => pageA.evaluate(() => document.visibilityState)).toBe("visible");
    for (const path of ["/api/wishlist", "/api/saved-outlets", "/api/saved-destinations"]) {
      await expect.poll(() => requestCounts.get(path) ?? 0, { timeout: 30_000 }).toBeGreaterThan(beforeSavedRefresh.get(path) ?? 0);
    }
    await expect(pageA.getByRole("heading", { name: "Penang", exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(placesTab).toHaveAttribute("aria-selected", "true");

    const experiencesTab = pageA.getByRole("tab", { name: /Saved items/ });
    await experiencesTab.click();
    await expect(pageA.getByText(catalogue.product.name, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    await expect(pageA.getByRole("heading", { name: catalogue.outlet.name, exact: true })).toBeVisible({ timeout: 30_000 });
    await pageA.screenshot({ path: `${artifacts}/saved-updated-cards.png`, fullPage: true });

    const beforeSavedRemoval = new Map(requestCounts);
    expect((await api(pageB, "DELETE", "/api/wishlist", { productId })).status).toBe(200);
    expect((await api(pageB, "DELETE", "/api/saved-outlets", { outletId })).status).toBe(200);
    expect((await api(pageB, "DELETE", "/api/saved-destinations", { destinationState: "Penang" })).status).toBe(200);
    await focus(pageB);
    await focus(pageA);
    for (const path of ["/api/wishlist", "/api/saved-outlets", "/api/saved-destinations"]) {
      await expect.poll(() => requestCounts.get(path) ?? 0, { timeout: 30_000 }).toBeGreaterThan(beforeSavedRemoval.get(path) ?? 0);
    }
    await expect(pageA.getByText(catalogue.product.name, { exact: true })).toHaveCount(0, { timeout: 30_000 });
    await expect(pageA.getByRole("heading", { name: catalogue.outlet.name, exact: true })).toHaveCount(0, { timeout: 30_000 });
    await placesTab.click();
    await expect(pageA.getByRole("heading", { name: "Penang", exact: true })).toHaveCount(0, { timeout: 30_000 });
    await pageA.screenshot({ path: `${artifacts}/saved-after-removal.png`, fullPage: true });
    const savedProbe = await readProbe(pageA);

    await pageA.goto(new URL("/customer/affiliate", baseURL!).href, { waitUntil: "domcontentloaded" });
    await expect(pageA.getByText("Financial snapshot v1", { exact: true })).toBeVisible({ timeout: 60_000 });
    const campaignInput = pageA.getByPlaceholder("Campaign name");
    await campaignInput.fill("cross-window-campaign");
    const sharesSort = pageA.getByRole("button", { name: /shares/i }).first();
    await sharesSort.click();
    await expect(sharesSort).toHaveText(/[↑↓]/);
    await pageA.screenshot({ path: `${artifacts}/affiliate-before-failure.png`, fullPage: true });

    const beforeStatsFailure = customerMocks.getStatsReads();
    customerMocks.setStatsUnavailable(true);
    await focus(pageB);
    await focus(pageA);
    await expect.poll(() => customerMocks.getStatsReads(), { timeout: 30_000 }).toBeGreaterThan(beforeStatsFailure);
    await expect(pageA.getByText("Financial snapshot v1", { exact: true })).toBeVisible();
    await expect(pageA.getByText("Unable to refresh. Showing the last update.", { exact: true })).toBeVisible({ timeout: 30_000 });
    await pageA.screenshot({ path: `${artifacts}/affiliate-stale-data.png`, fullPage: true });
    await expect(campaignInput).toHaveValue("cross-window-campaign");
    await expect(sharesSort).toHaveText(/[↑↓]/);

    const beforeStatsSuccess = customerMocks.getStatsReads();
    customerMocks.setStatsRevision(2);
    await focus(pageB);
    await focus(pageA);
    await expect.poll(() => customerMocks.getStatsReads(), { timeout: 30_000 }).toBeGreaterThan(beforeStatsSuccess);
    await expect(pageA.getByText("Financial snapshot v2", { exact: true })).toBeVisible({ timeout: 30_000 });
    await expect(pageA.getByText("Unable to refresh. Showing the last update.", { exact: true })).toHaveCount(0);
    await expect(campaignInput).toHaveValue("cross-window-campaign");
    await expect(sharesSort).toHaveText(/[↑↓]/);
    expect(affiliateMutations).toBe(0);

    await pageA.screenshot({ path: `${artifacts}/affiliate-refreshed.png`, fullPage: true });
    const clientReadProbes = { profile: profileProbe, saved: savedProbe, affiliate: await readProbe(pageA), otherTab: await readProbe(pageB) };
    writeFileSync(`${artifacts}/request-counts.json`, JSON.stringify({ savedGetRequestsAcrossBothTabs: Object.fromEntries(requestCounts), statsReads: customerMocks.getStatsReads(), affiliateMutations, realVisibilityTransitionVerified: true, observedPendingNetworkEventsPerPage: maxConcurrentGetsPerPageByEndpoint, observedPendingNetworkEventsPerDocument: maxConcurrentGetsPerDocumentByEndpoint, clientReadProbes, readDurationsMs, measurementBoundary: 'Network event counts can include aborted or unloading-document requests. Client probes count body-pending, non-aborted reads in each live document; neither measure server-side cancellation or database concurrency.', queuedTrailingReadBound: 'One queued trailing read per resource/owner is verified in the runtime tests.' }, null, 2));
    for (const probe of Object.values(clientReadProbes)) {
      for (const maximum of Object.values(probe.maximum)) expect(maximum).toBe(1);
    }
  } finally {
    try {
      if (account) {
      const destinationCleanup = await fixture.service.from("customer_saved_destinations").delete().eq("user_id", account.id).eq("destination_state", "Penang");
      expect(destinationCleanup.error).toBeNull();
      if (productId) {
        const productCleanup = await fixture.service.from("customer_wishlists").delete().eq("user_id", account.id).eq("product_id", productId);
        expect(productCleanup.error).toBeNull();
      }
      if (outletId) {
        const outletCleanup = await fixture.service.from("customer_saved_outlets").delete().eq("user_id", account.id).eq("outlet_id", outletId);
        expect(outletCleanup.error).toBeNull();
      }
      }
    } finally {
      try { await context?.unrouteAll({ behavior: 'ignoreErrors' }); await native?.close(); }
      finally { await fixture.cleanup(); }
    }
  }
});
