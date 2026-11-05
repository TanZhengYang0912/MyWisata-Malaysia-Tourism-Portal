import React, { act } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getBookingSlots } from '@/backend/domains/catalogue';
import {
  findElements,
  findOne,
  installTestDom,
  TestEvent,
  type TestDocument,
} from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  push: vi.fn(),
  cart: vi.fn(),
  gate: vi.fn(),
  handleResponse: vi.fn(),
  currentUser: { id: 'user-1', email: 'buyer@example.com', phone: '+60177143951' },
  capabilities: { checkout: { allowed: true } },
}));

vi.stubGlobal('fetch', mocks.fetch);
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }));
vi.mock('next/link', () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>{children}</a>
  ),
}));
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => ({
      'strictMigration.checkout.methods.stripeCard': 'Stripe',
      'strictMigration.checkout.methods.tng': 'TNG Demo',
      'strictMigration.checkout.methods.grabpay': 'GrabPay Demo',
      'strictMigration.checkout.methods.bankTransfer': 'Bank transfer — Demo simulator',
      'strictMigration.checkout.methods.toyyibpaySandbox': 'ToyyibPay — Sandbox',
      'ui.checkout.continueToyyibPaySandbox': 'Continue to ToyyibPay Sandbox',
      'ui.checkout.toyyibpayAwaitingTitle': 'Awaiting provider confirmation',
      'ui.checkout.toyyibpayAwaitingDescription': 'Your order will update after ToyyibPay confirms the payment.',
      'ui.checkout.viewOrders': 'View orders',
      'ui.checkout.paymentMethod': 'Payment method',
      'ui.checkout.title': 'Checkout',
      'ui.checkout.nothing': 'Nothing to check out',
      'ui.property.continueToPayment': 'Continue to Payment',
      'ui.property.yourSelection': 'Your Selection',
      'ui.property.yourDetails': 'Your Details',
      'ui.property.payment': 'Payment',
      'ui.property.guestDetails': 'Guest details',
      'ui.property.nameOnId': 'Full name',
      'ui.property.email': 'Email',
      'ui.property.phone': 'Phone',
      'ui.property.guestDetailsRequired': 'Guest contact details are required.',
      'ui.property.prefilledHint': 'Profile details are prefilled.',
      'ui.property.estimatedArrival': 'Estimated arrival time',
      'ui.property.arrivalUnknown': 'Not sure yet',
      'ui.property.arrivalAfternoon': '3:00 PM–6:00 PM',
      'ui.property.arrivalEvening': '6:00 PM–9:00 PM',
      'ui.property.arrivalLate': 'After 9:00 PM',
      'ui.property.secondGuestName': 'Second guest name',
      'ui.property.specialRequest': 'Special request',
      'ui.property.editDetails': 'Edit Details',
      'ui.property.adults': 'Adults',
      'ui.property.arrivalLabels.unknown': 'Not specified',
      'ui.property.arrivalLabels.15:00-18:00': '3:00 PM–6:00 PM',
      'ui.property.arrivalLabels.18:00-21:00': '6:00 PM–9:00 PM',
      'ui.property.arrivalLabels.after-21:00': 'After 9:00 PM',
      'ui.property.checkIn': 'Check-in',
      'ui.property.checkOut': 'Check-out',
      'ui.property.nightsSummary': '{{count}} nights',
      'ui.property.roomsCount': '{{count}} rooms',
      'ui.checkout.continueStripe': 'Continue to Stripe',
    } as Record<string, string>)[key] ?? key,
  }),
}));
vi.mock('@/components/providers/auth', () => ({
  useAuth: () => ({ currentUser: mocks.currentUser, capabilities: mocks.capabilities }),
}));
vi.mock('@/components/providers/cart', () => ({ useCart: () => mocks.cart() }));
vi.mock('@/components/profile/international-phone-input', () => ({
  InternationalPhoneInput: ({ id, value, onChange }: { id: string; value: string; onChange: (value: string) => void }) => (
    <input id={id} type="tel" value={value} onChange={(event) => onChange(event.target.value)} />
  ),
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ value, onValueChange, children }: { value: string; onValueChange: (value: string) => void; children: React.ReactNode }) => (
    <select value={value} onChange={(event) => onValueChange(event.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ value, children }: { value: string; children: React.ReactNode }) => <option value={value}>{children}</option>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: () => null,
}));
vi.mock('@/components/customer/use-customer-capability-gate', () => ({
  useCustomerCapabilityGate: () => Object.assign(mocks.gate, { handleResponse: mocks.handleResponse }),
}));
vi.mock('@/backend/domains/catalogue', () => ({
  getActivities: vi.fn(async () => [{
    id: 'product-1', name: 'Rainforest Walk', image: '', outletId: 'outlet-1',
    categorySlug: 'accommodation', variants: [{ id: 'variant-1', label: 'Standard' }], requiresBooking: true,
  }]),
  getOutlets: vi.fn(async () => [{ id: 'outlet-1', name: 'Eco Tours' }]),
  getBookingSlots: vi.fn(async () => []),
  getVoucherByCode: vi.fn(async () => undefined),
}));
vi.mock('@/backend/core/helpers', async (original) => await original());
vi.mock('@/lib/i18n/format', () => ({
  formatMYR: (amount: number) => `RM${amount.toFixed(2)}`,
  formatMYRFromSen: (amount: number) => `RM${(amount / 100).toFixed(2)}`,
}));

let CheckoutPage: typeof import('../page').default;
let createRoot: typeof import('react-dom/client').createRoot;
let document: TestDocument;

async function settle() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

describe('ToyyibPay checkout presentation', () => {
  beforeAll(async () => {
    vi.stubEnv('NEXT_PUBLIC_TOYYIBPAY_ENABLED', 'true');
    vi.stubEnv('NEXT_PUBLIC_TOYYIBPAY_ENV', 'sandbox');
    document = installTestDom();
    Object.assign(globalThis.window, { location: { search: '', href: 'https://mylawatan.example/customer/checkout' } });
    ({ createRoot } = await import('react-dom/client'));
    CheckoutPage = (await import('../page')).default;
  });

  beforeEach(() => {
    vi.clearAllMocks();
    (globalThis.window as unknown as { location: { search: string; href: string; assign?: (url: string) => void } }).location = {
      search: '', href: 'https://mylawatan.example/customer/checkout',
      assign: (url: string) => { (globalThis.window as unknown as { location: { href: string } }).location.href = url; },
    };
    mocks.gate.mockReturnValue(true);
    mocks.handleResponse.mockResolvedValue(false);
    mocks.cart.mockReturnValue({
      selectedItems: [{ activityId: 'product-1', variantId: 'variant-1', outletId: 'outlet-1', qty: 1 }],
      selectedKeys: new Set(['product-1|variant-1||outlet-1']),
      activities:[{id:'product-1',outletId:'outlet-1',name:'Rainforest Walk',price:50,variants:[{id:'variant-1',label:'Standard',priceDelta:0}],requiresBooking:false}],
      totals: () => ({ subtotal: 50, discount: 0, total: 50 }),
    });
    mocks.fetch.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === '/api/wallet/summary') return Response.json({ data: { topupSen: 0, earningsSen: 0 } });
      if (url === '/api/checkout/prepare') return Response.json({
        data: {
          checkout_session_id: '11111111-1111-4111-8111-111111111111',
          order_id: '22222222-2222-4222-8222-222222222222',
          toyyibpayUrl: 'https://dev.toyyibpay.com/A1b2C3d4',
        },
        error: null,
      });
      return Response.json({ data: null });
    });
  });

  it('keeps the Demo bank option distinct and submits the exact ToyyibPay sandbox pair', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container as unknown as Element);
    await act(async () => { root.render(<CheckoutPage />); await settle(); });

    expect(container.textContent).toContain('ToyyibPay — Sandbox');
    expect(container.textContent).toContain('Bank transfer — Demo simulator');
    const providerButton = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('ToyyibPay — Sandbox'));
    await act(async () => { providerButton.dispatchEvent(new TestEvent('click', { bubbles: true })); await settle(); });
    const payButton = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Continue to ToyyibPay Sandbox'));
    await act(async () => { payButton.dispatchEvent(new TestEvent('click', { bubbles: true })); await settle(); });

    const prepareCall = mocks.fetch.mock.calls.find(([input]) => String(input) === '/api/checkout/prepare');
    expect(prepareCall).toBeTruthy();
    expect(JSON.parse(String(prepareCall?.[1]?.body))).toMatchObject({
      paymentMethod: 'bank_transfer', paymentProvider: 'toyyibpay',
    });
    expect((globalThis.window as unknown as { location: { href: string } }).location.href)
      .toBe('https://dev.toyyibpay.com/A1b2C3d4');

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('uses the shared contact and payment flow for accommodation items without a hotel-only checkout branch', async () => {
    Object.assign(mocks.currentUser, { email: 'guest@example.com', name: 'Aisyah Tan', phone: '+60177143951' });
    const activity = {
      id: 'product-1', name: 'Deluxe Room', image: '', outletId: 'outlet-1', categorySlug: 'accommodation',
      price: 50, variants: [{ id: 'variant-1', label: 'Standard', priceDelta: 0 }], requiresBooking: true,
    };
    vi.mocked(getBookingSlots).mockResolvedValueOnce([{
      id: 'slot-1', activityId: 'product-1', outletId: 'outlet-1',
      startsAt: new Date(Date.now() + 86_400_000).toISOString(), capacity: 5, booked: 0,
    }]);
    mocks.cart.mockReturnValue({
      selectedItems: [{ cartItemId: 'stay-line-1', activityId: 'product-1', variantId: 'variant-1', slotId: 'slot-1', outletId: 'outlet-1', qty: 1, nights: 2, stayDetails: { primaryGuestName: 'Nur Aisyah', adults: 3, estimatedArrival: 'unknown' } }],
      selectedKeys: new Set(['cart-item:stay-line-1']),
      activities: [activity],
      totals: () => ({ subtotal: 100, discount: 0, total: 100 }),
    });

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container as unknown as Element);
    await act(async () => { root.render(<CheckoutPage />); await settle(); });

    expect(container.textContent).toContain('Payment method');
    expect(container.textContent).not.toContain('Your Selection');
    expect(container.textContent).not.toContain('Estimated arrival time');
    expect(container.textContent).not.toContain('Continue to Payment');
    const payButton = findOne(container, (element) => element.tagName === 'BUTTON' && element.textContent.includes('Continue to Stripe'));
    expect(payButton.getAttribute('disabled')).toBeNull();
    await act(async () => { payButton.dispatchEvent(new TestEvent('click', { bubbles: true })); await settle(); });

    const prepareCall = mocks.fetch.mock.calls.find(([input]) => String(input) === '/api/checkout/prepare');
    expect(prepareCall).toBeTruthy();
    const requestBody = JSON.parse(String(prepareCall?.[1]?.body));
    expect(requestBody).toMatchObject({
      contact: { email: 'guest@example.com', name: 'Aisyah Tan', phone: '+60177143951' },
    });
    expect(requestBody).not.toHaveProperty('stayDetails');

    act(() => root.unmount());
    document.body.removeChild(container);
  });

  it('shows a non-settling awaiting state after provider return even when the cart is empty', async () => {
    (globalThis.window as unknown as { location: { search: string; href: string; assign?: (url: string) => void } }).location.search = '?toyyibpay_return=1&status_id=1';
    mocks.cart.mockReturnValue({ selectedItems: [], selectedKeys: new Set(), totals: () => ({ subtotal: 0, discount: 0, total: 0 }) });
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container as unknown as Element);

    await act(async () => { root.render(<CheckoutPage />); await settle(); });

    expect(container.textContent).toContain('Awaiting provider confirmation');
    expect(findElements(container, (element) => element.tagName === 'A' && element.textContent.includes('View orders'))).toHaveLength(1);
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes('finalize'))).toBe(false);
    expect(mocks.fetch.mock.calls.some(([input]) => String(input).includes('callback'))).toBe(false);

    act(() => root.unmount());
    document.body.removeChild(container);
  });
});
