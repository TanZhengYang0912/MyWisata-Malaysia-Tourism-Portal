import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { TestElement, TestEvent, findOne, installTestDom, type TestDocument } from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), useTranslation: vi.fn(), useAuth: vi.fn(), getMessages: vi.fn() }));

vi.mock('react-i18next', () => ({ useTranslation: mocks.useTranslation }));
vi.mock('next/link', () => ({ default: (props: React.ComponentProps<'a'>) => <a {...props} /> }));
vi.mock('lucide-react', () => {
  const Icon = (props: Record<string, unknown>) => <svg {...props} />;
  return { RefreshCw: Icon, Search: Icon, UserX: Icon };
});
vi.mock('@/components/ui/button', () => ({ Button: (props: React.ComponentProps<'button'>) => <button {...props} /> }));
vi.mock('@/components/shared/pagination', () => ({
  Pagination: (props: { currentPage: number; onPageChange: (page: number) => void }) => (
    <nav data-testid="pagination"><button type="button" onClick={() => props.onPageChange(props.currentPage + 1)}>staffConduct.paginationNext</button></nav>
  ),
}));
vi.mock('@/components/shared/empty-state', () => ({ EmptyState: (props: { title: string }) => <div>{props.title}</div> }));
vi.mock('@/components/providers/auth', () => ({ useAuth: mocks.useAuth }));
vi.mock('@/components/customer/chat-thread-panel', () => ({ ChatThreadPanel: () => <div /> }));
vi.mock('@/backend/domains/identity', () => ({ getMessages: mocks.getMessages }));
vi.mock('@/components/admin/admin-page-shell', () => ({ AdminMetricGrid: () => <div /> }));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: (props: React.PropsWithChildren) => <>{props.children}</>,
  DialogContent: (props: React.PropsWithChildren) => <div>{props.children}</div>,
  DialogHeader: (props: React.PropsWithChildren) => <div>{props.children}</div>,
  DialogTitle: (props: React.PropsWithChildren) => <h2>{props.children}</h2>,
}));

import { StaffConductPanel } from '@/components/admin/staff-conduct-panel';

const openFlag = {
  id: 'flag-1',
  flaggedAdminName: 'Staff Member',
  targetUserId: 'customer-1',
  targetUserName: 'Customer',
  source: 'ticket_reply' as const,
  sourceRefId: 'ticket-1',
  originalText: 'Original message',
  severity: 'medium' as const,
  status: 'open' as const,
  createdAt: '2026-11-12T00:00:00.000Z',
};

function queue(items = [
  { id: 'flag-1', kind: 'flagged_conduct', status: 'open', createdAt: openFlag.createdAt, data: openFlag },
]) {
  return {
    items,
    total: items.length,
    page: 1,
    pageSize: 15,
    totalPages: 1,
    metrics: { needsAction: 1, flaggedConduct: 1, reportedChat: 0, highSeverity: 0, reviewed: 0 },
  };
}

function response(body: unknown, ok = true) {
  return { ok, json: async () => body } as Response;
}

let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot> | undefined;
let document: TestDocument;
let container: TestElement;

function button(text: string) {
  return findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes(text));
}

async function render() {
  await act(async () => { root?.render(<StaffConductPanel />); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function click(element: TestElement) {
  await act(async () => { element.dispatchEvent(new TestEvent('click', { bubbles: true })); });
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function setSearch(value: string) {
  const input = findOne(container, (element) => element.tagName === 'INPUT' && element.getAttribute('aria-label') === 'staffConduct.filters.search');
  await act(async () => {
    Object.getOwnPropertyDescriptor(TestElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new TestEvent('input', { bubbles: true }));
  });
}

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import('react-dom/client'));
});

beforeEach(() => {
  mocks.fetch.mockReset();
  mocks.useTranslation.mockReturnValue({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } });
  mocks.useAuth.mockReturnValue({ currentUser: { id: 'admin-1' } });
  mocks.getMessages.mockReset();
  vi.stubGlobal('fetch', mocks.fetch);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = undefined;
  }
  document.body.removeChild(container);
  vi.unstubAllGlobals();
});

describe('StaffConductPanel recovery', () => {
  it('shows a retry action instead of an empty queue when the first load fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ error: { code: 'QUEUE_UNAVAILABLE' } }, false))
      .mockResolvedValueOnce(response({ data: queue() }));

    await render();

    expect(mocks.fetch).toHaveBeenCalled();
    expect(container.textContent).toContain('staffConduct.errors.load');
    expect(container.textContent).not.toContain('staffConduct.empty.title');
    await click(button('staffConduct.actions.retry'));
    expect(await findOne(container, (element) => element.textContent.includes('Original message'))).toBeTruthy();
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it('keeps the last records available with a retry action when a filtered refresh fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ data: queue() }))
      .mockResolvedValueOnce(response({ error: { code: 'QUEUE_UNAVAILABLE' } }, false))
      .mockResolvedValueOnce(response({ data: queue() }));

    await render();
    await setSearch('refund');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });

    expect(container.textContent).toContain('Original message');
    expect(container.textContent).toContain('staffConduct.errors.staleLoad');
    await click(button('staffConduct.actions.retry'));
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
    expect(container.textContent).toContain('Original message');
    expect(container.textContent).not.toContain('staffConduct.errors.staleLoad');
    expect(mocks.fetch).toHaveBeenCalledTimes(3);
  });

  it('keeps an open record visible and gives a retry path when marking it reviewed fails', async () => {
    mocks.fetch
      .mockResolvedValueOnce(response({ data: queue() }))
      .mockResolvedValueOnce(response({ error: { code: 'DB_ERROR' } }, false));

    await render();
    await click(button('staffConduct.actions.markReviewed'));

    expect(container.textContent).toContain('Original message');
    expect(container.textContent).toContain('staffConduct.errors.reviewFailed');
    expect(button('staffConduct.actions.markReviewed')).toBeTruthy();
  });

  it('resets the page for new filters and ignores a response from the prior search', async () => {
    let resolveOldSearch: ((value: Response) => void) | undefined;
    const oldSearch: { signal: AbortSignal | null } = { signal: null };
    const requestPages: string[] = [];
    mocks.fetch.mockImplementation((url: string, init?: RequestInit) => {
      const params = new URL(url, 'http://localhost').searchParams;
      requestPages.push(`${params.get('query')}:${params.get('page')}`);
      if (params.get('query') === 'old') {
        oldSearch.signal = init?.signal ?? null;
        return new Promise<Response>((resolve) => { resolveOldSearch = resolve; });
      }
      const item = params.get('query') === 'new'
        ? { ...openFlag, id: 'new-flag', originalText: 'New result' }
        : openFlag;
      const itemId = item.id;
      return Promise.resolve(response({ data: queue([{ id: itemId, kind: 'flagged_conduct', status: 'open', createdAt: item.createdAt, data: item }]) }));
    });

    await render();
    await click(button('staffConduct.paginationNext'));
    await setSearch('old');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
    expect(requestPages).toContain('old:1');

    await setSearch('new');
    expect(oldSearch.signal?.aborted).toBe(true);
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 260)); });
    expect(container.textContent).toContain('New result');
    expect(requestPages).toContain('new:1');

    await act(async () => {
      resolveOldSearch?.(response({ data: queue([{ id: 'old-flag', kind: 'flagged_conduct', status: 'open', createdAt: openFlag.createdAt, data: { ...openFlag, id: 'old-flag', originalText: 'Old result' } }]) }));
      await Promise.resolve();
    });
    expect(container.textContent).toContain('New result');
    expect(container.textContent).not.toContain('Old result');
  });
});
