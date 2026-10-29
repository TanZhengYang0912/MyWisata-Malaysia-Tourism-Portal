import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { findOne, installTestDom, TestEvent, type TestDocument, type TestNode } from "@/components/shared/__tests__/render-test-dom";

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

function profile(id: string, email = `${id}@example.test`, avatarUrl: string | null = `https://avatars.example.test/${id}.webp`) {
  return {
    user: {
      id,
      email,
      fullName: id,
      avatarUrl,
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

let latestAuth: ReturnType<typeof useAuth>;

function AuthSnapshot() {
  const auth = useAuth();
  React.useLayoutEffect(() => { latestAuth = auth; });
  return <output>{JSON.stringify({ id: auth.currentUser?.id ?? null, avatarUrl: auth.currentUser?.avatarUrl ?? null, permissions: auth.staffPermissionKeys, outlet: auth.activeOutletName, loading: auth.loading })}</output>;
}

function DraftContent() {
  const [step, setStep] = React.useState("Preferences");
  const [draft, setDraft] = React.useState("");
  return <button onClick={() => { setStep("Identity"); setDraft("unsaved"); }}>{step}: {draft}</button>;
}

function CustomerDraftGate() {
  const { currentUser, loading } = useAuth();
  // Mirrors the customer layout's loading boundary, which unmounts its children.
  if (loading || !currentUser) return <output>Blocked</output>;
  return <DraftContent key={currentUser.id} />;
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

async function renderEditedDraft() {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(profile("user-a")), { status: 200 }));
  await act(async () => {
    root?.render(<AuthProvider><AuthSnapshot /><CustomerDraftGate /></AuthProvider>);
    await settle();
  });
  const button = findOne(container as unknown as TestNode, (element) => element.nodeName === "BUTTON");
  act(() => { button.dispatchEvent(new TestEvent("click", { bubbles: true })); });
  expect(container?.textContent).toContain("Identity: unsaved");
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

  it.each(["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"])("keeps the current step and draft mounted during same-account %s", async (event) => {
    await renderEditedDraft();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    await act(async () => { sharedAuthMocks.listener?.(event, { user: { id: "user-a" } }); await settle(); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(latestAuth.loading).toBe(false);
    expect(container?.textContent).toContain("Identity: unsaved");
    await act(async () => { pending.resolve(new Response(JSON.stringify(profile("user-a")), { status: 200 })); await settle(); });
    expect(container?.textContent).toContain("Identity: unsaved");
  });

  it("keeps the current step and draft during an explicit same-account refresh", async () => {
    await renderEditedDraft();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    let refresh!: Promise<void>;
    await act(async () => { refresh = latestAuth.refreshUser(); await settle(); });
    expect(latestAuth.loading).toBe(false);
    expect(container?.textContent).toContain("Identity: unsaved");
    await act(async () => { pending.resolve(new Response(JSON.stringify(profile("user-a")), { status: 200 })); await refresh; });
    expect(container?.textContent).toContain("Identity: unsaved");
  });

  it("still blocks and discards the previous account draft while a new identity loads", async () => {
    await renderEditedDraft();
    const pending = deferred<Response>();
    fetchMock.mockReturnValueOnce(pending.promise);
    await act(async () => { sharedAuthMocks.listener?.("SIGNED_IN", { user: { id: "user-b" } }); await settle(); });
    expect(latestAuth.currentUser).toBeNull();
    expect(latestAuth.loading).toBe(true);
    expect(container?.textContent).not.toContain("Identity: unsaved");
    await act(async () => { pending.resolve(new Response(JSON.stringify(profile("user-b")), { status: 200 })); await settle(); });
    expect(latestAuth.currentUser?.id).toBe("user-b");
    expect(container?.textContent).toContain("Preferences:");
  });

  it.each(["failure", "mismatched identity"])("clears identity if a background refresh returns %s", async (kind) => {
    await renderEditedDraft();
    fetchMock.mockResolvedValueOnce(kind === "failure"
      ? new Response(null, { status: 500 })
      : new Response(JSON.stringify(profile("user-b")), { status: 200 }));
    await act(async () => { sharedAuthMocks.listener?.("TOKEN_REFRESHED", { user: { id: "user-a" } }); await settle(); });
    expect(latestAuth.currentUser).toBeNull();
    expect(container?.textContent).not.toContain("Identity: unsaved");
    expect(container?.textContent).toContain("Blocked");
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
    expect(container?.textContent).toContain("https://avatars.example.test/user-b.webp");
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
    expect(container?.textContent).not.toContain("https://avatars.example.test/user-a.webp");
    expect(storedValues.get("tp_current_user_id")).toBe("user-b");
    expect(JSON.parse(storedValues.get("tp_current_user_data") ?? "null")).toMatchObject({
      id: "user-b",
      email: "user-b@example.test",
    });
  });

  it("publishes the saved avatar when the current account is refreshed", async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(profile("user-a", undefined, null)), { status: 200 }));

    await act(async () => {
      root?.render(<AuthProvider><AuthSnapshot /></AuthProvider>);
      await settle();
    });
    expect(container?.textContent).toContain('"avatarUrl":null');

    const savedAvatarUrl = "https://avatars.example.test/user-a-saved.webp";
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(profile("user-a", undefined, savedAvatarUrl)), { status: 200 }));
    await act(async () => {
      await latestAuth.refreshUser();
      await settle();
    });

    expect(container?.textContent).toContain(savedAvatarUrl);
    expect(JSON.parse(storedValues.get("tp_current_user_data") ?? "null")).toMatchObject({
      id: "user-a",
      avatarUrl: savedAvatarUrl,
    });

    await act(async () => {
      sharedAuthMocks.listener?.("SIGNED_OUT", null);
      await settle();
    });
    expect(container?.textContent).toContain('"avatarUrl":null');
    expect(container?.textContent).not.toContain(savedAvatarUrl);
    expect(storedValues.has("tp_current_user_data")).toBe(false);
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
    expect(container?.textContent).toContain('"avatarUrl":null');
    expect(storedValues.has("tp_current_user_id")).toBe(false);
    expect(storedValues.has("tp_current_user_data")).toBe(false);
  });
});
