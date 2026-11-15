import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findElements, findOne, installTestDom, TestEvent, type TestElement } from '@/components/shared/__tests__/render-test-dom';
import en from '@/app/i18n/locales/en/customer.json';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => {
  return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, en) ?? key;
} }) }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: null, capabilities: { checkout: { allowed: true } } }) }));
vi.mock('@/components/providers/reference-currency', () => ({ useReferenceCurrency: () => ({ currency: 'MYR', snapshot: { date: 'today' } }) }));
vi.mock('@/components/shared/reference-price', () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));
vi.mock('@/components/customer/use-customer-capability-gate', () => ({ useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: async () => false }) }));
vi.mock('@/backend/domains/catalogue', () => ({ getOutlets: async () => [{ id: 'outlet', name: 'Shop' }], getBookingSlots: async () => [], getVoucherByCode: async () => undefined }));
vi.mock('@/components/providers/cart', () => ({ useCart: () => ({
  selectedItems: [{ activityId: 'product', variantId: 'variant', outletId: 'outlet', qty: 1 }], selectedKeys: new Set(['line']),
  activities: [{ id: 'product', outletId: 'outlet', name: 'Retail item', price: 0, variants: [{ id: 'variant', label: 'Standard', priceDelta: 0 }], requiresBooking: false }],
  totals: () => ({ subtotal: 0, discount: 0, total: 0 }),
}) }));

import CheckoutPage from '../page';
let document: ReturnType<typeof installTestDom>;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }

beforeAll(async () => {
  document = installTestDom();
  Object.assign(window, { location: { search: '' } });
  ({ createRoot } = await import('react-dom/client'));
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => String(input) === '/api/checkout/prepare'
    ? Response.json({ data: { checkout_session_id: 'session-1', order_id: 'order-1' } })
    : Response.json({ data: {} }));
  vi.stubGlobal('fetch', mocks.fetch);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.removeChild(container); vi.unstubAllGlobals(); });

describe('checkout → order navigation', () => {
  it('slides forward to the order after a free reservation is placed', async () => {
    await act(async () => { root.render(<CheckoutPage />); await settle(); });
    const input = findOne(container, node => node.id === 'checkout-contact-email');
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, 'traveller@outlook.com');
    await act(async () => { input.dispatchEvent(new TestEvent('input', { bubbles: true })); await settle(); });
    const pay = findElements(container, node => node.tagName === 'BUTTON').at(-1)!;
    await act(async () => { pay.dispatchEvent(new TestEvent('click', { bubbles: true })); await settle(); });

    expect(mocks.push).toHaveBeenCalledWith('/customer/orders/order-1', { transitionTypes: ['nav-forward'] });
  });
});
