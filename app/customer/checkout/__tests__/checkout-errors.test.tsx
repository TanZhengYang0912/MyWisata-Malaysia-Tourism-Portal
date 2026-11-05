import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { findElements, findOne, installTestDom, TestEvent, type TestElement } from '@/components/shared/__tests__/render-test-dom';
import en from '@/app/i18n/locales/en/customer.json';
import zh from '@/app/i18n/locales/zh-CN/customer.json';
import ms from '@/app/i18n/locales/ms/customer.json';

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), push: vi.fn(), locale: 'zh-CN' as 'en' | 'zh-CN' | 'ms', failure: { code: 'INVENTORY_UNAVAILABLE', message: 'private database detail' } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({ default: ({ children, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => <a {...props}>{children}</a> }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string) => {
  const messages = { en, 'zh-CN': zh, ms }[mocks.locale];
  return key.split('.').reduce<unknown>((value, part) => value && typeof value === 'object' ? (value as Record<string, unknown>)[part] : undefined, messages) ?? key;
} }) }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: null, capabilities: { checkout: { allowed: true } } }) }));
vi.mock('@/components/providers/reference-currency', () => ({ useReferenceCurrency: () => ({ currency: 'MYR', snapshot: { date: 'today' } }) }));
vi.mock('@/components/shared/reference-price', () => ({ ReferencePrice: ({ amountMYR }: { amountMYR: number }) => <span>RM{amountMYR}</span> }));
vi.mock('@/components/customer/use-customer-capability-gate', () => ({ useCustomerCapabilityGate: () => Object.assign(() => true, { handleResponse: async () => false }) }));
vi.mock('@/backend/domains/catalogue', () => ({ getOutlets: async () => [{ id: 'outlet', name: 'Shop' }], getBookingSlots: async () => [], getVoucherByCode: async () => undefined }));
vi.mock('@/components/providers/cart', () => ({ useCart: () => ({
  selectedItems: [{ activityId: 'product', variantId: 'variant', outletId: 'outlet', qty: 1 }], selectedKeys: new Set(['line']),
  activities: [{ id: 'product', outletId: 'outlet', name: 'Retail item', price: 32, variants: [{ id: 'variant', label: 'Standard', priceDelta: 0 }], requiresBooking: false }],
  totals: () => ({ subtotal: 32, discount: 0, total: 32 }),
}) }));

import CheckoutPage from '../page';
let document: ReturnType<typeof installTestDom>;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
async function settle() { for (let index = 0; index < 8; index += 1) await Promise.resolve(); }
async function fillEmail(value: string) {
  const input = findOne(container, node => node.id === 'checkout-contact-email');
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), 'value')?.set?.call(input, value);
  await act(async () => { input.dispatchEvent(new TestEvent('input', { bubbles: true })); await settle(); });
  return input;
}
async function pay() {
  const button = findElements(container, node => node.tagName === 'BUTTON').at(-1)!;
  await act(async () => { button.dispatchEvent(new TestEvent('click', { bubbles: true })); await settle(); });
}
async function render() { await act(async () => { root.render(<CheckoutPage />); await settle(); }); }

beforeAll(async () => {
  document = installTestDom();
  Object.assign(window, { location: { search: '' } });
  ({ createRoot } = await import('react-dom/client'));
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.locale = 'zh-CN';
  mocks.failure = { code: 'INVENTORY_UNAVAILABLE', message: 'private database detail' };
  mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => String(input) === '/api/guest/session'
    ? Response.json({ data: {} })
    : Response.json({ error: mocks.failure }, { status: 409 }));
  vi.stubGlobal('fetch', mocks.fetch);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(async () => { await act(async () => root.unmount()); document.body.removeChild(container); vi.unstubAllGlobals(); });

describe('actionable checkout errors', () => {
  it.each(['', 'not-an-email'])('identifies an empty or invalid email before creating a Guest session or order: %s', async email => {
    await render();
    const input = await fillEmail(email);
    const focus = vi.spyOn(input, 'focus');
    await pay();
    expect(container.textContent).toContain(email ? zh.checkoutErrors.CONTACT_EMAIL_INVALID : zh.checkoutErrors.CONTACT_EMAIL_REQUIRED);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    expect(input.getAttribute('aria-describedby')).toBe('checkout-email-error');
    expect(focus).toHaveBeenCalled();
    expect(mocks.fetch).not.toHaveBeenCalled();
    await fillEmail('traveller@outlook.com');
    expect(input.getAttribute('aria-invalid')).toBe('false');
    await pay();
    expect(mocks.fetch).toHaveBeenCalledWith('/api/checkout/prepare', expect.anything());
  });

  it.each([
    ['INVENTORY_UNAVAILABLE', 'INVENTORY_UNAVAILABLE', true],
    ['CART_ITEM_UNAVAILABLE', 'CART_ITEM_UNAVAILABLE', true],
    ['TOYYIBPAY_UNAVAILABLE', 'PAYMENT_SERVICE_UNAVAILABLE', false],
    ['PAYMENT_SIMULATOR_UNAVAILABLE', 'PAYMENT_SERVICE_UNAVAILABLE', false],
    ['unknown_internal_error', 'CHECKOUT_FAILED', false],
  ] as const)('shows the matching safe Chinese message for %s', async (code, expected, showCart) => {
    mocks.failure = { code, message: 'private database detail' };
    await render();
    await fillEmail('traveller@outlook.com');
    await pay();
    expect(container.textContent).toContain(zh.checkoutErrors[expected]);
    expect(container.textContent).not.toContain('private database detail');
    const returnToCart = findElements(container, node => node.tagName === 'BUTTON' && node.textContent === zh.strictMigration.checkout.returnToCart);
    expect(returnToCart).toHaveLength(showCart ? 1 : 0);
  });

  it.each(['TOYYIBPAY_CREATE_INDETERMINATE', 'TOYYIBPAY_PREPARE_FAILED'])('offers Guest order recovery when payment setup is uncertain: %s', async code => {
    mocks.failure = { code, message: 'provider response' };
    await render();
    await fillEmail('traveller@outlook.com');
    await pay();
    expect(container.textContent).toContain(zh.checkoutErrors.PAYMENT_STATUS_UNCERTAIN);
    const recover = findOne(container, node => node.tagName === 'BUTTON' && node.textContent === zh.checkoutErrors.reviewOrder);
    await act(async () => recover.dispatchEvent(new TestEvent('click', { bubbles: true })));
    expect(mocks.push).toHaveBeenCalledWith('/customer/orders/access');
  });

  it('re-renders an existing error in the newly selected language', async () => {
    await render();
    await fillEmail('traveller@outlook.com');
    await pay();
    for (const [locale, dictionary] of [['en', en], ['ms', ms]] as const) {
      mocks.locale = locale;
      await render();
      expect(container.textContent).toContain(dictionary.checkoutErrors.INVENTORY_UNAVAILABLE);
    }
  });
});
