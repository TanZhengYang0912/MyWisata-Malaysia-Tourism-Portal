import { act, type AnchorHTMLAttributes } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findOne, installTestDom, TestElement, TestEvent, type TestDocument } from '@/components/shared/__tests__/render-test-dom';
import type { KycQueueResult, KycReviewCandidate } from '@/lib/kyc/operations';

const mocks = vi.hoisted(() => ({
  push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), candidate: null as KycReviewCandidate | null,
  candidateError: false, onRefresh: null as null | ((signal: AbortSignal) => Promise<unknown>),
}));
vi.mock('next/navigation', () => {
  const router = { push: mocks.push, replace: mocks.replace };
  return { useRouter: () => router };
});
vi.mock('next/link', () => ({ default: ({ prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { prefetch?: boolean }) => <a {...props} data-prefetch={String(prefetch)} /> }));
vi.mock('react-i18next', () => {
  const t = (key: string, params?: Record<string, unknown>) => `${key}${params ? ':' + JSON.stringify(params) : ''}`;
  return { useTranslation: () => ({ i18n: { resolvedLanguage: 'en' }, t }) };
});
vi.mock('@/hooks/use-visible-review-refresh', () => ({ useVisibleReviewRefresh: ({ onRefresh }: { onRefresh: (signal: AbortSignal) => Promise<unknown> }) => {
  mocks.onRefresh = onRefresh;
  return { lastSuccessAt: null, hasRefreshError: false, refresh: mocks.refresh };
} }));
import AdminKycPage from '../page';

const alice = { submissionId: '22222222-2222-4222-8222-222222222222', name: 'Customer Alice', docType: 'national_id',
  submittedAt: '2026-10-29T08:00:00Z', isAssignedToCurrentUser: false };
const bobId = '33333333-3333-4333-8333-333333333333';
const queue: KycQueueResult = {
  customers: [{ id: bobId, name: 'Customer Bob', email: 'bob@example.com', verificationTier: 'profile_complete' }],
  submissions: [{ id: '44444444-4444-4444-8444-444444444444', userId: bobId, docType: 'national_id', status: 'info_requested',
    assignedTo: null, queuePosition: 2, submittedAt: '2026-07-15T08:00:00Z', reviewedAt: null, reviewedBy: null,
    reviewReasonCode: null, reviewReasonDetail: null, documents: [], ocr: null }],
  total: 30, page: 1, pageSize: 10, totalPages: 3, counts: { pending: 3, infoRequested: 1 }, verifiedCount: 8, oldestPendingAt: alice.submittedAt,
};
let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
let requests: Array<{ url: string; method: string }>;
let fetchMock: ReturnType<typeof vi.fn>;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  vi.useFakeTimers(); requests = []; mocks.candidate = { ...alice }; mocks.candidateError = false;
  mocks.push.mockReset(); mocks.replace.mockReset();
  mocks.refresh.mockReset().mockImplementation(() => { void mocks.onRefresh?.(new AbortController().signal); });
  fetchMock = vi.fn(async (input: string, init?: RequestInit) => {
    requests.push({ url: input, method: init?.method ?? 'GET' });
    if (input === '/api/admin/kyc/work') return Response.json(mocks.candidateError ? { error: { code: 'UNAVAILABLE' } } : { data: { candidate: mocks.candidate } }, { status: mocks.candidateError ? 503 : 200 });
    if (input.startsWith('/api/admin/kyc/submissions?')) {
      const query = new URL(input, 'http://localhost').searchParams;
      const pageSize = Number(query.get('pageSize')); const page = Number(query.get('page'));
      const total = query.get('search') ? 1 : 30;
      return Response.json({ data: { ...queue, page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
    }
    if (input.endsWith('/security-status')) return Response.json({ data: { emailRecipients: 0, latestRun: null, monitor: { lastCheckedAt: null }, pendingAlerts: 0, incidents: [] } });
    if (input.endsWith('/operations')) return Response.json({ data: { submittedToday: 0, decidedToday: 0, assigned: 0, waitingP95Seconds: null, privateOcrConfigured: false,
      sessions: { closed: 0, recorded: 0, incomplete: 0, recordedSeconds: 0, firstReviewMeanSeconds: null, reReviewMeanSeconds: null }, precheck: { queued: 0, processing: 0, failed: 0, completedToday: 0 } } });
    return Response.json({ data: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); vi.useRealTimers(); vi.unstubAllGlobals(); });
async function flush() { await act(async () => { await vi.advanceTimersByTimeAsync(300); }); }
async function render() { await act(async () => { root.render(<AdminKycPage />); }); await flush(); }
const element = (tag: string, name: string) => findOne(container, e => e.tagName === tag && (e.getAttribute('aria-label') ?? e.textContent).includes(name));
async function click(e: TestElement) { await act(async () => { e.dispatchEvent(new TestEvent('click', { bubbles: true })); }); await flush(); }
async function change(e: TestElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(TestElement.prototype, 'value')?.set?.call(e, value); e.dispatchEvent(new TestEvent(e.tagName === 'INPUT' ? 'input' : 'change', { bubbles: true })); });
  await flush();
}
const listQuery = () => new URL(requests.filter(r => r.url.includes('/submissions?')).at(-1)!.url, 'http://localhost').searchParams;

describe('named KYC review entry', () => {
  it('names the exact applicant and links without prefetch or an anonymous claim', async () => {
    await render();
    const start = element('A', 'kyc.queue.startReview');
    expect(start.getAttribute('href')).toBe(`/admin/kyc/${alice.submissionId}`);
    expect(start.getAttribute('aria-label')).toContain('Customer Alice');
    expect(start.getAttribute('data-prefetch')).toBe('false');
    expect(container.textContent).toContain('Customer Alice');
    expect(requests.every(r => r.method === 'GET')).toBe(true);
    expect(container.textContent).not.toContain('kyc.operations.next');
    expect(element('A', 'kyc.detail.viewDetails').getAttribute('href')).toContain(queue.submissions[0].id);
    expect(element('A', 'kyc.detail.viewDetails').getAttribute('data-prefetch')).toBe('false');
  });
  it('offers continue review for the named case already assigned to the actor', async () => {
    mocks.candidate = { ...alice, isAssignedToCurrentUser: true }; await render();
    expect(element('A', 'kyc.queue.continueReview').getAttribute('href')).toContain(alice.submissionId);
  });
  it('hides the recommended applicant when only information-requested cases remain', async () => {
    mocks.candidate = null; await render();
    expect(container.textContent).not.toContain('kyc.queue.startReview');
    expect(container.textContent).toContain('Customer Bob');
    expect(container.textContent).toContain('kyc.detail.viewDetails');
  });
  it('removes a stale recommendation on failure and refreshes all surfaces once', async () => {
    await render(); mocks.candidateError = true;
    await click(element('BUTTON', 'actions.refresh'));
    expect(container.textContent).toContain('kyc.queue.candidateUnavailable');
    expect(container.textContent).not.toContain('Customer Alice');
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    expect(requests.filter(r => r.url.includes('/submissions?'))).toHaveLength(2);
    for (const url of ['/api/admin/kyc/work', '/api/admin/kyc/security-status', '/api/admin/kyc/operations']) {
      expect(requests.filter(r => r.url === url)).toHaveLength(2);
    }
    mocks.candidateError = false; await click(element('BUTTON', 'actions.refresh'));
    expect(container.textContent).toContain('Customer Alice');
  });
  it('keeps security attention visible in the collapsed section summary', async () => {
    await render();
    expect(element('SUMMARY', 'kyc.security.title').textContent).toContain('kyc.queue.securityAttention');
    expect(element('SUMMARY', 'kyc.operations.title')).toBeDefined();
  });
  it('keeps server totals and resets pagination for filters and page-size changes', async () => {
    await render();
    const sizes = element('SELECT', 'kyc.operations.pageSize');
    expect(sizes.childNodes.map(n => (n as TestElement).getAttribute('value'))).toEqual(['10', '25', '50']);
    expect(listQuery().get('pageSize')).toBe('10');
    expect(container.textContent).toContain('"total":30');
    await click(element('BUTTON', 'ui.pagination.nextPage'));
    expect(listQuery().get('page')).toBe('2');
    await change(element('SELECT', 'kyc.filters.status'), 'info_requested');
    expect(listQuery().get('page')).toBe('1');
    expect(listQuery().get('status')).toBe('info_requested');
    await click(element('BUTTON', 'ui.pagination.nextPage'));
    await change(element('SELECT', 'kyc.operations.assignment'), 'unassigned');
    expect(listQuery().get('page')).toBe('1');
    await click(element('BUTTON', 'ui.pagination.nextPage'));
    await change(sizes, '25');
    expect(listQuery().get('page')).toBe('1'); expect(listQuery().get('pageSize')).toBe('25');
    await click(element('BUTTON', 'ui.pagination.nextPage'));
    await change(element('INPUT', 'kyc.filters.search'), 'Bob');
    expect(listQuery().get('page')).toBe('1'); expect(container.textContent).toContain('"total":1');
    expect(element('A', 'kyc.queue.startReview').getAttribute('href')).toContain(alice.submissionId);
  });
});
