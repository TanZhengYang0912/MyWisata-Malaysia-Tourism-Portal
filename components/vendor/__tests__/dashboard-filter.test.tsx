import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { findElements, installTestDom, TestEvent, type TestElement } from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({ query: '', push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams(mocks.query),
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/select', () => {
  type ItemProps = { value: string; children: React.ReactNode };
  type TriggerProps = { 'aria-label'?: string; children: React.ReactNode };
  type SelectProps = { value: string; onValueChange: (value: string) => void; children: React.ReactNode };
  const SelectTrigger = (_props: TriggerProps) => null;
  const SelectContent = (_props: { children: React.ReactNode }) => null;
  const SelectItem = (_props: ItemProps) => null;
  const SelectValue = () => null;

  function Select({ value, onValueChange, children }: SelectProps) {
    const parts = React.Children.toArray(children) as React.ReactElement[];
    const trigger = parts.find((part) => part.type === SelectTrigger) as React.ReactElement<TriggerProps> | undefined;
    const content = parts.find((part) => part.type === SelectContent) as React.ReactElement<{ children: React.ReactNode }> | undefined;
    const items = React.Children.toArray(content?.props.children) as React.ReactElement<ItemProps>[];
    const selected = items.find((item) => item.props.value === value);

    return (
      <div data-selected-value={value}>
        <button type="button" aria-label={trigger?.props['aria-label']}>{selected?.props.children}</button>
        <div hidden>{items.map((item) => (
          <button key={item.props.value} type="button" data-option-value={item.props.value} onClick={() => onValueChange(item.props.value)}>{item.props.children}</button>
        ))}</div>
      </div>
    );
  }

  return { Select, SelectTrigger, SelectContent, SelectItem, SelectValue };
});
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
const options = () => findElements(container, element => element.getAttribute('data-option-value') !== null);
const selectedValues = () => findElements(container, element => element.getAttribute('data-selected-value') !== null).map(element => element.getAttribute('data-selected-value'));

it('preserves custom dates when switching sales mode and demo mode when switching preset dates', async () => {
  await act(async () => { root.render(<DashboardFilter />); });
  const live = options().find(option => option.getAttribute('data-option-value') === 'live')!;
  await act(async () => { live.dispatchEvent(new TestEvent('click', { bubbles: true })); });
  const liveParams = new URLSearchParams(mocks.push.mock.calls[0][0].slice(1));
  expect(liveParams.get('sales')).toBe('live');
  expect(liveParams.get('from')).toBe('2026-10-01');
  expect(liveParams.get('to')).toBe('2026-10-20');

  const today = options().find(option => option.getAttribute('data-option-value') === 'today')!;
  await act(async () => { today.dispatchEvent(new TestEvent('click', { bubbles: true })); });
  const todayParams = new URLSearchParams(mocks.push.mock.calls[1][0].slice(1));
  expect(todayParams.get('sales')).toBe('demo');
  expect(todayParams.get('filter')).toBe('today');
});

it('retains demo mode when applying custom dates', async () => {
  await act(async () => { root.render(<DashboardFilter />); });
  const form = findElements(container, element => element.tagName === 'FORM')[0];
  await act(async () => { form.dispatchEvent(new TestEvent('submit', { bubbles: true })); });
  const params = new URLSearchParams(mocks.push.mock.calls[0][0].slice(1));
  expect(Object.fromEntries(params)).toEqual({ filter: 'custom', from: '2026-10-01', to: '2026-10-20', sales: 'demo' });
});

it('marks all activity as selected for missing or malformed modes', async () => {
  for (const query of ['filter=30d', 'sales=all', 'sales=demo&sales=live']) {
    mocks.query = query;
    await act(async () => { root.render(<DashboardFilter />); });
    expect(selectedValues()).toEqual(['all', '30d']);
  }
});

it('shows compact sales and period controls with an accessible custom-date action', async () => {
  await act(async () => { root.render(<DashboardFilter />); });
  const labels = findElements(container, element => element.getAttribute('aria-label') !== null)
    .map(element => element.getAttribute('aria-label'));
  expect(labels).toEqual(['ui.dashboard.salesScope', 'filters.dateRange', 'filters.custom']);
});

it('does not navigate when the selected sales mode and period are chosen again', async () => {
  mocks.query = 'filter=30d&sales=all';
  await act(async () => { root.render(<DashboardFilter />); });
  for (const value of ['all', '30d']) {
    const option = options().find(item => item.getAttribute('data-option-value') === value)!;
    await act(async () => { option.dispatchEvent(new TestEvent('click', { bubbles: true })); });
  }
  expect(mocks.push).not.toHaveBeenCalled();
});
