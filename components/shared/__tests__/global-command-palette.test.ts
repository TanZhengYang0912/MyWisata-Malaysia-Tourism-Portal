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
const setTheme = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
}));

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: 'light', setTheme }),
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
      'navigation.Announcements': 'Announcements',
      'navigation.Promotions': 'Promote Event',
      'navigation.Events': 'Events',
      'navigation.Reservations': 'Reservations',
      'navigationSections.communication': 'Communication',
      'navigationSections.workspace': 'Workspace',
      'navigationSections.operations': 'Operations',
      'navigationSections.finance': 'Finance',
      'navigationSections.insights': 'Insights',
      'navigationSections.promotion': 'Promotion',
      'ui.products.addProduct': '+ Add New Product',
      'ui.bookings.addSlot': '+ Add Booking Slot',
      'ui.vouchers.createVoucher': 'Create voucher',
      'theme.dark': 'Dark Theme',
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

  it('routes every Vendor Owner command to its matching page or action', async () => {
    routerPush.mockClear();
    setTheme.mockClear();
    await render(React.createElement(GlobalCommandPalette, {
      scope: 'vendor',
      isOutletManager: false,
      triggerOpen: true,
      onOpenChange: vi.fn(),
    }));

    const destinations = [
      ['Announcements', 'Communication', '/vendor/announcements'],
      ['Inbox', 'Communication', '/vendor/inbox'],
      ['Dashboard', 'Workspace', '/vendor/dashboard'],
      ['Outlets', 'Workspace', '/vendor/outlets'],
      ['Profile', 'Workspace', '/vendor/profile'],
      ['Products', 'Operations', '/vendor/products'],
      ['Bookings', 'Operations', '/vendor/bookings'],
      ['Redemptions', 'Operations', '/vendor/redemptions'],
      ['Vouchers', 'Operations', '/vendor/vouchers'],
      ['Orders', 'Operations', '/vendor/orders'],
      ['Wallet', 'Finance', '/vendor/wallet'],
      ['Analytics', 'Insights', '/vendor/analytics'],
      ['Promote Event', 'Promotion', '/vendor/event-promotions'],
      ['Events', 'Promotion', '/vendor/events'],
      ['Reservations', 'Promotion', '/vendor/event-orders'],
      ['+ Add Booking Slot', 'Quick Actions', '/vendor/bookings?create=1'],
      ['Create voucher', 'Quick Actions', '/vendor/vouchers?create=1'],
    ];
    expect(findElements(container, (element) => element.tagName === 'BUTTON')).toHaveLength(destinations.length + 1);
    for (const [title, category] of destinations) {
      const option = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes(title));
      expect(option.textContent).toContain(category);
      await act(async () => {
        option.dispatchEvent(new TestEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
    }
    expect(routerPush.mock.calls.map(([href]) => href)).toEqual(destinations.map(([, , href]) => href));
    expect(container.textContent).not.toContain('Scanner');
    expect(container.textContent).not.toContain('Shop page');
    expect(container.textContent).not.toContain('Add New Product');

    const themeOption = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Dark Theme'));
    await act(async () => {
      themeOption.dispatchEvent(new TestEvent('click', { bubbles: true }));
      await Promise.resolve();
    });
    expect(themeOption.textContent).toContain('Preferences');
    expect(setTheme).toHaveBeenCalledWith('dark');
  });

  it('routes every Outlet Manager command to its matching page or action', async () => {
    routerPush.mockClear();
    await render(React.createElement(GlobalCommandPalette, {
      scope: 'vendor',
      isOutletManager: true,
      triggerOpen: true,
      onOpenChange: vi.fn(),
    }));

    const destinations = [
      ['Announcements', 'Communication', '/vendor/announcements'],
      ['Inbox', 'Communication', '/vendor/inbox'],
      ['Operations', 'Workspace', '/vendor/dashboard'],
      ['Shop page', 'Workspace', '/vendor/outlets?mode=shop'],
      ['Products', 'Operations', '/vendor/products'],
      ['Bookings', 'Operations', '/vendor/bookings'],
      ['Scanner', 'Operations', '/vendor/scanner'],
      ['Vouchers', 'Operations', '/vendor/vouchers'],
      ['Orders', 'Operations', '/vendor/orders'],
      ['Analytics', 'Insights', '/vendor/analytics'],
      ['+ Add New Product', 'Quick Actions', '/vendor/products?create=1'],
      ['+ Add Booking Slot', 'Quick Actions', '/vendor/bookings?create=1'],
      ['Create voucher', 'Quick Actions', '/vendor/vouchers?create=1'],
    ];
    expect(findElements(container, (element) => element.tagName === 'BUTTON')).toHaveLength(destinations.length + 1);
    for (const [title, category] of destinations) {
      const option = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes(title));
      expect(option.textContent).toContain(category);
      await act(async () => {
        option.dispatchEvent(new TestEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
    }
    expect(routerPush.mock.calls.map(([href]) => href)).toEqual(destinations.map(([, , href]) => href));
    expect(container.textContent).not.toContain('Outlets');
    expect(container.textContent).not.toContain('Wallet');
    expect(container.textContent).not.toContain('Profile');
  });

  it('shows only event vendor destinations and no shop creation shortcuts', async () => {
    routerPush.mockClear();
    await render(React.createElement(GlobalCommandPalette, {
      scope: 'vendor',
      isEventVendor: true,
      triggerOpen: true,
      onOpenChange: vi.fn(),
    }));

    const destinations = [
      ['Announcements', 'Communication', '/vendor/announcements'],
      ['Events', 'Workspace', '/vendor/events'],
      ['Reservations', 'Operations', '/vendor/event-orders'],
      ['Scanner', 'Operations', '/vendor/scanner'],
      ['Wallet', 'Finance', '/vendor/wallet'],
    ];
    expect(findElements(container, (element) => element.tagName === 'BUTTON')).toHaveLength(destinations.length + 1);
    for (const [title, category] of destinations) {
      const option = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes(title));
      expect(option.textContent).toContain(category);
      await act(async () => {
        option.dispatchEvent(new TestEvent('click', { bubbles: true }));
        await Promise.resolve();
      });
    }
    expect(routerPush.mock.calls.map(([href]) => href)).toEqual(destinations.map(([, , href]) => href));
    expect(container.textContent).not.toContain('Inbox');
    expect(container.textContent).not.toContain('Products');
    expect(container.textContent).not.toContain('Bookings');
    expect(container.textContent).not.toContain('Vouchers');
    expect(container.textContent).not.toContain('Add New Product');
    expect(container.textContent).not.toContain('Create voucher');
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
