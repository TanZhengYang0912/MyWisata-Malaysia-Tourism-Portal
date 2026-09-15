import { expect, test, type Page } from "@playwright/test";

const DEMO_PASSWORD = "demo123456";

test.setTimeout(60_000);
test.describe.configure({ retries: 0 });

async function signInCustomer(page: Page) {
  const accountsResponse = await page.request.get("/api/auth/demo-users");
  expect(accountsResponse.status()).toBe(200);
  const accounts = await accountsResponse.json() as Array<{ id: string; email: string; role: string }>;
  const customer = accounts.find((account) => account.role === "customer");
  if (!customer) throw new Error("No seeded customer demo account is available");

  await page.request.post("/api/auth/demo-signin", { data: { email: customer.email } });
  await page.goto("/login");
  const form = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  await form.locator('input[type="email"]').fill(customer.email);
  await form.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await form.getByRole("button", { name: /^(sign in|登录|log masuk)$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
  return customer;
}

function malaysiaTodayIsoDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kuala_Lumpur",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function addCalendarDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

test("journey canvas assigns a real activity to a day and anchors route weather on the map", async ({ page }) => {
  const customer = await signInCustomer(page);
  await page.request.post("/api/locale", { data: { locale: "zh-CN" } });

  const date = malaysiaTodayIsoDate();
  const trip = {
    id: "journey-canvas-e2e",
    user_id: customer.id,
    name: "Penang Weather Journey",
    start_date: date,
    end_date: date,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const origin = {
    id: "journey-origin",
    trip_id: trip.id,
    experience_id: null,
    sequence: 0,
    scheduled_date: null,
    scheduled_time: null,
    created_at: new Date().toISOString(),
    source: "location",
    kind: "custom",
    lat: 5.4141,
    lng: 100.3288,
    label: "George Town",
  };

  await page.context().addCookies([
    { name: "MOCK_TRIPS", value: encodeURIComponent(JSON.stringify([trip])), domain: "localhost", path: "/" },
    { name: "MOCK_TRIP_ITEMS", value: encodeURIComponent(JSON.stringify([origin])), domain: "localhost", path: "/" },
  ]);

  await page.route("https://tiles.openfreemap.org/styles/liberty", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#dbeafe" } }] }),
  }));
  await page.route("**/api/weather/forecast", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ data: { results: {} } }),
  }));
  let forecastOverlayRequests = 0;
  let radarMetadataRequests = 0;
  await page.route("**/api/weather/overlay", async (route) => {
    forecastOverlayRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data: {
        availability: "forecast",
        provider: "open_meteo",
        date,
        hour: 12,
        timezone: "Asia/Kuala_Lumpur",
        fetchedAt: new Date().toISOString(),
        stale: false,
        bounds: [100.25, 5.35, 100.42, 5.48],
        samples: [],
        contours: {
          type: "FeatureCollection",
          features: [
            { type: "Feature", properties: { level: "light", thresholdMm: 0.1 }, geometry: { type: "MultiPolygon", coordinates: [[[[100.25, 5.35], [100.42, 5.35], [100.42, 5.48], [100.25, 5.48], [100.25, 5.35]]]] } },
            { type: "Feature", properties: { level: "moderate", thresholdMm: 2.5 }, geometry: { type: "MultiPolygon", coordinates: [[[[100.29, 5.38], [100.38, 5.38], [100.38, 5.45], [100.29, 5.45], [100.29, 5.38]]]] } },
          ],
        },
        rainBoundary: {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: { kind: "rain_boundary" }, geometry: { type: "LineString", coordinates: [[100.28, 5.36], [100.37, 5.39], [100.4, 5.45]] } }],
        },
        dominantCenter: [100.33, 5.42],
        },
      }),
    });
  });
  await page.route("**/api/weather/radar?*", async (route) => {
    radarMetadataRequests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        availability: "radar",
        provider: "rainviewer",
        observedAt: new Date().toISOString(),
        fetchedAt: new Date().toISOString(),
        stale: false,
        tileUrlTemplate: "https://tilecache.rainviewer.com/v2/radar/ae786c325270/256/{z}/{x}/{y}/2/1_0.png",
        maxZoom: 7,
        attributionLabel: "RainViewer",
        attributionUrl: "https://www.rainviewer.com/",
      } }),
    });
  });
  await page.route("https://tilecache.rainviewer.com/**", async (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+Xw3gAAAAAElFTkSuQmCC", "base64"),
  }));
  await page.route("**/api/route", async (route) => {
    const request = route.request().postDataJSON() as { mode?: string; points?: Array<[number, number]> };
    const points = request.points ?? [];
    const start = points[0];
    const end = points.at(-1);
    const interpolate = (from: [number, number], to: [number, number], ratio: number): [number, number] => [
      from[0] + ((to[0] - from[0]) * ratio),
      from[1] + ((to[1] - from[1]) * ratio),
    ];
    const routeGeometry = start && end ? [start, interpolate(start, end, 0.25), interpolate(start, end, 0.5), interpolate(start, end, 0.75), end] : points;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { routes: [{
        geometry: routeGeometry,
        durationMin: 12,
        distanceKm: 4.2,
        hasTolls: false,
        ...(request.mode === "DRIVING" && start && end ? {
          traffic: {
            provider: "mapbox",
            basis: "live",
            retrievedAt: new Date().toISOString(),
            segments: [
              { level: "normal", geometry: routeGeometry.slice(0, 2) },
              { level: "slow", geometry: routeGeometry.slice(1, 3) },
              { level: "congested", geometry: routeGeometry.slice(2, 4) },
              { level: "severe", geometry: routeGeometry.slice(3, 5) },
            ],
          },
        } : {}),
      }] } }),
    });
  });

  await page.goto(`/customer/trip/${trip.id}`);
  const activity = page.locator("[data-activity-card]").filter({ has: page.locator("img") }).first();
  await activity.waitFor({ state: "visible", timeout: 10_000 }).catch(async () => page.reload());
  await expect(activity).toBeVisible({ timeout: 15_000 });
  const activityId = await activity.getAttribute("data-activity-card");
  expect(activityId).toBeTruthy();

  const day = page.locator(`[data-trip-day="${date}"]`);
  await activity.dragTo(day);
  await expect(day.locator(`[data-itinerary-image="${activityId}"]`)).toBeVisible();
  await expect(page.locator(`[data-map-pin-image="${activityId}"]`)).toBeVisible();
  await expect.poll(async () => {
    const box = await page.locator('[aria-label="互动地图"]').boundingBox();
    return box?.width ?? 0;
  }).toBeGreaterThan(300);
  await expect(page.locator("[data-weather-overlay-ready]")).toHaveAttribute("data-weather-overlay-ready", "true");
  await expect(page.getByText("实时降雨雷达", { exact: true })).toBeVisible();
  await expect(page.getByText("雷达数据由 RainViewer 提供", { exact: true })).toBeVisible();
  expect(radarMetadataRequests).toBe(1);
  expect(forecastOverlayRequests).toBe(0);

  await page.getByRole("button", { name: "天气预报", exact: true }).click();
  await expect(page.getByText("预报时间", { exact: true })).toBeVisible();
  await expect(page.locator('[data-weather-band="light"]')).toBeVisible();
  expect(forecastOverlayRequests).toBe(1);
  await expect(page.locator("[data-route-traffic-status]")).toBeVisible();
  await expect(page.getByText("实时路况", { exact: true })).toBeVisible();
  await expect(page.getByText("缓行", { exact: true })).toBeVisible();
  await expect(page.getByText("拥堵", { exact: true })).toBeVisible();
  await expect(page.getByText(/虚线内有雨|虚线外无雨/)).toHaveCount(0);

  await page.getByRole("button", { name: "现在", exact: true }).click();
  await expect(page.getByText("实时降雨雷达", { exact: true })).toBeVisible();
  await expect.poll(() => radarMetadataRequests).toBe(2);

  const mapRegion = page.locator('[aria-label="互动地图"]');
  const initialWidth = (await mapRegion.boundingBox())?.width ?? 0;

  await page.getByRole("button", { name: "最小化行程面板" }).click();
  await expect.poll(async () => (await mapRegion.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialWidth + 250);

  const leftCollapsedWidth = (await mapRegion.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "最小化添加地点面板" }).click();
  await expect.poll(async () => (await mapRegion.boundingBox())?.width ?? 0)
    .toBeGreaterThan(leftCollapsedWidth + 250);

  const regionBox = await mapRegion.boundingBox();
  const canvasBox = await page.locator(".maplibregl-map").boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThanOrEqual((regionBox?.width ?? 0) - 1);
  expect(canvasBox?.height ?? 0).toBeGreaterThan(600);

  await page.getByRole("button", { name: "展开行程面板" }).click();
  await page.getByRole("button", { name: "展开添加地点面板" }).click();
  await expect.poll(async () => Math.round((await mapRegion.boundingBox())?.width ?? 0))
    .toBe(Math.round(initialWidth));

  await page.getByRole("button", { name: "最小化行程面板" }).click();
  await page.getByRole("button", { name: "最小化添加地点面板" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(day).toBeVisible();
  await expect(page.getByRole("button", { name: "展开行程面板" })).toBeHidden();
  await expect(page.getByRole("button", { name: "展开添加地点面板" })).toBeHidden();
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.getByRole("button", { name: "路线天气" })).toBeVisible();
});

test("journey canvas aligns daily risk time and paginates fixed-height side panels", async ({ page }) => {
  const customer = await signInCustomer(page);
  await page.request.post("/api/locale", { data: { locale: "zh-CN" } });

  const startDate = addCalendarDays(malaysiaTodayIsoDate(), 1);
  const endDate = addCalendarDays(startDate, 5);
  const trip = {
    id: "journey-canvas-paging-e2e",
    user_id: customer.id,
    name: "Penang Timed Weather Journey",
    start_date: startDate,
    end_date: endDate,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const scheduledOrigin = {
    id: "journey-paging-origin",
    trip_id: trip.id,
    experience_id: null,
    sequence: 0,
    scheduled_date: startDate,
    scheduled_time: "10:00",
    created_at: new Date().toISOString(),
    source: "location",
    kind: "custom",
    lat: 5.4141,
    lng: 100.3288,
    label: "George Town",
  };

  await page.context().addCookies([
    { name: "MOCK_TRIPS", value: encodeURIComponent(JSON.stringify([trip])), domain: "localhost", path: "/" },
    { name: "MOCK_TRIP_ITEMS", value: encodeURIComponent(JSON.stringify([scheduledOrigin])), domain: "localhost", path: "/" },
  ]);

  await page.route("https://tiles.openfreemap.org/styles/liberty", async (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#dbeafe" } }] }),
  }));

  await page.route("**/api/weather/forecast", async (route) => {
    const request = route.request().postDataJSON() as { targets?: Array<Record<string, unknown>> };
    const results = Object.fromEntries((request.targets ?? []).map((target) => [String(target.key), {
      target,
      forecast: {
        availability: "forecast",
        provider: "open_meteo",
        latitude: target.latitude,
        longitude: target.longitude,
        timezone: "Asia/Kuala_Lumpur",
        date: target.date,
        fetchedAt: new Date().toISOString(),
        stale: false,
        hours: [],
        evidence: {
          weatherCode: 95,
          temperatureMaxC: 31,
          temperatureMinC: 24.9,
          apparentTemperatureMaxC: 36,
          precipitationProbabilityMax: 71,
          precipitationSumMm: 4.3,
          windGustMaxKmh: 35,
          uvIndexMax: 7,
        },
      },
      risk: {
        level: "high",
        reasons: ["thunderstorm"],
        ruleVersion: "2026-09-v1",
        window: { startHour: 15, endHour: 17 },
      },
    }]));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { results } }),
    });
  });

  const requestedOverlayHours: number[] = [];
  await page.route("**/api/weather/overlay", async (route) => {
    const request = route.request().postDataJSON() as { hour: number };
    requestedOverlayHours.push(request.hour);
    const raining = request.hour === 15;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        availability: "forecast",
        provider: "open_meteo",
        date: startDate,
        hour: request.hour,
        timezone: "Asia/Kuala_Lumpur",
        fetchedAt: new Date().toISOString(),
        stale: false,
        bounds: raining ? [100.25, 5.35, 100.42, 5.48] : null,
        samples: [],
        contours: {
          type: "FeatureCollection",
          features: raining ? [{
            type: "Feature",
            properties: { level: "light", thresholdMm: 0.1 },
            geometry: { type: "MultiPolygon", coordinates: [[[[100.25, 5.35], [100.42, 5.35], [100.42, 5.48], [100.25, 5.48], [100.25, 5.35]]]] },
          }] : [],
        },
        rainBoundary: { type: "FeatureCollection", features: [] },
        dominantCenter: raining ? [100.33, 5.42] : null,
      } }),
    });
  });

  await page.goto(`/customer/trip/${trip.id}`);

  const itineraryPanel = page.locator('aside[aria-label="旅程行程表"]');
  const mapPanel = page.locator('[aria-label="旅程地图"]');
  const placesPanel = page.locator('aside[aria-label="可添加的地点"]');
  await expect(itineraryPanel.locator('[data-trip-day]:not([data-trip-day="unscheduled"])')).toHaveCount(5);
  await expect(placesPanel.locator("[data-activity-card]")).toHaveCount(15);
  await expect.poll(async () => Math.round((await mapPanel.boundingBox())?.height ?? 0)).toBe(680);
  await expect.poll(async () => Math.round((await itineraryPanel.boundingBox())?.height ?? 0)).toBe(680);
  await expect.poll(async () => Math.round((await placesPanel.boundingBox())?.height ?? 0)).toBe(680);

  await placesPanel.getByRole("button", { name: "更多筛选" }).click();
  await expect(placesPanel.getByRole("heading", { name: "筛选地点" })).toBeVisible();
  await expect(placesPanel.getByLabel("价格范围", { exact: true })).toBeVisible();
  await expect(placesPanel.getByLabel("评分", { exact: true })).toBeVisible();
  await expect(placesPanel.getByLabel("排序方式", { exact: true })).toBeVisible();
  await expect(placesPanel.getByRole("switch", { name: "现在营业" })).toBeVisible();
  await expect(placesPanel.getByRole("button", { name: "1 km" })).toBeEnabled();
  await placesPanel.getByRole("button", { name: "完成" }).last().click();
  await expect(placesPanel.locator("[data-activity-card]")).toHaveCount(15);

  await expect(mapPanel.getByText("10:00 暂无达到显示门槛的降雨。", { exact: true })).toBeVisible();
  const riskSummary = itineraryPanel.getByLabel(/在地图查看风险时段/);
  await expect(riskSummary).toContainText("15:00–17:00");
  await riskSummary.click();
  await expect(mapPanel.getByText("15:00", { exact: true })).toBeVisible();
  await expect.poll(() => requestedOverlayHours.at(-1)).toBe(15);

  await itineraryPanel.getByRole("button", { name: "下一页天" }).click();
  await expect(itineraryPanel.locator('[data-trip-day]:not([data-trip-day="unscheduled"])')).toHaveCount(1);
  await placesPanel.getByRole("button", { name: "下一页地点" }).press("Enter");
  await expect(placesPanel.getByText("第 2 /", { exact: false })).toBeVisible();

  const query = await placesPanel.locator("[data-activity-card] h3").first().textContent();
  expect(query).toBeTruthy();
  await placesPanel.getByPlaceholder("搜索本地体验").fill(query ?? "");
  await expect(placesPanel.locator("[data-activity-card]")).toHaveCount(1);
  await expect(placesPanel.getByText("第 2 /", { exact: false })).toHaveCount(0);
});
