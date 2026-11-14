import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findElements, installTestDom, type TestDocument, type TestElement, type TestNode } from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({
  ticketId: '10000000-0000-4000-8000-000000000001',
  fetch: vi.fn(),
}));

vi.mock('next/navigation', () => ({ useParams: () => ({ id: mocks.ticketId }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'en' } }) }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: { id: 'customer-1' } }) }));
vi.mock('@/components/providers/action-feedback', () => ({ useActionFeedback: () => ({ showFeedback: vi.fn() }) }));
vi.mock('@/hooks/use-speech-input', () => ({
  useSpeechInput: () => ({ error: null, isSupported: false, isListening: false, start: vi.fn(), stop: vi.fn() }),
  resolveRecognitionLangFromLocale: () => 'en',
}));
vi.mock('@/components/shared/empty-state', () => ({ EmptyState: ({ title, description, action }: { title: string; description: string; action?: React.ReactNode }) => <section>{title}{description}{action}</section> }));
vi.mock('@/components/ui/button', () => ({ Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => <button {...props}>{children}</button> }));
vi.mock('@/components/shared/ticket-thread', () => ({ TicketThread: ({ ticketBody, replies }: { ticketBody: string; replies: Array<{ id: string; body: string }> }) => <section><p>{ticketBody}</p>{replies.map((reply) => <p key={reply.id}>{reply.body}</p>)}</section> }));
vi.mock('@/components/shared/report-chat-button', () => ({ ReportChatButton: () => null }));

import CustomerTicketDetailPage from '../page';

const firstTicketId = '10000000-0000-4000-8000-000000000001';
const slowTicketId = '10000000-0000-4000-8000-000000000002';
const currentTicketId = '10000000-0000-4000-8000-000000000003';

function ticket(id: string, name: string) {
  return {
    id,
    viewerIsOwner: true,
    subject: name,
    body: `${name} body`,
    category: 'general',
    status: 'open',
    createdAt: '2026-04-01T00:00:00.000Z',
    resolvedAt: null,
    muted: false,
    replies: [{ id, is_mine: false, sender_role: 'admin', body: `${name} reply`, created_at: '2026-04-01T00:01:00.000Z', attachment_type: null }],
    repliesCursor: null,
  };
}

let document: TestDocument;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: HTMLElement;
let resolveSlowTicket!: (response: Response) => void;
let slowTicketRequest: Promise<Response>;
const readRequests: string[] = [];
const readRequestBodies: string[] = [];
const ticketReads: string[] = [];

function getLinkHrefs() {
  return findElements(container as unknown as TestElement, (node) => node.tagName === 'A')
    .map((link) => link.getAttribute('href'));
}

function mockTicketLoadFailure(status: number, code: string) {
  mocks.fetch.mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);
    if (url.startsWith('/api/support/tickets/')) {
      return Promise.resolve(Response.json({ data: null, error: { code } }, { status }));
    }
    if (url.startsWith('/api/support/drafts')) return Promise.resolve(Response.json({ data: { body: '', version: 0 } }));
    throw new Error(`Unexpected fetch ${url}`);
  });
}

beforeAll(async () => {
  document = installTestDom();
  ({ createRoot } = await import('react-dom/client'));
});

beforeEach(() => {
  mocks.ticketId = firstTicketId;
  readRequests.length = 0;
  readRequestBodies.length = 0;
  ticketReads.length = 0;
  slowTicketRequest = new Promise((resolve) => { resolveSlowTicket = resolve; });
  mocks.fetch.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/support/tickets/') && !url.includes('/read') && !url.includes('/replies')) ticketReads.push(url);
    if (url.includes('/read')) {
      readRequests.push(url);
      readRequestBodies.push(String(init?.body ?? ''));
      return Promise.resolve(Response.json({ data: null, error: { code: 'READ_UNAVAILABLE' } }, { status: 503 }));
    }
    if (url.startsWith('/api/support/drafts')) return Promise.resolve(Response.json({ data: { body: '', version: 0 } }));
    if (url === `/api/support/tickets/${firstTicketId}`) return Promise.resolve(Response.json({ data: ticket(firstTicketId, 'First ticket') }));
    if (url === `/api/support/tickets/${slowTicketId}`) return slowTicketRequest;
    if (url === `/api/support/tickets/${currentTicketId}`) return Promise.resolve(Response.json({ data: ticket(currentTicketId, 'Current ticket') }));
    throw new Error(`Unexpected fetch ${url}`);
  });
  vi.stubGlobal('fetch', mocks.fetch);
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
  container = document.createElement('div') as unknown as HTMLElement;
  document.body.appendChild(container as unknown as TestNode);
  root = createRoot(container);
});

afterEach(async () => {
  resolveSlowTicket(Response.json({ data: ticket(slowTicketId, 'Slow ticket') }));
  await act(async () => root.unmount());
  document.body.removeChild(container as unknown as TestNode);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Customer support ticket detail navigation', () => {
  it('offers sign-in after the ticket request expires instead of a useless retry', async () => {
    mockTicketLoadFailure(401, 'UNAUTHORIZED');

    await act(async () => {
      root.render(<CustomerTicketDetailPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(getLinkHrefs()).toContain(`/login?next=${encodeURIComponent(`/customer/support/${firstTicketId}`)}`));
    expect(container.textContent).toContain('chatbot.supportErrors.signIn');
  });

  it.each([[403, 'FORBIDDEN'], [404, 'NOT_FOUND']] as const)('offers the ticket list when access is denied (%s)', async (status, code) => {
    mockTicketLoadFailure(status, code);

    await act(async () => {
      root.render(<CustomerTicketDetailPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(getLinkHrefs()).toContain('/customer/support'));
    expect(container.textContent).toContain('ui.support.ticketNotFound');
  });

  it('hides the previous ticket and ignores a slow response after route change', async () => {
    await act(async () => {
      root.render(<CustomerTicketDetailPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(container.textContent).toContain('First ticket body'));
    await vi.waitFor(() => expect(readRequests).toHaveLength(1));
    expect(JSON.parse(readRequestBodies[0])).toEqual({ surface: 'customer', lastDisplayedReplyId: firstTicketId });

    await act(async () => {
      mocks.ticketId = slowTicketId;
      root.render(<CustomerTicketDetailPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(ticketReads).toContain(`/api/support/tickets/${slowTicketId}`));
    expect(container.textContent).not.toContain('First ticket body');
    expect(readRequests).toHaveLength(1);

    await act(async () => {
      mocks.ticketId = currentTicketId;
      root.render(<CustomerTicketDetailPage />);
      await Promise.resolve();
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(container.textContent).toContain('Current ticket body'));

    await act(async () => {
      resolveSlowTicket(Response.json({ data: ticket(slowTicketId, 'Slow ticket') }));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.textContent).toContain('Current ticket body');
    expect(container.textContent).not.toContain('Slow ticket body');
  });
});
