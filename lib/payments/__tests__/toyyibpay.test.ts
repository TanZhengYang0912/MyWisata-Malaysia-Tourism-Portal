import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import {
  ToyyibPayProvider,
  verifyToyyibPayCallback,
} from '@/lib/payments/toyyibpay';

const request = {
  checkoutSessionId: '11111111-1111-4111-8111-111111111111',
  orderId: '22222222-2222-4222-8222-222222222222',
  amountSen: 12_345,
  currency: 'MYR' as const,
  customer: {
    name: 'Nur Aisyah',
    email: 'aisyah@example.com',
    phone: '+60123456789',
  },
  returnUrl: 'https://mywisata.example/api/payments/toyyibpay/return',
  callbackUrl: 'https://mywisata.example/api/payments/toyyibpay/callback',
};

describe('ToyyibPay checkout adapter', () => {
  beforeEach(() => {
    vi.stubEnv('TOYYIBPAY_USER_SECRET_KEY', 'test-user-secret');
    vi.stubEnv('TOYYIBPAY_CATEGORY_CODE', 'test-category');
    vi.stubEnv('TOYYIBPAY_ENV', 'sandbox');
    vi.stubEnv('TOYYIBPAY_BASE_URL', '');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('creates a fixed sandbox bill with the exact checkout reference and server URLs', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ BillCode: 'A1b2C3d4' }]));
    vi.stubGlobal('fetch', fetchMock);
    const provider = new ToyyibPayProvider();

    await expect(provider.createPayment(request)).resolves.toEqual({
      provider: 'toyyibpay',
      providerPaymentId: 'A1b2C3d4',
      actionUrl: 'https://dev.toyyibpay.com/A1b2C3d4',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://dev.toyyibpay.com/index.php/api/createBill',
      expect.objectContaining({ method: 'POST', signal: expect.any(AbortSignal) }),
    );
    const body = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(Object.fromEntries(body)).toMatchObject({
      userSecretKey: 'test-user-secret',
      categoryCode: 'test-category',
      billPriceSetting: '1',
      billPayorInfo: '1',
      billAmount: '12345',
      billExternalReferenceNo: request.checkoutSessionId,
      billReturnUrl: request.returnUrl,
      billCallbackUrl: request.callbackUrl,
      billTo: request.customer.name,
      billEmail: request.customer.email,
      billPhone: request.customer.phone,
    });
  });

  it('uses only the official production origin when production mode is explicit', async () => {
    vi.stubEnv('TOYYIBPAY_ENV', 'production');
    vi.stubEnv('TOYYIBPAY_BASE_URL', 'https://toyyibpay.com');
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ BillCode: 'Z9y8X7w6' }]));
    vi.stubGlobal('fetch', fetchMock);

    await new ToyyibPayProvider().createPayment(request);

    expect(fetchMock).toHaveBeenCalledWith(
      'https://toyyibpay.com/index.php/api/createBill',
      expect.any(Object),
    );
  });

  it('accepts HTTP localhost callback URLs only outside production', async () => {
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{ BillCode: 'A1b2C3d4' }])));
    const localRequest = {
      ...request,
      returnUrl: 'http://localhost:3000/customer/checkout?toyyibpay_return=1',
      callbackUrl: 'http://localhost:3000/api/payments/toyyibpay/callback',
    };

    await expect(new ToyyibPayProvider().createPayment(localRequest)).resolves.toMatchObject({
      providerPaymentId: 'A1b2C3d4',
    });

    vi.stubEnv('NODE_ENV', 'production');
    await expect(new ToyyibPayProvider().createPayment(localRequest))
      .rejects.toThrow('toyyibpay_invalid_request');
  });

  it('fails closed for missing or unsafe production configuration', async () => {
    vi.stubEnv('TOYYIBPAY_USER_SECRET_KEY', '');
    const missing = new ToyyibPayProvider();
    expect(missing.isConfigured()).toBe(false);
    await expect(missing.createPayment(request)).rejects.toThrow('toyyibpay_not_configured');

    vi.stubEnv('TOYYIBPAY_USER_SECRET_KEY', 'test-user-secret');
    vi.stubEnv('TOYYIBPAY_ENV', 'production');
    vi.stubEnv('TOYYIBPAY_BASE_URL', 'https://attacker.example');
    const unsafe = new ToyyibPayProvider();
    expect(unsafe.isConfigured()).toBe(false);
    await expect(unsafe.createPayment(request)).rejects.toThrow('toyyibpay_not_configured');
  });

  it.each([
    ['not an array', { BillCode: 'A1b2C3d4' }],
    ['more than one item', [{ BillCode: 'A1b2C3d4' }, { BillCode: 'Z9y8X7w6' }]],
    ['invalid bill code', [{ BillCode: '../secret' }]],
  ])('rejects a malformed createBill response: %s', async (_label, payload) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(payload)));

    await expect(new ToyyibPayProvider().createPayment(request))
      .rejects.toThrow('toyyibpay_invalid_response');
  });

  it('times out through an abort signal and never leaks provider secrets in its error', async () => {
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException('test-user-secret provider timeout detail', 'AbortError'),
    );
    vi.stubGlobal('fetch', fetchMock);

    let error: unknown;
    try {
      await new ToyyibPayProvider().createPayment(request);
    } catch (caught) {
      error = caught;
    }

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe('toyyibpay_unavailable');
    expect((error as Error).message).not.toContain('test-user-secret');
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it.each([
    ['1', 'succeeded'],
    ['2', 'pending'],
    ['3', 'failed'],
  ] as const)('maps transaction status %s to %s', async (billpaymentStatus, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json([{ billpaymentStatus }]));
    vi.stubGlobal('fetch', fetchMock);

    await expect(new ToyyibPayProvider().getPaymentStatus('A1b2C3d4')).resolves.toBe(expected);

    const body = new URLSearchParams(String(fetchMock.mock.calls[0]?.[1]?.body));
    expect(fetchMock.mock.calls[0]?.[0]).toBe(
      'https://dev.toyyibpay.com/index.php/api/getBillTransactions',
    );
    expect(Object.fromEntries(body)).toMatchObject({
      billCode: 'A1b2C3d4',
    });
    expect(body.has('userSecretKey')).toBe(false);
  });

  it('returns strict reconciliation evidence and maps provider status 4 to pending', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json([{
      billpaymentStatus: '4',
      billpaymentAmount: '50.00',
      billpaymentInvoiceNo: 'TP24000001',
      billExternalReferenceNo: request.checkoutSessionId,
    }])));

    await expect(new ToyyibPayProvider().getPaymentEvidence('A1b2C3d4')).resolves.toEqual({
      status: 'pending',
      rawStatus: '4',
      amountSen: 5000,
      providerEventReference: 'TP24000001',
      externalReference: request.checkoutSessionId,
    });
  });
});

describe('ToyyibPay callback verification', () => {
  it('accepts the documented MD5 formula and rejects a one-character tamper', () => {
    const input = {
      userSecretKey: 'test-user-secret',
      status: '1',
      orderId: '11111111-1111-4111-8111-111111111111',
      refno: 'TP24000001',
    };
    const receivedHash = createHash('md5')
      .update(`${input.userSecretKey}${input.status}${input.orderId}${input.refno}ok`)
      .digest('hex');

    expect(verifyToyyibPayCallback({ ...input, receivedHash })).toBe(true);
    expect(verifyToyyibPayCallback({
      ...input,
      receivedHash: `${receivedHash.slice(0, -1)}${receivedHash.endsWith('0') ? '1' : '0'}`,
    })).toBe(false);
  });

  it('rejects malformed hashes before comparison', () => {
    expect(verifyToyyibPayCallback({
      userSecretKey: 'test-user-secret',
      status: '1',
      orderId: 'checkout-id',
      refno: 'provider-ref',
      receivedHash: 'not-a-hash',
    })).toBe(false);
  });
});
