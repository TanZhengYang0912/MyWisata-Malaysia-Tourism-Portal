import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  findElements,
  findOne,
  installTestDom,
  TestElement,
  TestEvent,
  type TestDocument,
} from '@/components/shared/__tests__/render-test-dom';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'command.title': 'Command Palette',
      'command.navigation': 'Navigation',
      'command.actions': 'Quick Actions',
      'command.preferences': 'Preferences',
      'command.noResults': 'No results',
      'command.navigate': 'to navigate',
      'command.select': 'to select',
      'command.searchVendorPlaceholder': 'Search',
      'keyboard.esc': 'ESC',
      'brand.speed': 'Speed',
      'navigation.Dashboard': 'Dashboard',
      'navigation.Bookings': 'Bookings',
      'navigation.Orders': 'Orders',
      'navigation.Products': 'Products',
      'navigation.Outlets': 'Outlets',
      'navigation.Vouchers': 'Vouchers',
      'navigation.Wallet': 'Wallet',
      'ui.products.addProduct': 'Add Product',
      'ui.bookings.addSlot': 'Add Booking Slot',
      'theme.dark': 'Dark mode',
    } as Record<string, string>)[key] ?? key,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', { role: 'dialog' }, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
}));

import { GlobalCommandPalette } from '../global-command-palette';
import { getCommandShortcutLabel } from '../command-shortcut';

let createRoot: typeof import('react-dom/client').createRoot;
let document: TestDocument;
let container: TestElement;
let root: ReturnType<typeof createRoot>;
const scrollIntoView = vi.fn();

async function render(element: React.ReactElement) {
  await act(async () => {
    root.render(element);
    await Promise.resolve();
  });
}

beforeAll(async () => {
  document = installTestDom();
  Object.defineProperty(TestElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: scrollIntoView,
  });
  ({ createRoot } = await import('react-dom/client'));
});

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});

afterEach(() => {
  act(() => root.unmount());
  document.body.removeChild(container);
  scrollIntoView.mockClear();
});

describe('GlobalCommandPalette contract', () => {
  it('exports GlobalCommandPalette as a function', () => {
    expect(typeof GlobalCommandPalette).toBe('function');
  });

  it('uses a platform-appropriate shortcut label', () => {
    expect(getCommandShortcutLabel('MacIntel')).toBe('⌘K');
    expect(getCommandShortcutLabel('Win32')).toBe('Ctrl K');
    expect(getCommandShortcutLabel('Linux x86_64')).toBe('Ctrl K');
  });

  it('scrolls the newly selected result into view while using arrow navigation', async () => {
    await render(React.createElement(GlobalCommandPalette, { scope: 'vendor', triggerOpen: true, onOpenChange: vi.fn() }));
    scrollIntoView.mockClear();

    const input = findOne(container, (element) => element.tagName === 'INPUT');
    await act(async () => {
      for (let index = 0; index < 5; index += 1) {
        input.dispatchEvent(Object.assign(new TestEvent('keydown', { bubbles: true }), { key: 'ArrowDown' }));
      }
      await Promise.resolve();
    });

    const buttons = findElements(container, (element) => element.tagName === 'BUTTON');
    expect(buttons[5].className).toContain('bg-primary');
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'nearest' });
  });

  it('reserves space for the dialog close control beside the escape hint', async () => {
    await render(React.createElement(GlobalCommandPalette, { scope: 'vendor', triggerOpen: true, onOpenChange: vi.fn() }));

    const input = findOne(container, (element) => element.tagName === 'INPUT');
    const inputHeader = input.parentNode as TestElement;
    const escapeHint = findOne(inputHeader, (element) => element.tagName === 'KBD');

    expect(inputHeader.className).toContain('pr-20');
    expect(escapeHint.className).toContain('shrink-0');
  });
});
