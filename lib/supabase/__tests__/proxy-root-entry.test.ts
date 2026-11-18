import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  createServerClient: vi.fn(),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: mocks.createServerClient,
}));

import { rootEntryDestination, updateSession } from "../proxy";

type RoleResult = { data: Array<{ role_name: string }> | null; error: { message: string } | null };

function setupSupabase({
  claimsSub,
  roles = { data: [], error: null },
  authCookies = [],
}: {
  claimsSub?: string;
  roles?: RoleResult;
  authCookies?: Array<{ name: string; value: string; options?: Record<string, unknown> }>;
} = {}) {
  const getClaims = vi.fn(async () => {
    const cookies = mocks.createServerClient.mock.calls.at(-1)?.[2]?.cookies;
    await cookies?.setAll(authCookies, {});
    return { data: claimsSub ? { claims: { sub: claimsSub, aal: "aal1" } } : { claims: null }, error: null };
  });
  const rpc = vi.fn(async () => roles);
  mocks.createServerClient.mockReturnValue({ auth: { getClaims }, rpc });
  return { getClaims, rpc };
}

function makeRequest(path = "/", method = "GET") {
  return new NextRequest(new Request(`https://mylawatan.example${path}`, {
    method,
    headers: { "sec-fetch-dest": "document", "accept-language": "en", cookie: "NEXT_LOCALE=en" },
  }));
}

function rolesOf(...names: string[]): RoleResult {
  return { data: names.map((role_name) => ({ role_name })), error: null };
}

describe("rootEntryDestination", () => {
  it.each([
    { label: "guest", signedIn: false, rows: null, expected: "/customer" },
    { label: "role lookup failed", signedIn: true, rows: null, expected: null },
    { label: "no role rows", signedIn: true, rows: [], expected: "/customer" },
    { label: "customer", signedIn: true, rows: [{ role_name: "customer" }], expected: "/customer" },
    { label: "outlet manager", signedIn: true, rows: [{ role_name: "outlet_manager" }], expected: "/vendor/announcements" },
    { label: "approver", signedIn: true, rows: [{ role_name: "approver" }], expected: "/admin/withdrawals" },
    { label: "staff", signedIn: true, rows: [{ role_name: "staff" }], expected: "/staff" },
    {
      label: "highest-priority role wins",
      signedIn: true,
      rows: [{ role_name: "customer" }, { role_name: "super_admin" }],
      expected: "/admin/dashboard",
    },
    { label: "unknown role only", signedIn: true, rows: [{ role_name: "unknown" }], expected: "/customer" },
  ])("$label → $expected", ({ signedIn, rows, expected }) => {
    expect(rootEntryDestination(signedIn, rows)).toBe(expected);
  });
});

describe("Supabase proxy root entry redirect", () => {
  afterEach(() => {
    mocks.createServerClient.mockReset();
  });

  it("redirects a guest to /customer without a role lookup", async () => {
    const { rpc } = setupSupabase();

    const response = await updateSession(makeRequest());

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe("/customer");
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    { roles: rolesOf("customer"), expected: "/customer" },
    { roles: rolesOf("vendor_owner"), expected: "/vendor/announcements" },
    { roles: rolesOf("customer", "super_admin"), expected: "/admin/dashboard" },
    { roles: rolesOf(), expected: "/customer" },
  ])("redirects a signed-in user to $expected", async ({ roles, expected }) => {
    const { rpc } = setupSupabase({ claimsSub: "user-123", roles });

    const response = await updateSession(makeRequest());

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe(expected);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(rpc).toHaveBeenCalledExactlyOnceWith("get_my_roles");
  });

  it("falls through to the client fallback when the role lookup fails", async () => {
    setupSupabase({ claimsSub: "user-123", roles: { data: null, error: { message: "unavailable" } } });

    const response = await updateSession(makeRequest());

    expect(response.headers.get("location")).toBeNull();
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps refreshed auth cookies on the redirect", async () => {
    setupSupabase({
      claimsSub: "user-123",
      roles: rolesOf("customer"),
      authCookies: [{ name: "sb-project-auth-token", value: "refreshed-token", options: { path: "/" } }],
    });

    const response = await updateSession(makeRequest());

    expect(response.status).toBe(307);
    expect(response.cookies.get("sb-project-auth-token")?.value).toBe("refreshed-token");
  });

  it.each([
    { label: "POST /", path: "/", method: "POST" },
    { label: "GET /customer", path: "/customer", method: "GET" },
    { label: "GET /vendor", path: "/vendor", method: "GET" },
  ])("leaves $label alone", async ({ path, method }) => {
    const { rpc } = setupSupabase({ claimsSub: "user-123", roles: rolesOf("customer") });

    const response = await updateSession(makeRequest(path, method));

    expect(response.headers.get("location")).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
