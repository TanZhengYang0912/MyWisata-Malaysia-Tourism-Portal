import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { chromium, expect, test, type Page } from "@playwright/test";
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
// Writes use only E2E-prefixed rows, deleted at the end. Nothing here sends an
// announcement, changes system settings, or touches money, KYC, roles or users.

test.skip(process.env.ADMIN_SWEEP !== "1", "Manual: needs a human admin sign-in. Set ADMIN_SWEEP=1 and run headed.");
// A control that never becomes usable must fail in seconds, not stall the whole run.
test.use({ viewport: { width: 1440, height: 900 }, actionTimeout: 15_000 });
test.setTimeout(2_700_000);

const BASE = "http://localhost:3000";
const OUT = process.env.ADMIN_SWEEP_OUT ?? "test-results/admin-sweep";
const RUN = Date.now().toString(36);
const STATIC_ROUTES = [
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
const DETAIL_PATTERNS = [
  /^\/admin\/orders\/[^/]+$/, /^\/admin\/kyc\/[^/]+$/, /^\/admin\/withdrawals\/[^/]+$/, /^\/admin\/event-promotions\/[^/]+$/,
  /^\/admin\/event-registrations\/[^/]+$/, /^\/admin\/recommendations\/[^/]+$/, /^\/admin\/help\/[^/]+$/, /^\/admin\/help\/flows\/[^/]+$/,
];

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
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    const busy = await page.evaluate(() => {
      const spinner = [...document.querySelectorAll(".animate-spin")].some((el) => (el as HTMLElement).offsetParent !== null);
      return spinner || /^\s*(Loading|Restoring)[^\n]{0,40}…?\s*$/m.test(document.body.innerText);
    });
    if (!busy) return;
    await page.waitForTimeout(500);
  }
  note("stuck-loading", "a spinner or Loading text is still showing after 12 s");
}

async function audit(page: Page) {
  const issues = await page.evaluate(() => {
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
    return out;
  });
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
  if (/^\/(login|admin\/security)/.test(final)) throw new Error(`Session lost: ${path} redirected to ${final}`);
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

  const selects = page.locator('section[class*="max-w-full"][class*="rounded-xl"] select');
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
  const openerCount = await openers.count();
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
  const hrefs = await page.locator('main a[href^="/admin/"]').evaluateAll((els) => els.map((el) => (el as HTMLAnchorElement).getAttribute("href") ?? ""));
  return [...new Set(hrefs.map((h) => h.split("?")[0]).filter((h) => DETAIL_PATTERNS.some((p) => p.test(h))))];
}

async function waitForHumanLogin(page: Page) {
  // Leave a page the human already has open (possibly mid-sign-in) alone.
  // An error page or about:blank goes to the dashboard: a valid session lands there, otherwise the app redirects to /login.
  if (!page.url().startsWith(BASE)) await page.goto(new URL("/admin/dashboard", BASE).toString()).catch(() => {});
  console.log("ADMIN_SWEEP_WAITING_FOR_HUMAN: sign in as an admin in the open browser window (CAPTCHA + 2FA). The sweep continues by itself.");
  const deadline = Date.now() + Number(process.env.ADMIN_SWEEP_LOGIN_WAIT_MIN ?? 15) * 60_000;
  let lastJump = 0;
  while (Date.now() < deadline) {
    const path = new URL(page.url()).pathname;
    if (path.startsWith("/admin") && !/^\/admin\/(security|kyc\/mfa)/.test(path)) return;
    if (!/^\/(login|admin|auth)/.test(path) && Date.now() - lastJump > 20_000) {
      lastJump = Date.now();
      await page.goto(new URL("/admin/dashboard", BASE).toString()).catch(() => {});
    }
    await page.waitForTimeout(1_500);
  }
  throw new Error("Timed out waiting for the admin sign-in");
}

test("admin sweep", async ({ page: launchedPage }) => {
  let page = launchedPage;
  if (process.env.ADMIN_SWEEP_CDP) {
    const browser = await chromium.connectOverCDP(process.env.ADMIN_SWEEP_CDP);
    const context = browser.contexts()[0];
    page = context.pages()[0] ?? (await context.newPage());
    await page.setViewportSize({ width: 1440, height: 900 });
  }
  mkdirSync(OUT, { recursive: true });
  listen(page);
  const supabaseUrl = localEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceKey = localEnv("SUPABASE_SERVICE_ROLE_KEY");
  const service = supabaseUrl && serviceKey ? createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
  const amenityCode = `e2e_sweep_${RUN}`;
  const wordTerm = `e2esweep${RUN}`;

  try {
    await waitForHumanLogin(page);
    steps.push("signed in");

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
      // The sidebar is part of every page: its links must resolve.
      if (path === "/admin/dashboard") {
        const nav = await page.locator('a[href^="/admin/"]').evaluateAll((els) => [...new Set(els.map((el) => (el as HTMLAnchorElement).getAttribute("href")!.split("?")[0]))]);
        for (const href of nav) {
          if (!STATIC_ROUTES.includes(href) && !DETAIL_PATTERNS.some((p) => p.test(href)) && !/^\/admin\/(security|kyc\/mfa)/.test(href)) note("nav-link-not-swept", href, "sidebar");
        }
      }
    }

    // 2. Detail pages found on the list pages (first two of each kind).
    for (const path of details) {
      if (await visit(page, path)) steps.push(`visited ${path}`);
    }

    if (end > first) return;

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
