import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { findOne, installTestDom, TestEvent, type TestDocument, type TestElement } from '@/components/shared/__tests__/render-test-dom';
const mocks = vi.hoisted(() => ({
  user: { id: 'A' } as { id: string } | null, eligible: true, feedback: vi.fn(),
  translate: (key: string) => key,
  gate: Object.assign(() => true, { handleResponse: vi.fn(async () => false) }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: mocks.translate }) }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: mocks.user, loading: false, capabilities: { affiliate_full: { allowed: mocks.eligible }, affiliate_limited: { allowed: false } } }) }));
vi.mock('@/components/providers/action-feedback', () => ({ useActionFeedback: () => ({ showFeedback: mocks.feedback }) }));
vi.mock('@/components/customer/use-customer-capability-gate', () => ({ useCustomerCapabilityGate: () => mocks.gate }));
vi.mock('next/link', () => ({ default: ({ children }: { children: React.ReactNode }) => <span>{children}</span> }));
vi.mock('@/components/customer/affiliate-clicks-chart', () => ({ AffiliateClicksChart: () => null }));
vi.mock('@/components/shared/affiliate-funnel', () => ({ AffiliateFunnelSection: () => null }));
vi.mock('@/components/shared/affiliate-insight-card', () => ({ AffiliateInsightCard: () => null }));
vi.mock('@/components/customer/affiliate-copilot-card', () => ({ AffiliateCopilotCard: () => null }));
vi.mock('@/components/shared/affiliate-rank-card', () => ({ AffiliateRankCard: () => null }));
vi.mock('@/components/customer/recommendation-earnings-panel', () => ({ RecommendationEarningsPanel: () => null }));
vi.mock('@/components/shared/affiliate-qr-code', () => ({ AffiliateQrCode: () => null }));
vi.mock('@/components/customer/affiliate-earnings-history', () => ({ AffiliateEarningsHistory: () => null }));
import Page from '../page';
let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
let fetchMock: ReturnType<typeof vi.fn>;
function payload(marker: string, code: string | null = 'test-code') {
  return { affiliateCode: code, affiliateUrl: 'https://example.test/r/test', totals: { clicks: 1, referrals: 0, pendingEarnings: 0, availableToWithdraw: 0, totalEarnings: 0 }, byProduct: [{ productId: 'one', productName: marker, shares: 1, clicks: 1, referrals: 0, earnings: 0 }], byCampaign: [], clicksByDay: [], commissions: [], funnel: {}, tier: { tierName: 'standard', rate: .03, referralCount: 0, nextTier: null } };
}
function response(marker: string, code: string | null = 'test-code') { return new Response(JSON.stringify({ data: payload(marker, code) })); }
async function render() { await act(async () => root.render(<Page />)); }
async function advance() { await act(async () => { await vi.advanceTimersByTimeAsync(250); }); }
async function click(element: TestElement) { await act(async () => element.dispatchEvent(new TestEvent('click', { bubbles: true }))); }
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  vi.useFakeTimers(); mocks.user = { id: 'A' }; mocks.eligible = true; mocks.feedback.mockReset(); mocks.gate.handleResponse.mockClear();
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container as unknown as HTMLElement);
  fetchMock = vi.fn(async () => response('initial')); vi.stubGlobal('fetch', fetchMock);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.removeChild(container); vi.useRealTimers(); vi.unstubAllGlobals(); });
it('refreshes same-user statistics and keeps campaign input and sort state on failure', async () => {
  await render(); await advance(); expect(container.textContent).toContain('initial');
  const input = findOne(container, element => element.nodeName === 'INPUT');
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, 'draft');
  await act(async () => { input.dispatchEvent(new TestEvent('input', { bubbles: true })); });
  const sort = findOne(container, element => element.nodeName === 'BUTTON' && element.textContent === 'shares');
  await click(sort);
  fetchMock.mockResolvedValueOnce(new Response(null, { status: 503 }));
  mocks.user = { id: 'A' }; await render(); await advance();
  expect(container.textContent).toContain('initial');
  expect(container.textContent).toContain('ui.backgroundRefresh.staleData');
  expect(sort.textContent).toContain('shares ↓');
  expect(input.value).toBe('draft');
  fetchMock.mockResolvedValueOnce(response('updated'));
  await act(async () => document.dispatchEvent(new TestEvent('visibilitychange'))); await advance();
  expect(container.textContent).toContain('updated'); expect(container.textContent).not.toContain('ui.backgroundRefresh.staleData');
  expect(input.value).toBe('draft');
});
it('clears stats on permission loss and ignores delayed old-account reads', async () => {
  await render(); await advance();
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  await act(async () => document.dispatchEvent(new TestEvent('visibilitychange'))); await advance();
  mocks.user = { id: 'B' }; fetchMock.mockResolvedValue(response('B-only')); await render(); await advance();
  await act(async () => finish(response('A-private')));
  expect(container.textContent).toContain('B-only'); expect(container.textContent).not.toContain('A-private');
  mocks.eligible = false; await render(); expect(container.textContent).not.toContain('B-only');
});
it('does not let an old-account link completion invoke gates, feedback or a stats reload', async () => {
  fetchMock.mockResolvedValue(response('initial', null)); await render(); await advance();
  let finish!: (value: Response) => void;
  fetchMock.mockImplementationOnce(() => new Promise<Response>(resolve => { finish = resolve; }));
  await click(findOne(container, element => element.nodeName === 'BUTTON' && element.textContent.includes('strictMigration.affiliate.generateLink')));
  mocks.user = { id: 'B' }; fetchMock.mockResolvedValue(response('B-only')); await render(); await advance();
  const reads = fetchMock.mock.calls.length;
  await act(async () => finish(new Response('{}'))); await advance();
  expect(mocks.gate.handleResponse).not.toHaveBeenCalled(); expect(mocks.feedback).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenCalledTimes(reads);
});
