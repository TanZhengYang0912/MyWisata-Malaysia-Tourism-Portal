import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { updateSession } from "../proxy";

type ProxySetup = {
  accountLocale?: string | null;
  claimsSub?: string;
  authCookies?: Array<{ name: string; value: string; options?: Record<string, unknown> }>;
  authHeaders?: Record<string, string>;
};

function setupSupabase({
  accountLocale = null,
  claimsSub,
  authCookies = [],
  authHeaders = {},
}: ProxySetup = {}) {
  const maybeSingle = vi.fn(async () => ({
    data: accountLocale === undefined ? null : { preferred_locale: accountLocale },
    error: null,
  }));
  const eq = vi.fn(() => ({ maybeSingle }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const getClaims = vi.fn(async () => {
    const cookies = mocks.createServerClient.mock.calls.at(-1)?.[2]?.cookies;
    await cookies?.setAll(authCookies, authHeaders);
    return { data: claimsSub ? { claims: { sub: claimsSub } } : { claims: null }, error: null };
  });

  mocks.createServerClient.mockReturnValue({
    auth: { getClaims },
    from,
  });

  return { eq, from, getClaims, maybeSingle, select };
}

type ProxyRequest = {
  cookie?: string;
  acceptLanguage?: string;
  path?: string;
  method?: string;
  fetchDestination?: string;
  extraHeaders?: Record<string, string>;
};

function makeRequest({
  cookie,
  acceptLanguage,
  path = "/customer",
  method = "GET",
  fetchDestination = "document",
  extraHeaders = {},
}: ProxyRequest = {}) {
  const headers = new Headers();
  if (fetchDestination) headers.set("sec-fetch-dest", fetchDestination);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  if (cookie) headers.set("cookie", cookie);
  if (acceptLanguage) headers.set("accept-language", acceptLanguage);
  return new NextRequest(new Request(`https://mylawatan.example${path}`, { method, headers }));
}

function localeFromResponse(response: Response) {
  return response.headers.get("x-middleware-request-x-app-locale");
}

describe("Supabase proxy locale resolution", () => {
  afterEach(() => {
    mocks.createServerClient.mockReset();
    vi.unstubAllEnvs();
  });

  it('preserves the localhost KYC MFA route in explicit legacy mode instead of redirecting to undeployed Passkey', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('MYWISATA_DEMO_TOOLS', 'true');
    vi.stubEnv('MYWISATA_LOCAL_LEGACY_STAFF_AUTH', 'true');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    setupSupabase({ claimsSub: '11111111-1111-4111-8111-111111111111' });
    const response = await updateSession(new NextRequest('http://localhost:3000/admin/kyc/mfa'));
    expect(response.status).toBe(200);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('x-middleware-next')).toBe('1');
  });

  it('does not honor local compatibility on a production server', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('MYWISATA_DEMO_TOOLS', 'true');
    vi.stubEnv('MYWISATA_LOCAL_LEGACY_STAFF_AUTH', 'true');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
    setupSupabase({ claimsSub: '11111111-1111-4111-8111-111111111111' });
    const response = await updateSession(new NextRequest('http://localhost:3000/api/admin/kyc/submissions'));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: { code: "MFA_REQUIRED" } });
  });

  it("uses the authenticated account locale before the cookie and browser", async () => {
    const { eq, from, maybeSingle, select } = setupSupabase({
      accountLocale: "ms",
      claimsSub: "user-123",
    });

    const response = await updateSession(
      makeRequest({ cookie: "NEXT_LOCALE=zh-CN", acceptLanguage: "en-US" }),
    );

    expect(localeFromResponse(response)).toBe("ms");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("ms");
    expect(from).toHaveBeenCalledWith("users");
    expect(select).toHaveBeenCalledWith("preferred_locale");
    expect(eq).toHaveBeenCalledWith("id", "user-123");
    expect(maybeSingle).toHaveBeenCalledOnce();
  });

  it("uses the anonymous visitor cookie before the browser", async () => {
    const { from, getClaims } = setupSupabase();

    const response = await updateSession(
      makeRequest({ cookie: "NEXT_LOCALE=zh-CN", acceptLanguage: "ms-MY" }),
    );

    expect(localeFromResponse(response)).toBe("zh-CN");
    expect(getClaims).toHaveBeenCalledOnce();
    expect(from).not.toHaveBeenCalled();
  });

  it("falls back to the browser language when no account or cookie exists", async () => {
    setupSupabase();

    const response = await updateSession(makeRequest({ acceptLanguage: "ms-MY,en;q=0.8" }));

    expect(localeFromResponse(response)).toBe("ms");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("ms");
  });

  it("does not rewrite an already synchronized locale cookie on document navigation", async () => {
    setupSupabase();

    const response = await updateSession(makeRequest({ cookie: "NEXT_LOCALE=ms" }));

    expect(localeFromResponse(response)).toBe("ms");
    expect(response.cookies.has("NEXT_LOCALE")).toBe(false);
  });

  it.each<{ label: string } & ProxyRequest>([
    { label: "background API", path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty" },
    { label: "API opened as a document", path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=ms" },
    { label: "locale save API", path: "/api/locale", method: "POST", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty" },
    { label: "API without a locale cookie", path: "/api/customer/promotion-campaigns", fetchDestination: "empty" },
    { label: "API with an invalid locale cookie", path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=xx", fetchDestination: "empty" },
    { label: "RSC refresh", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty", extraHeaders: { rsc: "1" } },
    { label: "router prefetch", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty", extraHeaders: { "next-router-prefetch": "1", purpose: "prefetch" } },
    { label: "request without Fetch Metadata", cookie: "NEXT_LOCALE=ms", fetchDestination: "" },
  ])("does not persist the locale from a $label response", async (request) => {
    setupSupabase();

    const response = await updateSession(makeRequest({ acceptLanguage: "ms-MY", ...request }));

    expect(localeFromResponse(response)).toBe("ms");
    expect(response.cookies.has("NEXT_LOCALE")).toBe(false);
  });

  // API responses carry no localized copy except one admin report; document
  // navigations keep the cookie synced to the account locale (D3 of
  // docs/plans/2026-11-15-1232-api-auth-locale-and-card-images.md).
  it("skips the account-locale read for API requests and resolves from the cookie", async () => {
    const { from, getClaims } = setupSupabase({ accountLocale: "zh-CN", claimsSub: "user-123" });

    const response = await updateSession(makeRequest({
      path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=ms", acceptLanguage: "en-US", fetchDestination: "empty",
    }));

    expect(localeFromResponse(response)).toBe("ms");
    expect(from).not.toHaveBeenCalled();
    expect(getClaims).toHaveBeenCalled();
    expect(response.cookies.has("NEXT_LOCALE")).toBe(false);
  });

  it("forwards the request pathname to the root layout, overwriting a client-supplied value", async () => {
    setupSupabase();

    const response = await updateSession(makeRequest({
      path: "/customer/explore?q=food", extraHeaders: { "x-app-pathname": "/admin" },
    }));

    expect(response.headers.get("x-middleware-request-x-app-pathname")).toBe("/customer/explore");
  });

  it("overwrites a client-supplied x-app-locale on API requests with the resolved locale", async () => {
    setupSupabase({ accountLocale: "zh-CN", claimsSub: "user-123" });

    const response = await updateSession(makeRequest({
      path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty", extraHeaders: { "x-app-locale": "en" },
    }));

    expect(localeFromResponse(response)).toBe("ms");
  });

  it("cannot revert a saved locale when an older API response finishes later", async () => {
    const { getClaims } = setupSupabase();
    let finishOldRequest!: (value: { data: { claims: null }; error: null }) => void;
    getClaims.mockImplementationOnce(() => new Promise((resolve) => { finishOldRequest = resolve; }));
    const pendingOldResponse = updateSession(makeRequest({
      path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty",
    }));

    // The explicit locale-save response reaches the browser before the old API response.
    const browserCookies = new Map([["NEXT_LOCALE", "en"]]);
    finishOldRequest({ data: { claims: null }, error: null });
    const oldResponse = await pendingOldResponse;
    for (const cookie of oldResponse.cookies.getAll()) browserCookies.set(cookie.name, cookie.value);

    expect(localeFromResponse(oldResponse)).toBe("ms");
    expect(browserCookies.get("NEXT_LOCALE")).toBe("en");
  });

  it("still renews Supabase auth cookies and headers on background API responses", async () => {
    setupSupabase({
      authCookies: [{ name: "sb-project-auth-token", value: "renewed-token", options: { path: "/" } }],
      authHeaders: { "cache-control": "private, no-store" },
    });

    const response = await updateSession(makeRequest({
      path: "/api/customer/promotion-campaigns", cookie: "NEXT_LOCALE=ms", fetchDestination: "empty",
    }));

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("renewed-token");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-middleware-request-cookie")).toContain("sb-project-auth-token=renewed-token");
    expect(response.cookies.has("NEXT_LOCALE")).toBe(false);
  });

  it("replaces an invalid locale cookie with the supported browser fallback", async () => {
    setupSupabase();

    const response = await updateSession(
      makeRequest({ cookie: "NEXT_LOCALE=xx", acceptLanguage: "zh-SG,zh;q=0.9" }),
    );

    expect(localeFromResponse(response)).toBe("zh-CN");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("zh-CN");
  });

  it("keeps Supabase auth cookies and response headers when adding the locale cookie", async () => {
    setupSupabase({
      authCookies: [
        { name: "sb-project-auth-token", value: "refreshed-token", options: { path: "/" } },
      ],
      authHeaders: { "cache-control": "private, no-store" },
    });

    const response = await updateSession(makeRequest({ acceptLanguage: "en-US" }));

    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("refreshed-token");
    expect(response.cookies.get("NEXT_LOCALE")?.value).toBe("en");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});
