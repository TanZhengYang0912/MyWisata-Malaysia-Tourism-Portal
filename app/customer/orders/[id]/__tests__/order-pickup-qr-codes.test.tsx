import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { findElements, installTestDom, type TestElement } from '@/components/shared/__tests__/render-test-dom';
import { signRetailPickupToken, verifyRetailPickupToken } from '@/lib/orders/retail-pickup-token';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => key === 'ui.pickupPasses.quantity' ? `${options?.count} items` : key }) }));
vi.mock('next/image', () => ({ default: ({ src, alt, width, height }: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', { src, alt, width, height }) }));
vi.mock('@/components/customer/food-order-qr-codes', () => ({ FoodOrderQrCodes: () => null }));
vi.mock('@/components/customer/event-pickup-qr-codes', () => ({ EventPickupQrCodes: () => null }));
import { OrderPickupQrCodes } from '../order-pickup-qr-codes';

const claims = { orderId: '10000000-0000-4000-8000-000000000001', orderItemId: '10000000-0000-4000-8000-000000000002', vendorId: 'bbbbbbbb-2222-accc-3ddd-000000000003', outletId: 'cccccccc-dddd-aeee-3fff-111111111111', issuedAt: 100 };
const secret = 'synthetic-page-uuid-regression-secret';
let document: ReturnType<typeof installTestDom>;
let createRoot: typeof import('react-dom/client').createRoot;
let root: ReturnType<typeof createRoot>;
let container: TestElement;
beforeAll(async () => {
  document = installTestDom();
  Object.assign(window, { location: { origin: 'https://preview.invalid' } });
  ({ createRoot } = await import('react-dom/client'));
});
beforeEach(() => {
  vi.clearAllMocks();
  const token = signRetailPickupToken(claims, secret);
  mocks.fetch.mockResolvedValue(Response.json({ data: { foodOrders: [], eventPickups: [], retailPickups: [{
    orderItemId: claims.orderItemId, vendorName: 'Synthetic vendor', outletName: 'Synthetic outlet', status: 'pending', quantity: 2, name: 'Synthetic retail', variant: 'Box', retailToken: token,
  }] } }));
  vi.stubGlobal('fetch', mocks.fetch);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container as unknown as Element);
});
afterEach(async () => {
  await act(async () => root.unmount());
  document.body.removeChild(container);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe('Guest retail pickup QR presentation', () => {
  it('renders and decodes the actual PNG for database-shaped merchant IDs', async () => {
    const encoding = vi.spyOn(QRCode, 'toDataURL');
    await act(async () => root.render(<OrderPickupQrCodes orderId={claims.orderId} />));
    await vi.waitFor(() => expect(encoding).toHaveBeenCalledOnce());
    await act(async () => { await Promise.all(encoding.mock.results.map(result => result.value)); });
    expect(container.textContent).toContain('Synthetic retail');
    expect(container.textContent).toContain('2 items');
    expect(container.textContent).not.toContain('ui.pickupPasses.loadError');
    const images = findElements(container, node => node.tagName === 'IMG');
    expect(images).toHaveLength(1);
    const src = images[0].getAttribute('src')!;
    expect(src).toMatch(/^data:image\/png;base64,/);
    const image = await sharp(Buffer.from(src.split(',')[1], 'base64')).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(image.data), image.info.width, image.info.height)))).getText();
    const url = new URL(decoded);
    expect(url.pathname).toBe(`/customer/orders/${claims.orderId}`);
    expect(verifyRetailPickupToken(url.searchParams.get('retail_t')!, secret)).toMatchObject({ valid: true, claims });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/customer/orders/${claims.orderId}/qr-passes`, expect.anything());
  });
  it('keeps a safe retry state without a QR when the API denies collection', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { code: 'MERCHANT_IDENTITY_UNAVAILABLE' } }, { status: 409 }));
    await act(async () => root.render(<OrderPickupQrCodes orderId={claims.orderId} />));
    expect(container.textContent).toContain('ui.pickupPasses.loadError');
    expect(findElements(container, node => node.tagName === 'IMG')).toHaveLength(0);
  });
});
