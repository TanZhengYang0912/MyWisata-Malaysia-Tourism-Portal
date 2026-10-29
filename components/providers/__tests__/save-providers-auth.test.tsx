import React, { act } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installTestDom, type TestDocument, type TestNode } from "@/components/shared/__tests__/render-test-dom";

const authState = vi.hoisted(() => ({
  currentUser: null as { id: string } | null,
  loading: true,
}));

vi.mock("@/components/providers/auth", () => ({
  useAuth: () => authState,
}));

import { SavedDestinationsProvider, useSavedDestinations } from "@/components/providers/saved-destinations";
import { WishlistProvider, useWishlist } from "@/components/providers/wishlist";

let createRoot: typeof import("react-dom/client").createRoot;
let document: TestDocument;
let fetchMock: ReturnType<typeof vi.fn>;
let root: ReturnType<typeof createRoot> | null = null;
let container: HTMLElement | null = null;

function SaveProviderState() {
  const wishlist = useWishlist();
  const destinations = useSavedDestinations();

  return (
    <output>
      {`${wishlist.loading ? "loading" : "ready"}:${wishlist.savedIds.size}|${destinations.loading ? "loading" : "ready"}:${destinations.savedStates.size}`}
    </output>
  );
}

function Providers() {
  return (
    <WishlistProvider>
      <SavedDestinationsProvider>
        <SaveProviderState />
      </SavedDestinationsProvider>
    </WishlistProvider>
  );
}

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe("customer save providers auth-aware hydration", () => {
  beforeAll(async () => {
    document = installTestDom();
    ({ createRoot } = await import("react-dom/client"));
  });

  beforeEach(() => {
    vi.useFakeTimers();
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    authState.currentUser = null;
    authState.loading = true;
    fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
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
    vi.useRealTimers();
  });

  it("does not request personal save data for a guest after auth finishes loading", async () => {
    await act(async () => {
      root?.render(<Providers />);
      await settle();
    });
    expect(fetchMock).not.toHaveBeenCalled();

    authState.loading = false;
    await act(async () => {
      root?.render(<Providers />);
      await settle();
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container?.textContent).toBe("ready:0|ready:0");
  });

  it("loads both personal save lists for an authenticated customer", async () => {
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      const body = url === "/api/wishlist"
        ? { data: { productIds: ["product-1"] } }
        : { data: { destinations: [{ state: "Penang", savedAt: "2026-10-01T00:00:00.000Z" }] } };
      return new Response(JSON.stringify(body), { status: 200 });
    });

    await act(async () => {
      root?.render(<Providers />);
      await settle();
    });
    authState.currentUser = { id: "customer-1" };
    authState.loading = false;

    await act(async () => {
      root?.render(<Providers />);
      await settle();
    });

    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(fetchMock).toHaveBeenCalledWith("/api/wishlist", expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    expect(fetchMock).toHaveBeenCalledWith("/api/saved-destinations", expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    expect(container?.textContent).toBe("ready:1|ready:1");
  });
});
