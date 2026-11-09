import React, { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import QRCode from 'qrcode';
import sharp from 'sharp';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { findElements, installTestDom, type TestElement } from '@/components/shared/__tests__/render-test-dom';

const mocks = vi.hoisted(() => ({ fetch: vi.fn() }));
vi.mock('@/components/providers/auth', () => ({ useAuth: () => ({ currentUser: null }) }));
vi.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key: string, options?: { count?: number }) => key === 'ui.pickupPasses.quantity' ? `${options?.count} items` : key }) }));
vi.mock('next/image', () => ({ default: ({ src, alt, width, height }: React.ImgHTMLAttributes<HTMLImageElement>) => React.createElement('img', { src, alt, width, height }) }));
vi.mock('@/components/customer/food-order-qr-codes', () => ({ FoodOrderQrCodes: () => null }));
vi.mock('@/components/customer/event-pickup-qr-codes', () => ({ EventPickupQrCodes: () => null }));
import { OrderPickupQrCodes } from '../order-pickup-qr-codes';

const orderId = '10000000-0000-4000-8000-000000000001';
const retailCode = 'P-ABCDE-FGHJK';
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
  mocks.fetch.mockResolvedValue(Response.json({ data: { foodOrders: [], eventPickups: [], retailPickups: [{
    orderItemId: '10000000-0000-4000-8000-000000000002', vendorName: 'Synthetic vendor', outletName: 'Synthetic outlet', status: 'pending', quantity: 2, name: 'Synthetic retail', variant: 'Box', retailToken: 'signed-retail-token', retailCode,
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
  it('renders and decodes the short pickup code in the actual PNG', async () => {
    const encoding = vi.spyOn(QRCode, 'toDataURL');
    await act(async () => root.render(<OrderPickupQrCodes orderId={orderId} />));
    await vi.waitFor(() => expect(encoding).toHaveBeenCalledOnce());
    expect(encoding).toHaveBeenCalledWith(retailCode.replace(/-/g, ""), {
      width: 512,
      margin: 2,
      errorCorrectionLevel: "M",
      color: { dark: "#010066", light: "#ffffff" },
    });
    await act(async () => { await Promise.all(encoding.mock.results.map(result => result.value)); });
    expect(container.textContent).toContain('Synthetic retail');
    expect(container.textContent).toContain(retailCode);
    expect(container.textContent).toContain('2 items');
    expect(container.textContent).not.toContain('ui.pickupPasses.loadError');
    const images = findElements(container, node => node.tagName === 'IMG');
    expect(images).toHaveLength(1);
    const src = images[0].getAttribute('src')!;
    expect(src).toMatch(/^data:image\/png;base64,/);
    const image = await sharp(Buffer.from(src.split(',')[1], 'base64')).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(image.data), image.info.width, image.info.height)))).getText();
    expect(decoded).toBe(retailCode.replace(/-/g, ''));
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch).toHaveBeenCalledWith(`/api/customer/orders/${orderId}/qr-passes`, expect.anything());
  });
  it('keeps a safe retry state without a QR when the API denies collection', async () => {
    mocks.fetch.mockResolvedValue(Response.json({ error: { code: 'MERCHANT_IDENTITY_UNAVAILABLE' } }, { status: 409 }));
    await act(async () => root.render(<OrderPickupQrCodes orderId={orderId} />));
    expect(container.textContent).toContain('ui.pickupPasses.loadError');
    expect(findElements(container, node => node.tagName === 'IMG')).toHaveLength(0);
  });
});
