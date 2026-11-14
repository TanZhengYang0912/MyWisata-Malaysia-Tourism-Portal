import { act, type PropsWithChildren } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findOne, installTestDom, TestElement, TestEvent, type TestDocument } from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({ statsFail: false, docsFail: false }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({
  t: (key: string) => key,
  i18n: {
    resolvedLanguage: 'en',
    exists: (key: string) => ['account', 'affiliate', 'booking', 'general', 'payment', 'rewards', 'vendor', 'wallet', 'withdrawal']
      .some((category) => key === `chatbot.categories.${category}`),
  },
}) }));
vi.mock('@/components/providers/action-feedback', () => ({ useActionFeedback: () => ({ showFeedback: vi.fn() }) }));
vi.mock('@/components/admin/admin-page-shell', () => ({
  AdminPageShell: ({ children }: PropsWithChildren) => <main>{children}</main>,
  AdminPageHeader: ({ title }: { title: string }) => <h1>{title}</h1>,
  AdminMetricGrid: ({ items }: { items: Array<{ label: string; value: string | number }> }) => <div>{items.map((item) => <span key={item.label}>{item.label}:{item.value}</span>)}</div>,
}));
vi.mock('@/components/admin/batch-action-bar', () => ({ AdminBatchActionBar: () => null }));
vi.mock('@/components/shared/pagination', () => ({ Pagination: () => null }));

import AdminChatbotPage from '../page';

let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
let fetchMock: ReturnType<typeof vi.fn>;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  mocks.statsFail = false;
  mocks.docsFail = false;
  fetchMock = vi.fn(async (input: string) => {
    if (input.startsWith('/api/admin/chatbot/stats')) {
      if (mocks.statsFail) return Response.json({ data: null }, { status: 503 });
      return Response.json({ data: {
        totalQuestions: 2, answeredCount: 1, answerRate: 0.5,
        topCommon: [{ question: 'How do refunds work?', count: 2, lastAskedAt: '2026-11-10T00:00:00Z' }], topUnanswered: [],
        notHelpfulAnswered: [], escalationRate: 0.5, topEscalated: [], pairedUnansweredCount: 2,
        legacyUnpairedCount: 0, range: { from: '2026-11-01T00:00:00Z', to: '2026-11-11T00:00:00Z' },
      } });
    }
    if (input.startsWith('/api/admin/chatbot/kb/draft')) {
      return Response.json({ data: { title: 'Refunds', body: '[ADMIN: confirm policy]', keywords: ['refund'], category: 'payment' } });
    }
    if (input.startsWith('/api/admin/chatbot/kb')) {
      if (mocks.docsFail) return Response.json({ data: null }, { status: 503 });
      return Response.json({ data: { documents: [], page: 1, pageSize: 10, total: 0, totalPages: 1 } });
    }
    return Response.json({ data: null });
  });
  vi.stubGlobal('fetch', fetchMock);
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); vi.unstubAllGlobals(); });
async function render() { await act(async () => { root.render(<AdminChatbotPage />); }); }
async function clickButton(label: string) {
  const button = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes(label));
  await act(async () => { button.dispatchEvent(new TestEvent('click', { bubbles: true })); });
}

describe('admin chatbot independent loading recovery', () => {
  it('keeps the knowledge base available when stats fail and retries stats alone', async () => {
    mocks.statsFail = true;
    await render();

    expect(container.textContent).toContain('chatbot.errors.loadTitle');
    expect(container.textContent).toContain('chatbot.knowledgeBase');
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/admin/chatbot/kb'))).toBe(true);
    const kbRequestCount = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/admin/chatbot/kb')).length;

    mocks.statsFail = false;
    await clickButton('chatbot.errors.retry');

    expect(container.textContent).toContain('chatbot.metrics.questions:2');
    expect(fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/admin/chatbot/kb'))).toHaveLength(kbRequestCount);
  });

  it('keeps report metrics and the new-draft entry available when the KB list fails', async () => {
    mocks.docsFail = true;
    await render();

    expect(container.textContent).toContain('chatbot.metrics.questions:2');
    expect(container.textContent).toContain('chatbot.errors.loadDocsTitle');
    expect(container.textContent).toContain('chatbot.actions.newDoc');
    expect(fetchMock.mock.calls.some(([url]) => String(url).startsWith('/api/admin/chatbot/stats'))).toBe(true);

    mocks.docsFail = false;
    await clickButton('chatbot.errors.retry');
    expect(container.textContent).not.toContain('chatbot.errors.loadDocsTitle');
    expect(container.textContent).toContain('chatbot.metrics.questions:2');
  });

  it('uses a fresh operation ID for the next draft after a confirmed success', async () => {
    await render();

    await clickButton('chatbot.actions.aiDraft');
    await clickButton('chatbot.actions.aiDraft');

    const draftRequests = fetchMock.mock.calls.filter(([url]) => String(url).startsWith('/api/admin/chatbot/kb/draft'));
    expect(draftRequests).toHaveLength(2);
    const operationIds = draftRequests.map(([, init]) => JSON.parse(String(init?.body)).operationId);
    expect(operationIds[0]).not.toBe(operationIds[1]);
  });
});
