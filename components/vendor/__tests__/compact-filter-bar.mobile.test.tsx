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

});
