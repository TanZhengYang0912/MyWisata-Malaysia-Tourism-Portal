import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findElements, installTestDom, TestEvent, type TestElement } from '@/components/shared/__tests__/render-test-dom';

vi.mock('lucide-react', () => ({ ChevronDown: (props: Record<string, unknown>) => <svg {...props} />, Search: (props: Record<string, unknown>) => <svg {...props} />, SlidersHorizontal: (props: Record<string, unknown>) => <svg {...props} />, X: (props: Record<string, unknown>) => <svg {...props} /> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => key }) }));

import CompactFilterBar from '@/components/vendor/compact-filter-bar';

let document: ReturnType<typeof installTestDom>;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;

beforeAll(async () => { document = installTestDom(); ({ createRoot } = await import('react-dom/client')); });
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(() => { act(() => root.unmount()); document.body.removeChild(container); });

describe('CompactFilterBar mobile filters', () => {
  it('keeps search visible and exposes collapsed filters behind an accessible toggle', async () => {
    const onClear = vi.fn();
    await act(async () => {
      root.render(<CompactFilterBar
        search=""
        onSearchChange={() => undefined}
        onClear={onClear}
        collapsibleOnMobile
        selects={[{ value: 'active', placeholder: 'ui.outlets.allStatuses', options: [{ value: 'active', label: 'ui.status.active' }], onChange: () => undefined }]}
      />);
    });

    expect(findElements(container, (element) => element.tagName === 'INPUT')).toHaveLength(1);
    const toggle = findElements(container, (element) => element.tagName === 'BUTTON' && element.getAttribute('aria-controls') === 'vendor-mobile-filters')[0];
    expect(toggle?.getAttribute('aria-expanded')).toBe('false');
    expect(toggle?.textContent).toContain('1');
    const filterPanel = findElements(container, (element) => element.getAttribute('id') === 'vendor-mobile-filters')[0];
    expect(filterPanel?.getAttribute('class')).toContain('hidden');

    await act(async () => { toggle.dispatchEvent(new TestEvent('click', { bubbles: true })); });
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(filterPanel.getAttribute('class')).toContain('flex');
    expect(findElements(container, (element) => element.tagName === 'SELECT')).toHaveLength(1);
    const clear = findElements(container, (element) => element.tagName === 'BUTTON' && element.getAttribute('aria-label') === 'filters.clear')[0];
    await act(async () => { clear.dispatchEvent(new TestEvent('click', { bubbles: true })); });
    expect(onClear).toHaveBeenCalledOnce();
  });

  it('does not render the mobile disclosure when the accepted inline mode is used', async () => {
    await act(async () => { root.render(<CompactFilterBar search="" onSearchChange={() => undefined} />); });
    expect(findElements(container, (element) => element.getAttribute('aria-controls') === 'vendor-mobile-filters')).toHaveLength(0);
  });

  it('renders quick tabs as pressed toggle buttons and reports the chosen value', async () => {
    const onChange = vi.fn();
    await act(async () => {
      root.render(<CompactFilterBar
        search=""
        onSearchChange={() => undefined}
        tabs={{ options: [{ value: '', label: 'All' }, { value: 'active', label: 'Active' }], value: '', onChange }}
      />);
    });

    const group = findElements(container, (element) => element.getAttribute('role') === 'group')[0];
    expect(group).toBeDefined();
    const tabs = findElements(group, (element) => element.tagName === 'BUTTON');
    expect(tabs.map((tab) => tab.getAttribute('aria-pressed'))).toEqual(['true', 'false']);
    await act(async () => { tabs[1].dispatchEvent(new TestEvent('click', { bubbles: true })); });
    expect(onChange).toHaveBeenCalledWith('active');
  });

  it('does not count a select left at its default value as an active filter', async () => {
    await act(async () => {
      root.render(<CompactFilterBar
        search=""
        onSearchChange={() => undefined}
        onClear={() => undefined}
        collapsibleOnMobile
        selects={[{ value: 'newest', neutralValue: 'newest', placeholder: 'ui.products.sortBy', options: [{ value: 'newest', label: 'Newest' }], onChange: () => undefined }]}
      />);
    });

    const toggle = findElements(container, (element) => element.getAttribute('aria-controls') === 'vendor-mobile-filters')[0];
    expect(toggle?.textContent).not.toMatch(/\d/);
    expect(findElements(container, (element) => element.getAttribute('aria-label') === 'filters.clear')).toHaveLength(0);
  });

  it('opens panel-mode filters on demand at every width and notifies the owner', async () => {
    const onOpenChange = vi.fn();
    await act(async () => {
      root.render(<CompactFilterBar
        search=""
        onSearchChange={() => undefined}
        filterMode="panel"
        filtersId="order-filters"
        filters={<p>advanced</p>}
        onFiltersOpenChange={onOpenChange}
      />);
    });

    const toggle = findElements(container, (element) => element.getAttribute('aria-controls') === 'order-filters')[0];
    expect(toggle.getAttribute('class')).not.toContain('lg:hidden');
    expect(findElements(container, (element) => element.getAttribute('id') === 'order-filters')).toHaveLength(0);
    await act(async () => { toggle.dispatchEvent(new TestEvent('click', { bubbles: true })); });
    expect(onOpenChange).toHaveBeenCalledWith(true);
    expect(findElements(container, (element) => element.getAttribute('id') === 'order-filters')[0]?.textContent).toContain('advanced');
  });

});
