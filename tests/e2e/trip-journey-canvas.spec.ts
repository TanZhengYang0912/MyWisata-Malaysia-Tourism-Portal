import { expect, test, type Page } from "@playwright/test";
import {randomUUID} from "node:crypto";
import sharp from "sharp";
import {installTripFixtureCleanup,createTestCustomer,signInTestCustomer,rest} from "./helpers/trip-fixture";

test.setTimeout(120_000);
test.describe.configure({ retries: 0 });
installTripFixtureCleanup();

async function signInCustomer(page: Page) {
  const tripId=randomUUID();
  const customer=await createTestCustomer(tripId,page.request);
  await signInTestCustomer(page,customer);
  return {...customer,tripId};
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
    id: customer.tripId,
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

  await rest(page.request,'POST','trips',trip);
  await rest(page.request,'POST','trip_items',origin);

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
  const radarEchoTile = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 206, g: 192, b: 135, alpha: 1 } } }).png().toBuffer();
  const radarCoverageTile = await sharp({ create: { width: 256, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
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
        conditionContours:{type:"FeatureCollection",features:[]},
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
    const latestFrameTime = new Date().toISOString();
    const earlierFrameTime = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: {
        availability: "radar",
        provider: "rainviewer",
        frameTime: latestFrameTime,
        fetchedAt: new Date().toISOString(),
        stale: false,
        frames: [earlierFrameTime, latestFrameTime].map((frameTime) => ({
          frameTime,
          tileUrlTemplate: "https://tilecache.rainviewer.com/v2/radar/ae786c325270/256/{z}/{x}/{y}/2/1_0.png",
          intensityTileUrlTemplate: "https://tilecache.rainviewer.com/v2/radar/ae786c325270/256/{z}/{x}/{y}/2/1_0.png",
          coverageTileUrlTemplate: "https://tilecache.rainviewer.com/v2/coverage/0/256/{z}/{x}/{y}/0/0_0.png",
        })),
        maxZoom: 7,
        attributionLabel: "RainViewer",
        attributionUrl: "https://www.rainviewer.com/",
      } }),
    });
  });
  await page.route("https://tilecache.rainviewer.com/**", async (route) => route.fulfill({
    status: 200,
    contentType: "image/png",
    body: route.request().url().includes("/coverage/") ? radarCoverageTile : radarEchoTile,
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
    const routeGeometry = start && end ? [start, interpolate(start, end, 0.2), interpolate(start, end, 0.4), interpolate(start, end, 0.6), interpolate(start, end, 0.8), end] : points;
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
              { level: "unknown", geometry: routeGeometry.slice(4, 6) },
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
  await expect(day.locator("[data-itinerary-image]")).toBeVisible({timeout:30_000});
  const storedItemId=await day.locator("[data-itinerary-image]").getAttribute("data-itinerary-image");
  await expect(page.locator(`[data-map-pin-image="${storedItemId}"]`)).toBeVisible();
  await expect.poll(async () => {
    const box = await page.locator('[aria-label="互动地图"]').boundingBox();
    return box?.width ?? 0;
  }).toBeGreaterThan(300);
  await expect(page.locator("[data-weather-overlay-ready]")).toHaveAttribute("data-weather-overlay-ready", "true");
  await page.locator('button[aria-expanded="false"]').filter({hasText:"路线天气"}).click();
  await expect(page.getByRole("button", { name: "天气预报", exact: true })).toBeVisible();
  await expect(page.getByText("天气数据由 Open-Meteo 提供", { exact: true })).toBeVisible();
  expect(forecastOverlayRequests).toBe(0);
  expect(radarMetadataRequests).toBe(0);

  await page.getByRole("button", { name: "天气预报", exact: true }).click();
  await expect(page.getByText("预报时间", { exact: true })).toBeVisible();
  await expect(page.locator('[data-weather-band="light"]')).toBeVisible();
  expect(forecastOverlayRequests).toBe(1);
  await expect(page.locator("[data-route-traffic-status]")).toBeVisible();
  await expect(page.locator("[data-route-traffic-legend]")).toBeVisible();
  const trafficSwatchColors = await page.locator("[data-route-traffic-legend] > span").evaluateAll((items) => items.map((item) => {
    const swatch = item.querySelector<HTMLElement>("[aria-hidden='true']");
    return swatch ? getComputedStyle(swatch).backgroundColor : "missing";
  }));
  expect(trafficSwatchColors).toEqual([
    "rgb(37, 99, 235)",
    "rgb(250, 204, 21)",
    "rgb(239, 68, 68)",
    "rgb(185, 28, 28)",
    "rgb(107, 114, 128)",
  ]);
  await expect(page.getByText("实时路况", { exact: true })).toBeVisible();
  await expect(page.getByText("缓行", { exact: true })).toBeVisible();
  await expect(page.getByText("拥堵", { exact: true })).toBeVisible();
  await expect(page.getByText("无路况数据", { exact: true })).toBeVisible();
  await expect(page.getByText(/虚线内有雨|虚线外无雨/)).toHaveCount(0);
  expect(radarMetadataRequests).toBe(0);
  expect(forecastOverlayRequests).toBe(1);

  const weatherCard = page.locator("[data-weather-status-card]");
  const nearbyRadar = weatherCard.getByRole("button", { name: "查看附近雷达", exact: true });
  await expect(nearbyRadar).toBeVisible();
  await nearbyRadar.click();
  const returnToTrip = weatherCard.getByRole("button", { name: "返回行程地图", exact: true });
  await expect(returnToTrip).toBeVisible();
  await expect(weatherCard.getByText(/缩小地图以查看雷达/)).toHaveCount(0);
  await expect.poll(() => radarMetadataRequests).toBe(1);
  await expect(weatherCard.locator("[data-radar-echo-legend]")).toBeVisible();
  const radarTimeline = weatherCard.getByRole("slider", { name: /历史雷达/ });
  await expect(radarTimeline).toHaveValue("1");
  await radarTimeline.focus();
  await radarTimeline.press("Home");
  await expect(radarTimeline).toHaveValue("0");
  expect(radarMetadataRequests).toBe(1);
  await returnToTrip.click();
  await expect(nearbyRadar).toBeVisible();
  await expect(weatherCard.getByRole("slider", { name: "预报时间" })).toBeVisible();

  const mapRegion = page.locator('[aria-label="互动地图"]');
  const plannerGrid = page.locator('[style*="--planner-ai-width"]');
  async function expectSettledPanels() {
    await expect.poll(() => plannerGrid.evaluate(element => {
      const style = getComputedStyle(element);
      const columns = style.gridTemplateColumns.split(" ");
      return columns[0] === style.getPropertyValue("--planner-ai-width").trim()
        && columns.at(-1) === style.getPropertyValue("--planner-places-width").trim();
    })).toBe(true);
  }
  await page.getByRole("button", { name: "展开 AI 规划栏" }).click();
  await expectSettledPanels();
  const initialWidth = (await mapRegion.boundingBox())?.width ?? 0;

  await page.getByRole("button", { name: "收起 AI 规划栏" }).click();
  await expect.poll(async () => (await mapRegion.boundingBox())?.width ?? 0)
    .toBeGreaterThan(initialWidth + 250);

  await expectSettledPanels();
  const leftCollapsedWidth = (await mapRegion.boundingBox())?.width ?? 0;
  await page.getByRole("button", { name: "最小化添加地点面板" }).click();
  await expect.poll(async () => (await mapRegion.boundingBox())?.width ?? 0)
    .toBeGreaterThan(leftCollapsedWidth + 250);

  const regionBox = await mapRegion.boundingBox();
  const canvasBox = await page.locator(".maplibregl-map").boundingBox();
  expect(canvasBox?.width ?? 0).toBeGreaterThanOrEqual((regionBox?.width ?? 0) - 1);
  expect(canvasBox?.height ?? 0).toBeGreaterThan(600);

  await page.getByRole("button", { name: "展开 AI 规划栏" }).click();
  await page.getByRole("button", { name: "展开添加地点面板" }).click();
  await expect.poll(async () => Math.round((await mapRegion.boundingBox())?.width ?? 0))
    .toBe(Math.round(initialWidth));

  await page.getByRole("button", { name: "收起 AI 规划栏" }).click();
  await page.getByRole("button", { name: "最小化添加地点面板" }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(day).toBeVisible();
  await expect(page.getByRole("button", { name: "展开 AI 规划栏" })).toBeHidden();
  await expect(page.getByRole("button", { name: "展开添加地点面板" })).toBeHidden();
  await page.getByRole("button", { name: "地图", exact: true }).click();
  await expect(page.getByRole("button", { name: "路线天气",exact:true }).first()).toBeVisible();
});

test("journey canvas aligns daily risk time and paginates fixed-height side panels", async ({ page }) => {
  const customer = await signInCustomer(page);
  await page.request.post("/api/locale", { data: { locale: "zh-CN" } });

  const startDate = addCalendarDays(malaysiaTodayIsoDate(), 1);
  const endDate = addCalendarDays(startDate, 5);
  const trip = {
    id: customer.tripId,
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

  await rest(page.request,'POST','trips',trip);
  await rest(page.request,'POST','trip_items',scheduledOrigin);

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
        conditionContours:{type:"FeatureCollection",features:[]},
        rainBoundary: { type: "FeatureCollection", features: [] },
        dominantCenter: raining ? [100.33, 5.42] : null,
      } }),
    });
  });

  await page.goto(`/customer/trip/${trip.id}`);

  const itineraryPanel = page.getByRole("main",{name:"旅程行程表",exact:true});
  const mapPanel = page.getByRole("region",{name:"地图",exact:true});
  const placesPanel = page.locator('aside[aria-label="可添加的地点"]');
  await expect(itineraryPanel.locator('[data-trip-day]:not([data-trip-day="unscheduled"])')).toHaveCount(1);
  await expect(page.locator("#planner-selected-day option")).toHaveCount(6);
  await expect(placesPanel.locator("[data-activity-card]")).toHaveCount(15);
  for (const panel of [mapPanel,itineraryPanel,placesPanel]) {
    await expect.poll(async()=>(await panel.boundingBox())?.height ?? 0).toBeGreaterThan(400);
    expect((await panel.boundingBox())!.y+(await panel.boundingBox())!.height).toBeLessThanOrEqual(page.viewportSize()!.height+1);
  }

  await placesPanel.getByRole("button", { name: "更多筛选" }).click();
  await expect(placesPanel.getByRole("heading", { name: "筛选地点" })).toBeVisible();
  await expect(placesPanel.getByLabel("价格范围", { exact: true })).toBeVisible();
  await expect(placesPanel.getByLabel("评分", { exact: true })).toBeVisible();
  await expect(placesPanel.getByLabel("排序方式", { exact: true })).toBeVisible();
  await expect(placesPanel.getByRole("switch", { name: "现在营业" })).toBeVisible();
  await expect(placesPanel.getByRole("button", { name: "1 km" })).toBeEnabled();
  await placesPanel.getByRole("button", { name: "完成" }).last().click();
  await expect(placesPanel.locator("[data-activity-card]")).toHaveCount(15);

  await mapPanel.locator('button[aria-expanded="false"]').filter({hasText:"路线天气"}).click();
  await expect(mapPanel.getByText("10:00 暂无达到显示门槛的降雨。", { exact: true })).toBeVisible();
  const riskSummary = itineraryPanel.getByLabel(/在地图查看风险时段/);
  await expect(riskSummary).toContainText("15:00–17:00");
  await riskSummary.click();
  await expect(mapPanel.getByText("15:00", { exact: true })).toBeVisible();
  await expect.poll(() => requestedOverlayHours.at(-1)).toBe(15);

  await page.locator("#planner-selected-day").selectOption(endDate);
  await expect(itineraryPanel.locator('[data-trip-day]:not([data-trip-day="unscheduled"])')).toHaveCount(1);
  await placesPanel.getByRole("button", { name: "下一页地点" }).press("Enter");
  await expect(placesPanel.getByText("第 2 /", { exact: false })).toBeVisible();

  const query = await placesPanel.locator("[data-activity-card] h3").first().textContent();
  expect(query).toBeTruthy();
  await placesPanel.getByPlaceholder("搜索本地体验").fill(query ?? "");
  await expect(placesPanel.locator("[data-activity-card]")).toHaveCount(1);
  await expect(placesPanel.getByText("第 2 /", { exact: false })).toHaveCount(0);
});
