import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect, test, type BrowserContext, type Page, type Route } from "@playwright/test";
import { localEnv } from "./helpers/demo";

// Admin sweep: opens every admin page as a signed-in admin and records console
// errors, failed requests, layout problems, raw translation keys and broken
// controls, then runs a few create/toggle flows on E2E-prefixed rows.
//
// Manual: a human signs in (CAPTCHA + staff 2FA) in the headed browser, then
// the sweep takes over. Run:
//   ADMIN_SWEEP=1 npx playwright test tests/e2e/admin-sweep.spec.ts --headed --retries=0
// The CAPTCHA can refuse a browser Playwright launched. In that case start Chrome
// yourself with --remote-debugging-port=9222 (and its own --user-data-dir), sign in
// there, and run with ADMIN_SWEEP_CDP=http://127.0.0.1:9222 so the sweep attaches.
// SWEEP_AREA=vendor sweeps /vendor/* instead, signed in as a vendor owner. In that mode every
// non-GET request to /api is stubbed in the browser (nothing can be written) and the stubbed
// attempts are listed as findings; reads stay real, and the vendor GET API is probed for 5xx.
// SWEEP_AREA=customer signs in as the seeded demo customer inside a fresh browser context (or
// continues as a guest with SWEEP_GUEST=1) and sweeps /customer/* plus the public pages. Options:
//   SWEEP_VIEWPORT=mobile (390x844 touch)   SWEEP_LOCALE=ms|zh-CN   SWEEP_DEEP=1 (click every control)
//   SWEEP_WRITES=fail (stubbed writes answer 500, to find actions that fail silently)
//   SWEEP_ONLY=/customer,/customer/cart (just these routes)
// In vendor and customer modes writes to the API, to Supabase REST/storage/auth and to server actions
// are stubbed (see installStubs); only reads reach the database.
// Writes use only E2E-prefixed rows, deleted at the end. Nothing here sends an
// announcement, changes system settings, or touches money, KYC, roles or users.

test.skip(process.env.ADMIN_SWEEP !== "1", "Manual: needs a human admin sign-in. Set ADMIN_SWEEP=1 and run headed.");
// A control that never becomes usable must fail in seconds, not stall the whole run.
test.use({ viewport: { width: 1440, height: 900 }, actionTimeout: 15_000 });
test.setTimeout(2_700_000);

const BASE = "http://localhost:3000";
const OUT = process.env.ADMIN_SWEEP_OUT ?? "test-results/admin-sweep";
const RUN = Date.now().toString(36);
const ADMIN_ROUTES = [
  "/admin/dashboard", "/admin/access-control", "/admin/affiliate", "/admin/ai-assistant", "/admin/announcements",
  "/admin/catalogue", "/admin/catalogue/hotel-amenities", "/admin/chat-reports", "/admin/chatbot",
  "/admin/event-promotions", "/admin/event-registrations", "/admin/help", "/admin/kyc",
  "/admin/moderation-words", "/admin/notifications", "/admin/orders", "/admin/promotion-campaigns",
  "/admin/recommendations", "/admin/recommendations/rewards", "/admin/refunds", "/admin/reports/payouts",
  "/admin/reports/reconciliation", "/admin/rewards", "/admin/sponsored-placements", "/admin/staff-conduct",
  "/admin/support", "/admin/system-settings", "/admin/users", "/admin/vendors", "/admin/vendors/platform-fees",
  "/admin/wallet/approvers", "/admin/wallet/settings", "/admin/withdrawals",
];
// Not visited: /admin/security and /admin/kyc/mfa (the 2FA screens themselves).
const ADMIN_DETAIL_PATTERNS = [
  /^\/admin\/orders\/[^/]+$/, /^\/admin\/kyc\/[^/]+$/, /^\/admin\/withdrawals\/[^/]+$/, /^\/admin\/event-promotions\/[^/]+$/,
  /^\/admin\/event-registrations\/[^/]+$/, /^\/admin\/recommendations\/[^/]+$/, /^\/admin\/help\/[^/]+$/, /^\/admin\/help\/flows\/[^/]+$/,
];
// Not visited: /vendor/scanner (needs the camera). /vendor/register only shows its form.
const VENDOR_ROUTES = [
  "/vendor/dashboard", "/vendor/analytics", "/vendor/announcements", "/vendor/bookings", "/vendor/event-orders",
  "/vendor/event-promotions", "/vendor/events", "/vendor/inbox", "/vendor/listings", "/vendor/orders", "/vendor/outlets",
  "/vendor/products", "/vendor/profile", "/vendor/redemptions", "/vendor/vouchers", "/vendor/wallet", "/vendor/register",
];
const VENDOR_DETAIL_PATTERNS = [/^\/vendor\/announcements\/[^/]+$/, /^\/vendor\/events\/[^/]+$/];
// Not visited: /customer/checkout/simulator/[sessionId] (needs a live payment session).
const CUSTOMER_ROUTES = [
  "/", "/help", "/reset-password", "/customer", "/customer/explore", "/customer/search", "/customer/events", "/customer/for-you",
  "/customer/map", "/customer/vendors", "/customer/partners", "/customer/recommendations", "/customer/calendar", "/customer/trip",
  "/customer/cart", "/customer/checkout", "/customer/wishlist", "/customer/saved", "/customer/orders", "/customer/orders/access",
  "/customer/vouchers", "/customer/wallet", "/customer/notifications", "/customer/support", "/customer/profile",
  "/customer/preferences", "/customer/profile/register-vendor", "/customer/affiliate", "/customer/affiliate/earnings",
  "/customer/activity", "/customer/kyc", "/customer/phone", "/customer/verification",
];
const AREA: "admin" | "vendor" | "customer" = process.env.SWEEP_AREA === "vendor" ? "vendor" : process.env.SWEEP_AREA === "customer" ? "customer" : "admin";
const only = (process.env.SWEEP_ONLY ?? "").split(",").map((route) => route.trim()).filter(Boolean);
const ALL_ROUTES = AREA === "vendor" ? VENDOR_ROUTES : AREA === "customer" ? CUSTOMER_ROUTES : ADMIN_ROUTES;
const STATIC_ROUTES = only.length ? ALL_ROUTES.filter((route) => only.includes(route)) : ALL_ROUTES;
const DETAIL_PATTERNS = AREA === "vendor" ? VENDOR_DETAIL_PATTERNS : ADMIN_DETAIL_PATTERNS;
const MOBILE = process.env.SWEEP_VIEWPORT === "mobile";
const LOCALE = process.env.SWEEP_LOCALE === "ms" || process.env.SWEEP_LOCALE === "zh-CN" ? process.env.SWEEP_LOCALE : "en";
const GUEST = process.env.SWEEP_GUEST === "1";
const DEEP = process.env.SWEEP_DEEP === "1";
const WRITES_FAIL = process.env.SWEEP_WRITES === "fail";
// Money screens: nothing is opened or clicked there beyond tabs and search.
const NO_OPENERS = ["/vendor/wallet"];
// Never clicked: these would end or switch the signed-in session.
const NEVER_CLICK = /sign ?out|log ?out|logout|switch account|account menu|delete account|deactivate|close account|keluar|退出|登出/i;

type Finding = { page: string; kind: string; detail: string };
const findings: Finding[] = [];
const steps: string[] = [];
let where = "setup";

function save() {
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, "findings.json"), JSON.stringify({ run: RUN, steps, findings }, null, 2));
}

function note(kind: string, detail: string, page = where) {
  const key = `${page}|${kind}|${detail}`;
  if (findings.some((f) => `${f.page}|${f.kind}|${f.detail}` === key)) return;
  findings.push({ page, kind, detail });
  save();
}

const slug = (value: string) => value.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "").slice(0, 80) || "root";
const stripQuery = (url: string) => url.replace(/[?#].*$/, "").replace(/[0-9a-f]{8}-[0-9a-f-]{27,}/gi, ":id");

/** GET routes under app/api/vendors/[vendorId] that take no other id, minus anything that could start a payment, link or export. */
function vendorGetRoutes(): string[] {
  const root = join(process.cwd(), "app/api/vendors/[vendorId]");
  const found: string[] = [];
  const walk = (dir: string, rel: string) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (!name.startsWith("[") && !/stripe|connect|onboard|payout|withdraw|oauth|checkout|download|export|redirect/i.test(name)) walk(full, `${rel}/${name}`);
      } else if (name === "route.ts" && /export\s+async\s+function\s+GET/.test(readFileSync(full, "utf8"))) found.push(rel);
    }
  };
  walk(root, "");
  return found;
}

function listen(page: Page) {
  page.on("console", (message) => {
    if (message.type() !== "error") return;
    const text = message.text();
    // "Failed to load resource" repeats the failed response recorded below.
    if (/favicon|React DevTools|Failed to load resource|\[Fast Refresh\]/i.test(text)) return;
    note(/hydrat/i.test(text) ? "hydration-error" : "console-error", text.slice(0, 300));
  });
  page.on("pageerror", (error) => note("page-error", String(error.message).slice(0, 300)));
  page.on("requestfailed", (request) => {
    const failure = request.failure()?.errorText ?? "";
    if (/ERR_ABORTED|NS_BINDING_ABORTED/.test(failure)) return;
    note("request-failed", `${request.method()} ${stripQuery(request.url())} ${failure}`);
  });
  page.on("response", (response) => {
    const url = new URL(response.url());
    if (url.origin !== "http://localhost:3000" || response.status() < 400) return;
    if (/favicon|\/_next\/(static|webpack)/.test(url.pathname) && response.status() === 404) return;
    note("http-error", `${response.request().method()} ${stripQuery(url.pathname)} -> ${response.status()}`);
  });
}

/** Waits until spinners and "Loading" text are gone (up to 12 s) and reports a page that never finishes loading. */
async function settle(page: Page) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  // Vendor pages fetch only after the signed-in user has loaded, so the first idle can be the gap
  // between two waves of requests; give the second wave time to start, then wait for it too.
  if (AREA !== "admin") {
    await page.waitForTimeout(3_000);
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => {});
  }
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => {
      const spinner = [...document.querySelectorAll(".animate-spin, [class*='animate-pulse'], [data-slot='skeleton']")].some((el) => (el as HTMLElement).offsetParent !== null);
      return spinner || /^\s*(Loading|Restoring)[^\n]{0,40}…?\s*$/m.test(document.body.innerText);
    });
    if (!busy) return;
    await page.waitForTimeout(500);
  }
  note("stuck-loading", "a spinner or Loading text is still showing after 12 s");
}

async function audit(page: Page) {
  const issues = await page.evaluate((opts: { mobile: boolean; locale: string }) => {
    const out: { kind: string; detail: string }[] = [];
    const vw = document.documentElement.clientWidth;
    const root = document.documentElement;
    if (root.scrollWidth > vw + 1) out.push({ kind: "overflow-x", detail: `page is ${root.scrollWidth}px wide in a ${vw}px viewport` });
    const scrolls = (el: Element) => {
      for (let p = el.parentElement; p; p = p.parentElement) if (/(auto|scroll|hidden|clip)/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    const describe = (el: Element) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""} "${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 40)}"`;
    const wide = [...document.querySelectorAll("body *")].filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && r.right > vw + 2 && getComputedStyle(el).position !== "fixed" && !scrolls(el);
    });
    for (const el of wide.slice(0, 4)) out.push({ kind: "past-viewport", detail: describe(el) });
    const clipped = [...document.querySelectorAll("button, a, th, td, label, h1, h2, h3, [role=tab]")].filter((el) => {
      const s = getComputedStyle(el);
      // Visually hidden labels (sr-only) are clipped on purpose.
      return el.clientWidth > 1 && !el.closest(".sr-only") && el.scrollWidth > el.clientWidth + 2 && /(hidden|clip)/.test(s.overflowX) && s.textOverflow !== "ellipsis";
    });
    for (const el of clipped.slice(0, 4)) out.push({ kind: "clipped-text", detail: describe(el) });
    const text = document.body.innerText;
    const keys = [...new Set(text.match(/\b[a-z][A-Za-z0-9]*(?:\.[a-z][A-Za-z0-9_]*){2,}\b(?!@)/g) ?? [])]
      .filter((key) => !/^(www\.|[a-z]+\.[a-z]+\.(com|my|org|net|io)$)|\.(com|my|org|net|io|ts|tsx|js|json|png|jpg|webp|svg|pdf|csv)$/i.test(key));
    for (const key of keys.slice(0, 5)) out.push({ kind: "raw-i18n-key", detail: key });
    const bad = text.match(/\bNaN\b|\bundefined\b|\[object Object\]|Invalid Date/);
    if (bad) out.push({ kind: "bad-value", detail: `page shows "${bad[0]}"` });
    if (/Application error|Something went wrong|Unhandled Runtime Error|This page could not be found|This page couldn.t load/i.test(text)) {
      out.push({ kind: "error-page", detail: text.trim().slice(0, 120).replace(/\s+/g, " ") });
    }
    // The portal element is always present in dev; only an open dialog inside it is an error.
    if (document.querySelector("nextjs-portal")?.shadowRoot?.querySelector("[data-nextjs-dialog], [data-nextjs-dialog-overlay]")) out.push({ kind: "next-error-overlay", detail: "Next.js error overlay is open" });
    for (const img of [...document.images].filter((i) => i.complete && i.naturalWidth === 0 && i.offsetParent !== null).slice(0, 4)) {
      out.push({ kind: "broken-image", detail: img.currentSrc || img.src });
    }
    const unnamed = [...document.querySelectorAll("button, [role=button]")].filter((b) => {
      const el = b as HTMLElement;
      return el.offsetParent !== null && !(el.textContent ?? "").trim() && !el.getAttribute("aria-label") && !el.getAttribute("aria-labelledby") && !el.title;
    });
    for (const el of unnamed.slice(0, 3)) out.push({ kind: "unnamed-button", detail: `${el.outerHTML.slice(0, 170).replace(/\s+/g, " ")} | in: ${(el.closest("section, header, aside, div[class]")?.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 50)}` });
    const main = document.querySelector("main");
    if (!main || main.innerText.trim().length < 15) out.push({ kind: "empty-page", detail: "main content is empty" });
    const h1 = document.querySelectorAll("h1").length;
    if (h1 !== 1) out.push({ kind: "h1-count", detail: `${h1} h1 elements` });
    const lang = document.documentElement.lang;
    const wantLang = opts.locale === "zh-CN" ? "zh" : opts.locale;
    if (!lang.toLowerCase().startsWith(wantLang)) out.push({ kind: "html-lang", detail: `<html lang="${lang}"> while the app language is ${opts.locale}` });
    if (opts.mobile) {
      // Touch targets under 32 px are hard to hit on a phone.
      const small = [...document.querySelectorAll("button, a[href], [role=button], [role=tab], input:not([type=hidden]), select")].filter((el) => {
        const r = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && style.visibility !== "hidden" && !el.closest(".sr-only") && (r.width < 32 || r.height < 32) && !(el.tagName === "A" && el.closest("p, li, span, td") && el.textContent && el.textContent.trim().split(" ").length < 10 && r.width >= 32);
      });
      for (const el of small.slice(0, 5)) {
        const r = el.getBoundingClientRect();
        out.push({ kind: "small-tap-target", detail: `${Math.round(r.width)}x${Math.round(r.height)} ${describe(el)}` });
      }
    }
    if (opts.locale !== "en") {
      // Interface text (not content written by vendors or customers) still in English.
      const english = /(add|cart|view|your|save|cancel|search|sign|submit|next|back|more|orders?|profile|help|continue|apply|filter|clear|close|open|edit|delete|remove|book|pay|buy|login|register|explore|events|wallet|support|settings|loading|select|choose|upload|download|confirm|reset|forgot|password|email|phone|address)/i;
      const chrome = [...document.querySelectorAll("button, label, th, h1, h2, h3, nav a, [role=tab]")].map((el) => (el.textContent ?? "").trim().replace(/\s+/g, " ")).filter((t) => /^[A-Za-z' ,.!?&-]+$/.test(t) && t.split(" ").length >= 2 && t.length <= 60 && english.test(t));
      for (const t of [...new Set(chrome)].slice(0, 5)) out.push({ kind: "possibly-untranslated", detail: t });
    }
    return out;
  }, { mobile: MOBILE, locale: LOCALE });
  for (const issue of issues) note(issue.kind, issue.detail);
}

async function visit(page: Page, path: string): Promise<boolean> {
  where = path;
  const started = Date.now();
  const response = await page.goto(new URL(path, BASE).toString(), { waitUntil: "domcontentloaded", timeout: 60_000 }).catch((error) => {
    note("navigation-failed", String(error.message).slice(0, 200));
    return null;
  });
  if (!response) return false;
  const final = new URL(page.url()).pathname;
  if (/^\/(login|admin\/security)/.test(final) && !(GUEST || path === "/login" || (AREA === "customer" && !path.startsWith("/customer")))) throw new Error(`Session lost: ${path} redirected to ${final}`);
  if (final !== path) note("redirected", `${path} -> ${final}`);
  if (response.status() >= 400) note("http-error", `page ${path} -> ${response.status()}`);
  await settle(page);
  const seconds = (Date.now() - started) / 1000;
  if (seconds > 10) note("slow-page", `${seconds.toFixed(1)} s to load and settle`);
  await audit(page);
  await page.screenshot({ path: join(OUT, `${slug(path)}.png`), fullPage: true }).catch(() => {});
  return true;
}

/** Clicks tabs, tries search and filter controls, pages forward, opens and cancels safe dialogs. Never submits. */
async function exercise(page: Page, path: string) {
  where = `${path} (interactions)`;
  const base = page.url();
  const step = async (label: string, run: () => Promise<void>) => {
    try {
      await run();
      await page.waitForTimeout(350);
      await audit(page);
    } catch (error) {
      note("interaction-failed", `${label}: ${String((error as Error).message).split("\n")[0].slice(0, 200)}`);
    }
    if (new URL(page.url()).pathname !== new URL(base).pathname) {
      note("unexpected-navigation", `${label} left the page for ${new URL(page.url()).pathname}`);
      await page.goto(base, { waitUntil: "domcontentloaded" });
      await settle(page);
    }
  };

  const tabs = page.getByRole("tab");
  const tabCount = await tabs.count();
  for (let i = 0; i < Math.min(tabCount, 12); i += 1) {
    const tab = tabs.nth(i);
    if (!(await tab.isVisible()) || (await tab.getAttribute("aria-selected")) === "true") continue;
    const name = ((await tab.textContent()) ?? `tab ${i}`).trim().slice(0, 30);
    await step(`tab "${name}"`, async () => { await tab.click({ timeout: 4_000 }); await settle(page); });
  }

  const search = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
  if (await search.isVisible().catch(() => false)) {
    await step("search for a term with no match", async () => { await search.fill("zzzz-no-such-record"); await page.waitForTimeout(900); await settle(page); });
    await step("clear search", async () => { await search.fill(""); await page.waitForTimeout(700); await settle(page); });
  }

  const selects = AREA === "admin" ? page.locator('section[class*="max-w-full"][class*="rounded-xl"] select') : page.locator("select.sweep-none");
  const selectCount = await selects.count();
  for (let i = 0; i < Math.min(selectCount, 4); i += 1) {
    const select = selects.nth(i);
    if (!(await select.isVisible())) continue;
    const options = await select.locator("option").evaluateAll((els) => els.map((el) => (el as HTMLOptionElement).value));
    for (const value of options.slice(1, 4)) await step(`filter ${i + 1} = ${value}`, async () => { await select.selectOption(value); await settle(page); });
    await step(`reset filter ${i + 1}`, async () => { await select.selectOption(options[0]); await settle(page); });
  }

  const next = page.getByRole("button", { name: /^(next|next page|›|»)$/i }).first();
  if (await next.isVisible().catch(() => false) && await next.isEnabled().catch(() => false)) {
    await step("next page", async () => { await next.click(); await settle(page); });
    const prev = page.getByRole("button", { name: /^(previous|prev|previous page|‹|«)$/i }).first();
    if (await prev.isVisible().catch(() => false)) await step("previous page", async () => { await prev.click(); await settle(page); });
  }

  // Dialog openers by name only; anything that submits (type=submit) or is not on this list is left alone.
  const openers = page.locator("main button:not([type=submit]):visible").filter({ hasText: /^(view|details?|preview|filters?|edit|add|new|create)\b/i });
  const openerCount = NO_OPENERS.includes(path) ? 0 : await openers.count();
  for (let i = 0; i < Math.min(openerCount, 3); i += 1) {
    const opener = openers.nth(i);
    const name = ((await opener.textContent()) ?? "").trim().slice(0, 30);
    await step(`open "${name}" then close`, async () => {
      await opener.click({ timeout: 4_000 });
      await page.waitForTimeout(500);
      const dialog = page.getByRole("dialog");
      if (await dialog.count()) {
        await page.keyboard.press("Escape");
        await page.waitForTimeout(400);
        if (await dialog.count()) {
          const close = dialog.getByRole("button", { name: /^(cancel|close)$/i }).first();
          if (await close.count()) await close.click(); else note("dialog-not-closable", `"${name}" dialog ignores Escape and has no Cancel/Close`);
        }
      }
    });
  }
}

async function detailLinks(page: Page): Promise<string[]> {
  if (AREA === "customer") {
    const all = await page.locator('a[href^="/customer/"]').evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""));
    const perKind = new Map<string, string[]>();
    for (const href of new Set(all.map((h) => h.split("?")[0].split("#")[0]))) {
      const parts = href.split("/").filter(Boolean);
      // /customer/<kind>/<id...>: a detail page; the bare kind pages are already in the static list.
      if (parts.length < 3 || STATIC_ROUTES.includes(href)) continue;
      const list = perKind.get(parts[1]) ?? [];
      if (list.length < 2) list.push(href);
      perKind.set(parts[1], list);
    }
    return [...perKind.values()].flat();
  }
  const hrefs = await page.locator(`main a[href^="/${AREA}/"]`).evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""));
  return [...new Set(hrefs.map((h) => h.split("?")[0]).filter((h) => DETAIL_PATTERNS.some((p) => p.test(h))))];
}

let writesSent = 0;
let lastWrite = "";

/**
 * Stubs every write, so only reads reach the database: API writes, server actions, and direct
 * Supabase REST (tables), storage, edge-function and auth calls. Session refresh and RPC calls
 * pass through (RPCs are mostly reads here; they are listed as findings so none go unnoticed).
 */
async function installStubs(context: BrowserContext) {
  const isRead = (method: string) => method === "GET" || method === "HEAD" || method === "OPTIONS";
  const respond = (route: Route, label: string, supabase: boolean) => {
    writesSent += 1;
    lastWrite = label;
    note("stubbed-write", label);
    if (WRITES_FAIL) {
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify(supabase ? { message: "Sweep injected failure", code: "SWEEP" } : { data: null, error: { code: "SWEEP_INJECTED_FAILURE", message: "Sweep injected failure" } }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(supabase ? [] : { data: {}, error: null }) });
  };
  await context.route(/^http:\/\/localhost:3000\//, (route) => {
    const request = route.request();
    if (isRead(request.method())) return route.continue();
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/") || request.headers()["next-action"]) return respond(route, `${request.method()} ${stripQuery(url.pathname)}`, false);
    return route.continue();
  });
  await context.route(/^https:\/\/[a-z0-9]+\.supabase\.co\/(rest\/v1|storage\/v1|functions\/v1|auth\/v1)\//, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (isRead(request.method()) || url.pathname.startsWith("/auth/v1/token")) return route.continue();
    const label = `${request.method()} supabase ${url.pathname.replace(/\/[0-9a-f-]{36}/g, "/:id")}`;
    if (url.pathname.startsWith("/rest/v1/rpc/")) {
      note("unstubbed-rpc", label);
      return route.continue();
    }
    return respond(route, label, true);
  });
}

/** The seeded demo customer (public demo credentials), or a guest, in the given page's fresh context. */
async function loginCustomer(page: Page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(5_000);
  if (GUEST) {
    await page.getByRole("button", { name: /guest mode/i }).click();
    await page.waitForURL((url) => url.pathname.startsWith("/customer"), { timeout: 60_000 });
    return;
  }
  await page.locator('input[type="email"]').fill("customer@demo.local");
  await page.locator('input[type="password"]').fill("demo123456");
  await page.waitForTimeout(8_000);
  await page.locator("form").getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"), { timeout: 90_000 });
  await page.waitForURL((url) => !url.pathname.startsWith("/auth/"), { timeout: 30_000 });
}

/** Toasts and alerts on screen, plus how many error-sounding words the page shows. */
async function feedbackSnapshot(page: Page) {
  return page.evaluate(() => {
    const shown = (el: Element) => (el as HTMLElement).offsetParent !== null || getComputedStyle(el).position === "fixed";
    const alerts = [...document.querySelectorAll("[role=alert], [role=status], [data-sonner-toast], [class*=toast i]")].filter(shown).map((el) => (el.textContent ?? "").trim()).filter(Boolean);
    const words = (document.body.innerText.match(/injected|fail|error|unable|couldn.?t|could not|try again|went wrong|gagal|ralat|tidak dapat|失败|错误|无法/gi) ?? []).length;
    return { alerts, words };
  });
}

/**
 * Clicks every distinct control on the page (never sign-out or account switching) and reports clicks that
 * leave the page, dialogs that will not close, and, with SWEEP_WRITES=fail, actions whose failure shows no message.
 */
async function clickThrough(page: Page, path: string) {
  where = `${path} (click-through)`;
  const base = page.url();
  const selector = "main button:visible, main [role=tab]:visible, main [role=switch]:visible, main [role=checkbox]:visible, main [role=radio]:visible, main summary:visible";
  const seen = new Set<string>();
  const total = Math.min(await page.locator(selector).count(), 70);
  let clicked = 0;
  let failedInARow = 0;
  for (let i = 0; i < total && clicked < 30; i += 1) {
    const control = page.locator(selector).nth(i);
    const label = (((await control.getAttribute("aria-label", { timeout: 1_000 }).catch(() => null)) || (await control.innerText({ timeout: 1_000 }).catch(() => ""))) ?? "").trim().replace(/\s+/g, " ").slice(0, 50);
    const key = `${await control.evaluate((el) => el.tagName).catch(() => "?")}|${label}`;
    if (!label || NEVER_CLICK.test(label) || seen.has(key)) continue;
    seen.add(key);
    // The header's sign-out button is labelled with the user's name and shows only a door icon.
    const endsSession = await control.evaluate((el) => Boolean(el.querySelector("svg[class*='log-out'], svg[class*='power']")) || /sign.?out|log.?out|account menu/i.test(el.getAttribute("aria-label") ?? "")).catch(() => false);
    if (endsSession) continue;
    const writesBefore = writesSent;
    // An earlier click can leave a menu or panel open over the page; Escape closes those.
    await page.keyboard.press("Escape").catch(() => {});
    const before = await feedbackSnapshot(page);
    try {
      await control.click({ timeout: 3_000 });
      failedInARow = 0;
    } catch (error) {
      await page.keyboard.press("Escape").catch(() => {});
      const retried = await control.click({ timeout: 3_000 }).then(() => true, () => false);
      if (!retried) {
        note("click-failed", `"${label}": ${String((error as Error).message).split("\n")[0].slice(0, 120)}`);
        failedInARow += 1;
        // Two failures in a row mean something is covering the page: start again from a clean copy of it.
        if (failedInARow >= 2) {
          await page.goto(base, { waitUntil: "domcontentloaded" }).catch(() => {});
          await settle(page);
          failedInARow = 0;
        }
        continue;
      }
      failedInARow = 0;
    }
    clicked += 1;
    await page.waitForTimeout(900);
    if (!page.url().startsWith(BASE) || new URL(page.url()).pathname !== new URL(base).pathname) {
      note("click-navigated", `"${label}" went to ${page.url().startsWith(BASE) ? new URL(page.url()).pathname : "another site"}`);
      await page.goto(base, { waitUntil: "domcontentloaded" }).catch(() => {});
      await settle(page);
      continue;
    }
    if (WRITES_FAIL && writesSent > writesBefore) {
      const after = await feedbackSnapshot(page);
      const newAlert = after.alerts.some((text) => !before.alerts.includes(text));
      if (!newAlert && after.words <= before.words) note("silent-write-failure", `"${label}" sent ${lastWrite} and the failure showed no message`);
    }
    const dialog = page.getByRole("dialog");
    if (await dialog.count()) {
      await page.keyboard.press("Escape");
      await page.waitForTimeout(400);
      if (await dialog.count()) {
        const close = dialog.getByRole("button", { name: /^(cancel|close|batal|tutup|取消|关闭)$/i }).first();
        if (await close.count()) await close.click().catch(() => {});
        else note("dialog-not-closable", `the dialog opened by "${label}" ignores Escape and has no Cancel/Close`);
        await page.waitForTimeout(300);
        if (await dialog.count()) await page.goto(base, { waitUntil: "domcontentloaded" }).catch(() => {});
      }
    }
    await audit(page);
  }
  steps.push(`clicked ${clicked} controls on ${path}`);
}

/** A customer's way through the site: search, open a result, add it, look at the cart and checkout. */
async function customerJourney(page: Page) {
  where = "journey: search, product, cart, checkout";
  const log = (text: string) => steps.push(`journey: ${text}`);
  await page.goto(`${BASE}/customer/search`, { waitUntil: "domcontentloaded" });
  await settle(page);
  const box = page.locator('input[type="search"], input[placeholder*="earch" i]').first();
  if (!(await box.isVisible().catch(() => false))) {
    note("journey-step-failed", "no search box on /customer/search");
  } else {
    await box.fill("food");
    await box.press("Enter");
    await settle(page);
    const links = page.locator('a[href*="/customer/products/"], a[href*="/customer/outlets/"], a[href*="/customer/outlet/"], a[href*="/customer/place/"]');
    const count = await links.count();
    log(`search "food" shows ${count} result links`);
    if (count === 0) note("journey-step-failed", 'searching "food" shows no results');
    else {
      await links.first().click();
      await settle(page);
      await audit(page);
      log(`opened ${new URL(page.url()).pathname}`);
      const add = page.getByRole("button", { name: /add to (cart|basket|trip|itinerary)|book now|reserve|tambah ke|加入/i }).first();
      if (await add.isVisible().catch(() => false)) {
        const before = await feedbackSnapshot(page);
        await add.click().catch((error) => note("journey-step-failed", `add to cart: ${String(error.message).split("\n")[0].slice(0, 100)}`));
        await page.waitForTimeout(1_200);
        const after = await feedbackSnapshot(page);
        const feedback = after.alerts.some((text) => !before.alerts.includes(text));
        log(`add to cart clicked; feedback shown: ${feedback}`);
        if (!feedback) note("journey-no-feedback", "adding an item from its page showed no confirmation or error message");
      } else {
        note("journey-step-failed", `no add-to-cart or book button on ${new URL(page.url()).pathname}`);
      }
    }
  }
  for (const route of ["/customer/cart", "/customer/checkout"]) {
    await visit(page, route);
    log(`${route} loaded`);
  }
}

async function waitForHumanLogin(page: Page) {
  // Leave a page the human already has open (possibly mid-sign-in) alone.
  // An error page or about:blank goes to the dashboard: a valid session lands there, otherwise the app redirects to /login.
  if (!page.url().startsWith(BASE)) await page.goto(new URL(`/${AREA}/dashboard`, BASE).toString()).catch(() => {});
  console.log("ADMIN_SWEEP_WAITING_FOR_HUMAN: sign in as an admin in the open browser window (CAPTCHA + 2FA). The sweep continues by itself.");
  const deadline = Date.now() + Number(process.env.ADMIN_SWEEP_LOGIN_WAIT_MIN ?? 15) * 60_000;
  let lastJump = 0;
  while (Date.now() < deadline) {
    const path = new URL(page.url()).pathname;
    if (path.startsWith(`/${AREA}`) && !/^\/admin\/(security|kyc\/mfa)/.test(path)) return;
    if (!/^\/(login|admin|vendor|auth)/.test(path) && Date.now() - lastJump > 20_000) {
      lastJump = Date.now();
      await page.goto(new URL(`/${AREA}/dashboard`, BASE).toString()).catch(() => {});
    }
    await page.waitForTimeout(1_500);
  }
  throw new Error("Timed out waiting for the admin sign-in");
}

test("admin sweep", async ({ page: launchedPage }) => {
  let page = launchedPage;
  let customerContext: BrowserContext | null = null;
  const phone = { width: 390, height: 844 };
  if (process.env.ADMIN_SWEEP_CDP) {
    const browser = await chromium.connectOverCDP(process.env.ADMIN_SWEEP_CDP);
    if (AREA === "customer") {
      // A fresh context, so the vendor or admin session in the same Chrome is never touched.
      customerContext = await browser.newContext({ viewport: MOBILE ? phone : { width: 1280, height: 900 }, isMobile: MOBILE, hasTouch: MOBILE, deviceScaleFactor: MOBILE ? 2 : 1 });
      page = await customerContext.newPage();
    } else {
      const context = browser.contexts()[0];
      page = context.pages()[0] ?? (await context.newPage());
      await page.setViewportSize(MOBILE ? phone : { width: 1440, height: 900 });
    }
  }
  mkdirSync(OUT, { recursive: true });
  listen(page);
  const supabaseUrl = localEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = localEnv("SUPABASE_SERVICE_ROLE_KEY");
  const service = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const amenityCode = `e2e_sweep_${RUN}`;
  const wordTerm = `e2esweep${RUN}`;

  try {
    if (AREA === "customer") await loginCustomer(page);
    else await waitForHumanLogin(page);
    steps.push(GUEST ? "continued as guest" : "signed in");
    if (AREA !== "admin") await installStubs(page.context());
    // The language is chosen after sign-in, because the login screen's own labels are English.
    if (LOCALE !== "en") await page.context().addCookies([{ name: "NEXT_LOCALE", value: LOCALE, url: BASE }]);

    // 1. Every static page: load, audit, screenshot, then safe interactions.
    const details = new Set<string>();
    // ADMIN_SWEEP_FROM=/admin/catalogue resumes a sweep that was cut short.
    // ADMIN_SWEEP_TO=/admin/kyc stops before that route (and skips the write flows), so a long
    // sweep can run in halves with a fresh dev server each, which avoids its memory restarts.
    const first = Math.max(0, STATIC_ROUTES.indexOf(process.env.ADMIN_SWEEP_FROM ?? ""));
    const end = STATIC_ROUTES.indexOf(process.env.ADMIN_SWEEP_TO ?? "");
    for (const path of STATIC_ROUTES.slice(first, end > first ? end : undefined)) {
      if (!(await visit(page, path))) continue;
      steps.push(`visited ${path}`);
      for (const href of (await detailLinks(page)).slice(0, 2)) details.add(href);
      await exercise(page, path);
      if (DEEP && AREA !== "admin") await clickThrough(page, path);
      // The sidebar is part of every page: its links must resolve.
      if (AREA !== "customer" && path === STATIC_ROUTES[0]) {
        const nav = await page.locator(`a[href^="/${AREA}/"]`).evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLAnchorElement).getAttribute("href")!.split("?")[0]))]);
        for (const href of nav) {
          if (!STATIC_ROUTES.includes(href) && !DETAIL_PATTERNS.some((p) => p.test(href)) && !/^\/admin\/(security|kyc\/mfa)/.test(href)) note("nav-link-not-swept", href, "sidebar");
        }
      }
    }

    // 2. Detail pages found on the list pages (first two of each kind).
    for (const path of details) {
      if (await visit(page, path)) steps.push(`visited ${path}`);
    }

    if (AREA === "vendor") {
      // Read-only probe of the vendor API: a 5xx here is a server bug whatever the page does with it.
      where = "vendor API probe";
      const vendorId = await page.evaluate(async () => (await (await fetch("/api/auth/me")).json()).user?.activeVendorId as string | undefined).catch(() => undefined);
      if (!vendorId) note("probe-skipped", "the signed-in user has no active vendor id");
      else {
        for (const rel of vendorGetRoutes()) {
          const url = `${BASE}/api/vendors/${vendorId}${rel}`;
          const status = await page.evaluate(async (u) => (await fetch(u, { cache: "no-store" })).status, url).catch(() => -1);
          if (status >= 500 || status === -1) note("api-5xx", `GET /api/vendors/:id${rel} -> ${status}`);
          else if (status === 401 || status === 403) note("api-forbidden", `GET /api/vendors/:id${rel} -> ${status}`);
          steps.push(`probed GET ${rel || "/"} -> ${status}`);
        }
      }
    }
    if (AREA === "customer" && DEEP) await customerJourney(page);
    if (AREA !== "admin" || end > first) return;

    // 3. Hotel amenity: add, turn off, and ask the AI assistant for the ones that are off.
    try {
    where = "flow: hotel amenity";
    // /admin/hotel-amenities is a legacy alias that the layout redirects to the dashboard.
    await page.goto(new URL("/admin/catalogue/hotel-amenities", BASE).toString());
    await settle(page);
    const form = page.locator("section", { has: page.getByPlaceholder("rooftop_bar") }).first();
    await form.locator("input").nth(0).fill(amenityCode);
    await form.locator("input").nth(1).fill(`E2E Sweep ${RUN}`);
    await form.locator("input").nth(2).fill(`E2E Sweep ${RUN} ms`);
    await form.locator("input").nth(3).fill(`E2E Sweep ${RUN} zh`);
    await form.locator("input").nth(4).fill("wifi");
    const created = page.waitForResponse((r) => r.url().includes("/api/admin/hotel-amenities") && r.request().method() === "POST");
    await form.getByRole("button", { name: /add amenity/i }).click();
    const createdResponse = await created;
    if (!createdResponse.ok()) note("flow-failed", `adding an amenity returned ${createdResponse.status()}`);
    await settle(page);
    const row = page.locator("tr", { hasText: amenityCode });
    if (!(await row.count())) note("flow-failed", "the new amenity does not appear in the table");
    else {
      const off = page.waitForResponse((r) => r.url().includes("/api/admin/hotel-amenities") && r.request().method() === "PATCH");
      await row.getByRole("button", { name: /turn off/i }).click();
      if (!(await off).ok()) note("flow-failed", "turning the amenity off failed");
      await expect(row.getByRole("button", { name: /turn on/i })).toBeVisible({ timeout: 8_000 }).catch(() => note("flow-failed", "the row did not switch to 'Turn on' after turning off"));
      steps.push("amenity added and turned off");
    }

    where = "flow: admin AI switch table";
    await page.goto(new URL("/admin/ai-assistant", BASE).toString());
    await settle(page);
    const ask = page.waitForResponse((r) => r.url().includes("/api/admin-ai/ask") && r.request().method() === "POST", { timeout: 90_000 });
    await page.getByPlaceholder("Ask a question…").fill("I want to turn on a hotel amenity. Show me the ones that are off.");
    await page.keyboard.press("Enter");
    const asked = await ask;
    const askBody = (await asked.json().catch(() => null)) as { data?: { choices?: { rows: { label: string }[] }[]; answer?: string } } | null;
    if (!askBody?.data?.choices?.length) note("flow-failed", `the assistant returned no switch table (answer: ${String(askBody?.data?.answer).slice(0, 120)})`);
    else {
      const table = page.locator('[data-ai-choices="set_hotel_amenity_active"]').last();
      const toggle = table.getByRole("switch", { name: `E2E Sweep ${RUN}` });
      if (!(await toggle.count())) note("flow-failed", "the switch table does not list the amenity that is off");
      else {
        const save = table.getByRole("button", { name: /^save/i });
        if (await save.isEnabled()) note("flow-failed", "Save is enabled before any switch was flipped");
        await toggle.check();
        await expect(save).toBeEnabled();
        const patch = page.waitForResponse((r) => r.url().includes("/api/admin/hotel-amenities") && r.request().method() === "PATCH");
        await save.click();
        if (!(await patch).ok()) note("flow-failed", "saving from the switch table failed");
        await expect(table.locator('[aria-label="Done"]')).toBeVisible({ timeout: 8_000 }).catch(() => note("flow-failed", "no check mark after saving"));
        await page.screenshot({ path: join(OUT, "flow_ai_switch_table.png") });
        steps.push("AI switch table saved");
      }
    }
    await audit(page);
    } catch (error) {
      note("flow-failed", `amenity / AI table flow stopped: ${String((error as Error).message).split("\n")[0].slice(0, 220)}`);
      await page.screenshot({ path: join(OUT, "flow_amenity_failed.png") }).catch(() => {});
    }

    // 4. Moderation word: add, turn off, remove.
    try {
    where = "flow: moderation word";
    await page.goto(new URL("/admin/moderation-words", BASE).toString());
    await settle(page);
    await page.getByPlaceholder("Enter a word to censor").fill(wordTerm);
    const wordAdd = page.waitForResponse((r) => r.url().includes("/api/admin/moderation-words") && r.request().method() === "POST");
    await page.getByRole("button", { name: /add word/i }).click();
    if (!(await wordAdd).ok()) note("flow-failed", "adding a moderation word failed");
    await settle(page);
    const wordRow = page.locator("tr", { hasText: wordTerm });
    if (!(await wordRow.count())) note("flow-failed", "the new word does not appear in the table");
    else {
      const flip = page.waitForResponse((r) => r.url().includes("/api/admin/moderation-words") && r.request().method() === "PATCH");
      await wordRow.getByRole("button", { name: /active/i }).first().click();
      if (!(await flip).ok()) note("flow-failed", "turning the word off failed");
      page.once("dialog", (dialog) => void dialog.accept());
      const gone = page.waitForResponse((r) => r.url().includes("/api/admin/moderation-words") && r.request().method() === "DELETE");
      await wordRow.getByRole("button", { name: "Remove" }).click();
      if (!(await gone).ok()) note("flow-failed", "removing the word failed");
      steps.push("moderation word added, toggled and removed");
    }
    } catch (error) {
      note("flow-failed", `moderation word flow stopped: ${String((error as Error).message).split("\n")[0].slice(0, 220)}`);
      await page.screenshot({ path: join(OUT, "flow_word_failed.png") }).catch(() => {});
    }
  } finally {
    if (AREA !== "admin") await page.context().unrouteAll({ behavior: "ignoreErrors" }).catch(() => {});
    // The vendor/admin Chrome is the user's own: put its language back.
    if (!customerContext && LOCALE !== "en") await page.context().addCookies([{ name: "NEXT_LOCALE", value: "en", url: BASE }]).catch(() => {});
    await customerContext?.close().catch(() => {});
    // Remove every row this run created, even after a failure.
    if (service) {
      await service.from("hotel_amenities").delete().eq("code", amenityCode);
      await service.from("moderation_custom_words").delete().eq("term", wordTerm);
    }
    save();
    const counts: Record<string, number> = {};
    for (const f of findings) counts[f.kind] = (counts[f.kind] ?? 0) + 1;
    console.log("ADMIN_SWEEP_DONE", JSON.stringify({ steps: steps.length, findings: findings.length, counts }));
  }
});
