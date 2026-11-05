import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { findElements, installTestDom, TestEvent, type TestElement } from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({ query: '', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('next/link', () => ({ default: ({ href, children, ...props }: React.ComponentProps<'a'>) => <a href={href} {...props}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
import DashboardFilter from '@/components/vendor/dashboard-filter';

let document: ReturnType<typeof installTestDom>;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  mocks.push.mockReset();
  mocks.query = 'filter=custom&from=2026-10-01&to=2026-10-20&sales=demo';
  container = document.createElement('div'); document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });
const links = () => findElements(container, element => element.tagName === 'A');

it('preserves custom dates when switching sales mode and demo mode when switching preset dates', async () => {
  await act(async () => { root.render(<DashboardFilter />); });
  const live = links().find(link => link.textContent === 'ui.dashboard.salesMode.live')!;
  expect(new URLSearchParams(live.getAttribute('href')!.slice(1)).get('sales')).toBe('live');
  expect(live.getAttribute('href')).toContain('from=2026-10-01');
  expect(live.getAttribute('href')).toContain('to=2026-10-20');
  const demo = links().find(link => link.textContent === 'ui.dashboard.salesMode.demo')!;
  expect(demo.getAttribute('aria-current')).toBe('page');
  const today = links().find(link => link.textContent === 'filters.today')!;
  expect(new URLSearchParams(today.getAttribute('href')!.slice(1)).get('sales')).toBe('demo');
  expect(new URLSearchParams(today.getAttribute('href')!.slice(1)).get('filter')).toBe('today');
});

it('retains demo mode when applying custom dates', async () => {
  await act(async () => { root.render(<DashboardFilter />); });
  const form = findElements(container, element => element.tagName === 'FORM')[0];
  await act(async () => { form.dispatchEvent(new TestEvent('submit', { bubbles: true })); });
  const params = new URLSearchParams(mocks.push.mock.calls[0][0].slice(1));
  expect(Object.fromEntries(params)).toEqual({ filter: 'custom', from: '2026-10-01', to: '2026-10-20', sales: 'demo' });
});

it('marks real sales as selected for missing or malformed modes', async () => {
  for (const query of ['filter=30d', 'sales=all', 'sales=demo&sales=live']) {
    mocks.query = query;
    await act(async () => { root.render(<DashboardFilter />); });
    expect(links().find(link => link.textContent === 'ui.dashboard.salesMode.live')?.getAttribute('aria-current')).toBe('page');
    expect(links().find(link => link.textContent === 'ui.dashboard.salesMode.demo')?.getAttribute('aria-current')).not.toBe('page');
  }
});
