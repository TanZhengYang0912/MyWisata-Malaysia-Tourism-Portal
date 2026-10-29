import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { installTestDom, TestEvent, type TestDocument, type TestNode } from '@/components/shared/__tests__/render-test-dom';

const auth = vi.hoisted(() => ({ currentUser: { id: 'A' } as { id: string } | null, loading: false }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => auth }));
import { WishlistProvider, useWishlist } from '../wishlist';
import { SavedDestinationsProvider, useSavedDestinations } from '../saved-destinations';

let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: HTMLElement;
let wishlist: ReturnType<typeof useWishlist>;
let destinations: ReturnType<typeof useSavedDestinations>;
let fetchMock: ReturnType<typeof vi.fn>;
const response = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
}
function Probe() {
  const currentWishlist = useWishlist(); const currentDestinations = useSavedDestinations();
  React.useEffect(() => { wishlist = currentWishlist; destinations = currentDestinations; }, [currentWishlist, currentDestinations]);
  return <output>{[...currentWishlist.savedIds, ...currentWishlist.savedOutletIds, ...currentDestinations.savedStates].join('|')}</output>;
}
function Providers() { return <WishlistProvider><SavedDestinationsProvider><Probe /></SavedDestinationsProvider></WishlistProvider>; }
async function render() { await act(async () => root.render(<Providers />)); }
async function advance() { await act(async () => { await vi.advanceTimersByTimeAsync(250); }); }
async function visibleReturn() { await act(async () => document.dispatchEvent(new TestEvent('visibilitychange'))); await advance(); }

beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  vi.useFakeTimers(); auth.currentUser = { id: 'A' }; auth.loading = false;
  Object.defineProperty(document, 'visibilityState', { configurable: true, writable: true, value: 'visible' });
  container = document.createElement('div') as unknown as HTMLElement;
  document.body.appendChild(container as unknown as TestNode); root = createRoot(container);
  fetchMock = vi.fn(async (input: string) => response(input === '/api/wishlist' ? { productIds: ['old'] } : input === '/api/saved-outlets' ? { outletIds: ['hotel'] } : { destinations: [{ state: 'Penang', savedAt: '2026-10-01' }] }));
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.removeChild(container as unknown as TestNode); vi.unstubAllGlobals(); vi.useRealTimers(); });

describe('saved resource background reconciliation', () => {
  it('hydrates once and updates on same-ID verified auth without clearing existing data', async () => {
    await render(); await advance();
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const next = deferred<Response>();
    fetchMock.mockImplementation((url: string) => url === '/api/wishlist' ? next.promise : Promise.resolve(response(url === '/api/saved-outlets' ? { outletIds: [] } : { destinations: [] })));
    auth.currentUser = { id: 'A' }; await render(); await advance();
    expect(wishlist.savedIds.has('old')).toBe(true);
    expect(wishlist.loading).toBe(false);
    await act(async () => next.resolve(response({ productIds: ['new'] })));
    expect(wishlist.savedIds.has('new')).toBe(true);
    expect(wishlist.savedIds.has('old')).toBe(false);
  });

  it('keeps a local optimistic save when an earlier read completes, then reconciles', async () => {
    await render(); await advance();
    const oldRead = deferred<Response>(); const write = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url === '/api/wishlist') return init?.method ? write.promise : oldRead.promise;
      return Promise.resolve(response(url === '/api/saved-outlets' ? { outletIds: [] } : { destinations: [] }));
    });
    await visibleReturn();
    let mutation!: Promise<boolean>;
    await act(async () => { mutation = wishlist.toggleSaved('new'); });
    await act(async () => oldRead.resolve(response({ productIds: ['old'] })));
    expect(wishlist.savedIds.has('new')).toBe(true);
    fetchMock.mockImplementation(async (url: string) => response(url === '/api/wishlist' ? { productIds: ['new'] } : {}));
    await act(async () => { write.resolve(response({})); await mutation; });
    await advance();
    expect([...wishlist.savedIds]).toEqual(['new']);
  });

  it('ignores an old-owner rollback including an A-B-A switch', async () => {
    await render(); await advance();
    const write = deferred<Response>();
    fetchMock.mockImplementation((url: string, init?: RequestInit) => init?.method ? write.promise : Promise.resolve(response(url === '/api/wishlist' ? { productIds: ['fresh'] } : {})));
    let mutation!: Promise<boolean>;
    await act(async () => { mutation = wishlist.toggleSaved('old'); });
    auth.currentUser = { id: 'B' }; await render(); await advance();
    auth.currentUser = { id: 'A' }; await render(); await advance();
    await act(async () => { write.resolve(response({}, 500)); await mutation; });
    expect([...wishlist.savedIds]).toEqual(['fresh']);
  });

  it('coalesces duplicate writes to the same item', async () => {
    await render(); await advance();
    const write = deferred<Response>(); fetchMock.mockImplementation(() => write.promise);
    let first!: Promise<boolean>; let second!: Promise<boolean>;
    await act(async () => { first = destinations.toggleSaved('Perak'); second = destinations.toggleSaved('Perak'); });
    expect(first).toBe(second);
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method)).toHaveLength(1);
    await act(async () => { write.resolve(response({})); await first; });
  });

  it('retains successful resources on mixed failure, but clears denied resources', async () => {
    await render(); await advance();
    fetchMock.mockImplementation(async (url: string) => url === '/api/wishlist' ? response({}, 503) : url === '/api/saved-outlets' ? response({}, 403) : response({ destinations: [] }));
    await visibleReturn();
    expect(wishlist.savedIds.has('old')).toBe(true);
    expect(wishlist.savedOutletIds.size).toBe(0);
    expect(destinations.savedStates.size).toBe(0);
    const count = fetchMock.mock.calls.filter(([url]) => url === '/api/saved-outlets').length;
    await visibleReturn();
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/saved-outlets')).toHaveLength(count);
  });

  it('does not pretend failed initial reads are successful empty snapshots', async () => {
    fetchMock.mockResolvedValue(response({}, 503));
    await render(); await advance();
    expect(wishlist.hydrated).toBe(false);
    expect(wishlist.outletHydrated).toBe(false);
    expect(destinations.hydrated).toBe(false);
    expect(wishlist.loading).toBe(false);
    expect(destinations.loading).toBe(false);
  });

  it('does not restore denied data through another pending mutation rollback', async () => {
    await render(); await advance();
    const deniedWrite = deferred<Response>(); const failedWrite = deferred<Response>();
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => JSON.parse(String(init?.body)).productId === 'one' ? deniedWrite.promise : failedWrite.promise);
    let one!: Promise<boolean>; let two!: Promise<boolean>;
    await act(async () => { one = wishlist.toggleSaved('one'); two = wishlist.toggleSaved('old'); });
    await act(async () => { deniedWrite.resolve(response({}, 403)); await one; });
    await act(async () => { failedWrite.resolve(response({}, 500)); await two; });
    expect(wishlist.savedIds.size).toBe(0);
    const count = fetchMock.mock.calls.length;
    await advance(); expect(fetchMock).toHaveBeenCalledTimes(count);
  });

  it('does not read private resources for guests or hidden windows', async () => {
    auth.currentUser = null; await render(); await advance();
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'hidden' });
    auth.currentUser = { id: 'A' }; await render(); await advance();
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(document, 'visibilityState', { value: 'visible' });
    await visibleReturn(); expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
