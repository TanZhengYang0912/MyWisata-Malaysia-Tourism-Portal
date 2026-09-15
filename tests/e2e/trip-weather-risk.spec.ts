import { expect, test, type Page } from "@playwright/test";

const DEMO_PASSWORD = "demo123456";

test.setTimeout(60_000);

async function signInCustomer(page: Page) {
  const accountsResponse = await page.request.get("/api/auth/demo-users");
  expect(accountsResponse.status(), "Demo account list is unavailable").toBe(200);
  const accounts = await accountsResponse.json() as Array<{ id: string; email: string; role: string }>;
  const customer = accounts.find((account) => account.role === "customer");
  if (!customer) throw new Error("No seeded customer demo account is available");

  const probe = await page.request.post("/api/auth/demo-signin", { data: { email: customer.email } });
  expect(probe.status(), `Demo sign-in probe failed for ${customer.email}`).toBe(200);

  await page.goto("/login");
  const form = page.locator("form").filter({ has: page.locator('input[type="email"]') }).first();
  await form.locator('input[type="email"]').fill(customer.email);
  await form.locator('input[type="password"]').fill(DEMO_PASSWORD);
  await form.getByRole("button", { name: /^(sign in|登录|log masuk)$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 15_000 });
  return customer;
}

async function switchLanguage(page: Page, locale: "en" | "ms" | "zh-CN") {
  const response = await page.request.post("/api/locale", { data: { locale } });
  expect(response.status(), `Locale update to ${locale} failed`).toBe(200);
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", locale);
}

function tomorrowIsoDate() {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

test("a scheduled trip day shows expandable forecast risk evidence and attribution", async ({ page }) => {
  const customer = await signInCustomer(page);
  await switchLanguage(page, "en");

  const date = tomorrowIsoDate();
  const trip = {
    id: "weather-e2e-trip",
    user_id: customer.id,
    name: "Weather acceptance trip",
    start_date: date,
    end_date: date,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  const item = {
    id: "weather-e2e-item",
    trip_id: trip.id,
    experience_id: null,
    sequence: 0,
    scheduled_date: date,
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
    { name: "MOCK_TRIP_ITEMS", value: encodeURIComponent(JSON.stringify([item])), domain: "localhost", path: "/" },
  ]);

  let weatherRequest: { tripId?: string; targets?: Array<{ key: string; date: string; itemId: string }> } | null = null;
  await page.route("**/api/weather/forecast", async (route) => {
    weatherRequest = route.request().postDataJSON();
    const targets = weatherRequest?.targets ?? [];
    const results = Object.fromEntries(targets.map((target) => [target.key, {
      target: { ...target, latitude: item.lat, longitude: item.lng, label: item.label, kind: "day" },
      forecast: {
        availability: "forecast",
        provider: "open_meteo",
        latitude: item.lat,
        longitude: item.lng,
        timezone: "Asia/Kuala_Lumpur",
        date,
        fetchedAt: new Date().toISOString(),
        stale: false,
        evidence: {
          weatherCode: 95,
          temperatureMaxC: 31,
          temperatureMinC: 25,
          apparentTemperatureMaxC: 36,
          precipitationProbabilityMax: 88,
          precipitationSumMm: 14.4,
          windGustMaxKmh: 43.2,
          uvIndexMax: 8.4,
        },
      },
      risk: {
        level: "high",
        reasons: ["thunderstorm", "heavy_rain", "strong_wind", "extreme_uv"],
        ruleVersion: "2026-09-v1",
      },
    }]));

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: { results } }),
    });
  });

  await page.goto(`/customer/trip/${trip.id}`);

  const weatherSummary = page.locator("summary").filter({ hasText: "Thunderstorm risk" });
  await expect(weatherSummary).toBeVisible({ timeout: 15_000 });
  expect(weatherRequest).toMatchObject({
    tripId: trip.id,
    targets: [{ date, itemId: item.id }],
  });

  await weatherSummary.click();
  await expect(page.getByText("Based on forecast", { exact: true })).toBeVisible();
  await expect(page.getByText("Forecast near George Town", { exact: true })).toBeVisible();
  await expect(page.getByText("Rain 88% · 14.4 mm", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Weather data by Open-Meteo" }).first()).toHaveAttribute("href", "https://open-meteo.com/");
  await expect(page.getByText(/official warning/i)).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await switchLanguage(page, "zh-CN");
  const chineseSummary = page.locator("summary").filter({ hasText: "雷雨风险" });
  await expect(chineseSummary).toBeVisible();
  await chineseSummary.click();
  await expect(page.getByRole("link", { name: "天气数据由 Open-Meteo 提供" }).first()).toBeVisible();

  await switchLanguage(page, "ms");
  const malaySummary = page.locator("summary").filter({ hasText: "Risiko ribut petir" });
  await expect(malaySummary).toBeVisible();
  await malaySummary.click();
  await expect(page.getByRole("link", { name: "Data cuaca oleh Open-Meteo" }).first()).toBeVisible();
});
