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

const routerPush = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme: vi.fn() }),
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { name?: string }) => ({
      'command.title': 'Command Palette',
      'command.navigation': 'Navigation',
      'command.actions': 'Quick Actions',
      'command.preferences': 'Preferences',
      'command.pendingQueue': 'Pending {{name}}',
      'command.unreadQueue': 'Unread {{name}}',
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
      'navigation.Business profile': 'Profile',
      'navigation.Redemptions': 'Redemptions',
      'navigation.Scanner': 'Scanner',
      'navigation.Operations': 'Operations',
      'navigation.Shop page': 'Shop page',
      'navigation.Inbox': 'Inbox',
      'navigation.Analytics': 'Analytics',
      'ui.products.addProduct': 'Add Product',
      'ui.bookings.addSlot': 'Add Booking Slot',
      'ui.vouchers.createVoucher': 'Create Voucher',
      'theme.dark': 'Dark mode',
    } as Record<string, string>)[key]?.replace('{{name}}', options?.name ?? '') ?? key,
  }),
}));

vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => React.createElement(React.Fragment, null, children),
  DialogContent: ({ children }: { children: React.ReactNode }) => React.createElement('div', { role: 'dialog' }, children),
  DialogTitle: ({ children }: { children: React.ReactNode }) => React.createElement('h2', null, children),
}));

import { GlobalCommandPalette } from '../global-command-palette';
import { getCommandShortcutLabel } from '../command-shortcut';
import { LayoutDashboard } from 'lucide-react';

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

  it('lists Vendor Owner sidebar destinations and opens supported create actions', async () => {
    routerPush.mockClear();
    await render(React.createElement(GlobalCommandPalette, {
      scope: 'vendor',
      isOutletManager: false,
      triggerOpen: true,
      onOpenChange: vi.fn(),
    }));

    for (const title of ['Dashboard', 'Outlets', 'Profile', 'Products', 'Bookings', 'Redemptions', 'Vouchers', 'Orders', 'Wallet', 'Inbox', 'Analytics']) {
      expect(container.textContent).toContain(title);
    }
    expect(container.textContent).not.toContain('Scanner');
    expect(container.textContent).not.toContain('Shop page');
    expect(container.textContent).not.toContain('Add Product');

    const addSlot = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Add Booking Slot'));
    await act(async () => {
      addSlot.dispatchEvent(new TestEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(routerPush).toHaveBeenCalledWith('/vendor/bookings?create=1');

    const createVoucher = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Create Voucher'));
    await act(async () => {
      createVoucher.dispatchEvent(new TestEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(routerPush).toHaveBeenCalledWith('/vendor/vouchers?create=1');
  });

  it('lists Outlet Manager sidebar destinations and only its allowed create actions', async () => {
    routerPush.mockClear();
    await render(React.createElement(GlobalCommandPalette, {
      scope: 'vendor',
      isOutletManager: true,
      triggerOpen: true,
      onOpenChange: vi.fn(),
    }));

    for (const title of ['Operations', 'Shop page', 'Products', 'Bookings', 'Scanner', 'Vouchers', 'Orders', 'Inbox', 'Analytics', 'Add Product']) {
      expect(container.textContent).toContain(title);
    }
    expect(container.textContent).not.toContain('Outlets');
    expect(container.textContent).not.toContain('Wallet');
    expect(container.textContent).not.toContain('Profile');

    const shopPage = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Shop page'));
    await act(async () => {
      shopPage.dispatchEvent(new TestEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(routerPush).toHaveBeenCalledWith('/vendor/outlets?mode=shop');

    const addProduct = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Add Product'));
    await act(async () => {
      addProduct.dispatchEvent(new TestEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(routerPush).toHaveBeenCalledWith('/vendor/products?create=1');
  });

  it('adds Admin queue shortcuts only for authorized visible queues with pending items', async () => {
    await render(React.createElement(GlobalCommandPalette, {
      scope: 'admin',
      triggerOpen: true,
      onOpenChange: vi.fn(),
      navigationItems: [
        { id: 'kyc', title: 'KYC', category: 'Compliance', href: '/admin/kyc', icon: LayoutDashboard, badge: 3 },
        { id: 'support', title: 'Support', category: 'Communication', href: '/admin/support', icon: LayoutDashboard, badge: 0 },
      ],
    }));

    expect(container.textContent).toContain('Pending KYC');
    expect(container.textContent).not.toContain('Unread Support');
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
