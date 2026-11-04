import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument, type TestNode } from "@/components/shared/__tests__/render-test-dom";

const authMocks = vi.hoisted(() => ({
  listener: null,
  initialUser: null,
  translate: (key: string) => key,
  signOut: vi.fn(async () => ({ error: null })),
  replace: vi.fn(),
}));
const sharedAuthMocks = authMocks as unknown as {
  listener: ((event: string, session: { user: { id: string } } | null) => void) | null;
  initialUser: { id: string } | null;
};

vi.mock("react-i18next", () => ({ useTranslation: () => ({ t: authMocks.translate }) }));
vi.mock("next/navigation", () => ({ usePathname: () => "/", useRouter: () => ({ replace: authMocks.replace }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: authMocks.initialUser } }),
      onAuthStateChange: (listener: typeof authMocks.listener) => {
        sharedAuthMocks.listener = listener;
        return { data: { subscription: { unsubscribe: vi.fn() } } };
      },
      signOut: authMocks.signOut,
    },
  }),
}));
vi.mock("@/lib/auth/demo-user-role", () => ({ pickDemoRole: () => "customer" }));
vi.mock("@/lib/account/lifecycle", () => ({ accountGate: () => null, canSuspendedAccessPath: () => false }));
vi.mock("@/lib/auth/customer-capabilities", () => ({ resolveCustomerCapabilities: () => ({ access: "guest" }) }));
vi.mock("@/lib/i18n/locale", () => ({ isAppLocale: () => false }));
vi.mock("@/lib/auth/staff-route-boundaries", () => ({ staffMfaDestination: () => "/mfa", staffVerificationDestination: () => "/verify" }));

import { AuthProvider, useAuth } from "@/components/providers/auth";

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function profile(id: string, email = `${id}@example.test`) {
  return {
    user: {
      id,
      email,
      fullName: id,
      tier: "verified",
      roles: ["customer"],
      activeVendorId: null,
      activeOutletIds: [],
      activeOutletName: null,
      city: null,
      country: null,
      preferredLocale: null,
      phone: null,
      status: "active",
      capabilities: { access: id },
      verificationFacts: {},
      entitlementGeneration: 1,
      staffRoleNames: [id],
      staffPermissionKeys: [`${id}.permission`],
      staffModules: [],
    },
  };
}

function AuthSnapshot() {
  const auth = useAuth();
  return <output>{JSON.stringify({ id: auth.currentUser?.id ?? null, permissions: auth.staffPermissionKeys, outlet: auth.activeOutletName, loading: auth.loading })}</output>;
}

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;
let fetchMock: ReturnType<typeof vi.fn>;
const storedValues = new Map<string, string>();

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("AuthProvider request ownership", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    storedValues.clear();
    sharedAuthMocks.listener = null;
    sharedAuthMocks.initialUser = { id: "user-a" };
    authMocks.signOut.mockClear();
    Object.defineProperties(document.defaultView.localStorage, {
      getItem: { configurable: true, value: (key: string) => storedValues.get(key) ?? null },
      setItem: { configurable: true, value: (key: string, value: string) => storedValues.set(key, value) },
      removeItem: { configurable: true, value: (key: string) => storedValues.delete(key) },
    });
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    container = document.createElement("div") as unknown as HTMLElement;
    document.body.appendChild(container as unknown as TestNode);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root?.unmount());
    if (container) document.body.removeChild(container as unknown as TestNode);
    root = null;
    container = null;
    vi.unstubAllGlobals();
  });

  it("does not let an older account response overwrite the newer auth session", async () => {
    const requestA = deferred<Response>();
    const requestB = deferred<Response>();
    fetchMock.mockReturnValueOnce(requestA.promise).mockReturnValueOnce(requestB.promise);

    act(() => {
      root?.render(<AuthProvider><AuthSnapshot /></AuthProvider>);
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    act(() => {
      sharedAuthMocks.listener?.("TOKEN_REFRESHED", { user: { id: "user-b" } });
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      requestB.resolve(new Response(JSON.stringify(profile("user-b")), { status: 200 }));
      await settle();
    });
    expect(container?.textContent).toContain('"id":"user-b"');
    expect(container?.textContent).toContain("user-b.permission");
    expect(storedValues.get("tp_current_user_id")).toBe("user-b");
    expect(JSON.parse(storedValues.get("tp_current_user_data") ?? "null")).toMatchObject({
      id: "user-b",
      email: "user-b@example.test",
    });

    await act(async () => {
      requestA.resolve(new Response(JSON.stringify(profile("user-a")), { status: 200 }));
      await settle();
    });
    expect(container?.textContent).toContain('"id":"user-b"');
    expect(container?.textContent).toContain("user-b.permission");
    expect(container?.textContent).not.toContain("user-a.permission");
    expect(storedValues.get("tp_current_user_id")).toBe("user-b");
    expect(JSON.parse(storedValues.get("tp_current_user_data") ?? "null")).toMatchObject({
      id: "user-b",
      email: "user-b@example.test",
    });
  });

  it("refreshes the same account in the background when the tab becomes visible again", async () => {
    const refresh = deferred<Response>();
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify(profile("user-a")), { status: 200 }))
      .mockReturnValueOnce(refresh.promise);

    await act(async () => {
      root?.render(<AuthProvider><AuthSnapshot /></AuthProvider>);
      await settle();
    });
    expect(container?.textContent).toContain('"id":"user-a","permissions":["user-a.permission"],"loading":false');

    // Supabase emits SIGNED_IN for the unchanged session on every tab focus.
    act(() => {
      sharedAuthMocks.listener?.("SIGNED_IN", { user: { id: "user-a" } });
    });
    await settle();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(container?.textContent).toContain('"id":"user-a"');
    expect(container?.textContent).toContain('"loading":false');

    await act(async () => {
      refresh.resolve(new Response(JSON.stringify(profile("user-a")), { status: 200 }));
      await settle();
    });
    expect(container?.textContent).toContain('"loading":false');
  });

  it("does not restore a signed-out account when its profile request resolves late", async () => {
    storedValues.set("tp_current_user_data", JSON.stringify({ id: "stale-user", email: "stale@example.test" }));
    const requestA = deferred<Response>();
    fetchMock.mockReturnValue(requestA.promise);

    act(() => {
      root?.render(<AuthProvider><AuthSnapshot /></AuthProvider>);
    });
    await settle();
    act(() => {
      sharedAuthMocks.listener?.("SIGNED_OUT", null);
    });
    await settle();
    expect(container?.textContent).toContain('"id":null');

    await act(async () => {
      requestA.resolve(new Response(JSON.stringify(profile("user-a")), { status: 200 }));
      await settle();
    });
    expect(container?.textContent).toContain('"id":null');
    expect(container?.textContent).not.toContain("user-a.permission");
    expect(storedValues.has("tp_current_user_id")).toBe(false);
    expect(storedValues.has("tp_current_user_data")).toBe(false);
  });
});
