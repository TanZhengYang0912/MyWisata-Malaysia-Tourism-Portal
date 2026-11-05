import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { installTestDom, TestEvent, type TestNode, type TestDocument } from '@/components/shared/__tests__/render-test-dom';
const state = vi.hoisted(() => ({
  user: { id: 'A' } as { id: string } | null,
  refresh: vi.fn(),
  wishlist: { savedIds: new Set<string>(), savedOutletIds: new Set<string>(), hydrated: true, outletHydrated: true, denied: false, outletDenied: false, revision: 1, loading: false },
  destinations: { savedStates: new Set<string>(), savedAt: new Map<string, string>(), hydrated: true, denied: false, loading: false },
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: state.refresh }) }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: state.user, loading: false }) }));
vi.mock('@/components/providers/wishlist', () => ({ useWishlist: () => state.wishlist }));
vi.mock('@/components/providers/saved-destinations', () => ({ useSavedDestinations: () => state.destinations }));
vi.mock('@/components/customer/activity-card', () => ({ ActivityCard: ({ activity }: { activity: { id: string } }) => <span>card:{activity.id}</span> }));
vi.mock('@/components/customer/saved-destination-card', () => ({ SavedDestinationCard: ({ destination }: { destination: { state: string } }) => <span>destination:{destination.state}</span> }));
vi.mock('@/lib/customer/discovery-ranking', () => ({ groupAccommodationByProperty: () => [] }));
import { SavedHubClient } from '../wishlist-client';
import type { ComputedActivity } from '@/backend/core/types';
let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: HTMLElement;
const activities = [{ id: 'old' }] as ComputedActivity[];
async function render(ownerId = 'A') { await act(async () => root.render(<SavedHubClient ownerId={ownerId} activities={activities} destinations={[]} />)); }
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  vi.useFakeTimers(); state.refresh.mockReset(); state.user = { id: 'A' };
  Object.assign(state.wishlist, { savedIds: new Set(['old']), savedOutletIds: new Set(), hydrated: true, outletHydrated: true, denied: false, outletDenied: false, revision: 1 });
  Object.assign(state.destinations, { savedStates: new Set(), savedAt: new Map(), hydrated: true, denied: false });
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  container = document.createElement('div') as unknown as HTMLElement; document.body.appendChild(container as unknown as TestNode); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.removeChild(container as unknown as TestNode); vi.useRealTimers(); });
it('renders a newly saved destination absent from initial server props', async () => {
  state.destinations.savedStates = new Set(['Penang']); await render();
  expect(container.textContent).toContain('destination:Penang');
});
it('requests missing product cards once per successful snapshot instead of looping', async () => {
  state.wishlist.savedIds.add('new'); await render();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.refresh).toHaveBeenCalledTimes(1);
  await render(); await act(async () => { await vi.advanceTimersByTimeAsync(5_000); });
  expect(state.refresh).toHaveBeenCalledTimes(1);
});
it('retains valid server cards on initial read failure but hides denied or old-owner cards', async () => {
  state.wishlist.savedIds = new Set(); state.wishlist.hydrated = false;
  await render(); expect(container.textContent).toContain('card:old');
  state.wishlist.denied = true; await render(); expect(container.textContent).not.toContain('card:old');
  state.wishlist.denied = false; state.user = { id: 'B' }; await render();
  expect(container.textContent).not.toContain('card:old');
});
it('requests matching server props after an in-place identity change and retries returning owners', async () => {
  state.wishlist.savedIds.add('new'); await render();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.refresh).toHaveBeenCalledTimes(1);
  state.user = { id: 'B' }; await render();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.refresh).toHaveBeenCalledTimes(2);
  state.user = { id: 'A' }; await render();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.refresh).toHaveBeenCalledTimes(3);
});
it('defers a hidden owner-snapshot request until the window returns', async () => {
  state.user = { id: 'B' }; await render();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.refresh).not.toHaveBeenCalled();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  await act(async () => document.dispatchEvent(new TestEvent('visibilitychange')));
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(state.refresh).toHaveBeenCalledTimes(1);
});
