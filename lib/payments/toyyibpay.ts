import 'server-only';

import { createHash, timingSafeEqual } from 'node:crypto';
import type {
  CheckoutPaymentProvider,
  CheckoutPaymentRequest,
  CheckoutPaymentSession,
  CheckoutPaymentStatus,
} from '@/lib/payments/provider-contract';

const SANDBOX_BASE_URL = 'https://dev.toyyibpay.com';
const PRODUCTION_BASE_URL = 'https://toyyibpay.com';
const BILL_CODE_PATTERN = /^[A-Za-z0-9]{8}$/;
const CALLBACK_HASH_PATTERN = /^[0-9a-f]{32}$/i;

type FetchImplementation = typeof globalThis.fetch;

type ToyyibPayProviderOptions = {
  fetchImplementation?: FetchImplementation;
  timeoutMs?: number;
};

type ToyyibPayConfig = {
  userSecretKey: string;
  categoryCode: string;
  baseUrl: typeof SANDBOX_BASE_URL | typeof PRODUCTION_BASE_URL;
};

export type ToyyibPayPaymentEvidence = {
  status: CheckoutPaymentStatus;
  rawStatus: '1' | '2' | '3' | '4';
  amountSen: number;
  providerEventReference: string;
  externalReference: string;
};

function readConfiguration(): ToyyibPayConfig | null {
  const userSecretKey = process.env.TOYYIBPAY_USER_SECRET_KEY?.trim() ?? '';
  const categoryCode = process.env.TOYYIBPAY_CATEGORY_CODE?.trim() ?? '';
  const environment = process.env.TOYYIBPAY_ENV?.trim().toLowerCase() || 'sandbox';
  const configuredBaseUrl = process.env.TOYYIBPAY_BASE_URL?.trim().replace(/\/$/, '') ?? '';

  if (!userSecretKey || !categoryCode) return null;

  if (environment === 'production') {
    if (configuredBaseUrl !== PRODUCTION_BASE_URL) return null;
    return { userSecretKey, categoryCode, baseUrl: PRODUCTION_BASE_URL };
  }

  if (environment !== 'sandbox' && environment !== 'development') return null;
  if (configuredBaseUrl && configuredBaseUrl !== SANDBOX_BASE_URL) return null;
  return { userSecretKey, categoryCode, baseUrl: SANDBOX_BASE_URL };
}

function isAllowedServerUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') return true;
    return process.env.NODE_ENV !== 'production'
      && url.protocol === 'http:'
      && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  } catch {
    return false;
  }
}

function isValidPaymentRequest(input: CheckoutPaymentRequest): boolean {
  if (!Number.isSafeInteger(input.amountSen) || input.amountSen <= 0 || input.currency !== 'MYR') {
    return false;
  }

  if (!input.checkoutSessionId.trim() || !input.orderId.trim()) return false;
  if (!input.customer.name.trim() || !input.customer.email.trim() || !input.customer.phone.trim()) {
    return false;
  }

  return isAllowedServerUrl(input.returnUrl) && isAllowedServerUrl(input.callbackUrl);
}

function mapTransactionStatus(status: string): CheckoutPaymentStatus | null {
  if (status === '1') return 'succeeded';
  if (status === '2' || status === '4') return 'pending';
  if (status === '3') return 'failed';
  return null;
}

function parseProviderAmountSen(value: unknown): number | null {
  if (typeof value !== 'string' || !/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null;
  const [ringgit, sen = ''] = value.split('.');
  const result = Number(ringgit) * 100 + Number(sen.padEnd(2, '0'));
  return Number.isSafeInteger(result) && result > 0 ? result : null;
}

async function postForm(
  fetchImplementation: FetchImplementation,
  url: string,
  form: URLSearchParams,
  timeoutMs: number,
): Promise<unknown> {
  let response: Response;
  try {
    response = await fetchImplementation(url, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: form.toString(),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new Error('toyyibpay_unavailable');
  }

  if (!response.ok) throw new Error('toyyibpay_unavailable');

  try {
    return await response.json();
  } catch {
    throw new Error('toyyibpay_invalid_response');
  }
}

export class ToyyibPayProvider implements CheckoutPaymentProvider {
  readonly name = 'toyyibpay' as const;

  private readonly fetchImplementation: FetchImplementation;
  private readonly timeoutMs: number;

  constructor(options: ToyyibPayProviderOptions = {}) {
    this.fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    this.timeoutMs = options.timeoutMs ?? 10_000;
  }

  isConfigured(): boolean {
    return readConfiguration() !== null;
  }

  async createPayment(input: CheckoutPaymentRequest): Promise<CheckoutPaymentSession> {
    const config = readConfiguration();
    if (!config) throw new Error('toyyibpay_not_configured');
    if (!isValidPaymentRequest(input)) throw new Error('toyyibpay_invalid_request');

    const form = new URLSearchParams({
      userSecretKey: config.userSecretKey,
      categoryCode: config.categoryCode,
      billName: `MyWisata ${input.orderId.slice(0, 8)}`,
      billDescription: `MyWisata order ${input.orderId}`,
      billPriceSetting: '1',
      billPayorInfo: '1',
      billAmount: String(input.amountSen),
      billReturnUrl: input.returnUrl,
      billCallbackUrl: input.callbackUrl,
      billExternalReferenceNo: input.checkoutSessionId,
      billTo: input.customer.name,
      billEmail: input.customer.email,
      billPhone: input.customer.phone,
      billSplitPayment: '0',
      billPaymentChannel: '2',
    });
    const payload = await postForm(
      this.fetchImplementation,
      `${config.baseUrl}/index.php/api/createBill`,
      form,
      this.timeoutMs,
    );

    if (!Array.isArray(payload) || payload.length !== 1) {
      throw new Error('toyyibpay_invalid_response');
    }
    const billCode = (payload[0] as { BillCode?: unknown } | null)?.BillCode;
    if (typeof billCode !== 'string' || !BILL_CODE_PATTERN.test(billCode)) {
      throw new Error('toyyibpay_invalid_response');
    }

    return {
      provider: this.name,
      providerPaymentId: billCode,
      actionUrl: `${config.baseUrl}/${billCode}`,
    };
  }

  async getPaymentStatus(providerPaymentId: string): Promise<CheckoutPaymentStatus> {
    const payload = await this.getBillTransactions(providerPaymentId);
    if (payload.length === 0) return 'pending';

    const statuses = payload.map((item) => String(
      (item as { billpaymentStatus?: unknown } | null)?.billpaymentStatus ?? '',
    ));
    if (statuses.some((status) => mapTransactionStatus(status) === null)) {
      throw new Error('toyyibpay_invalid_response');
    }
    if (statuses.includes('1')) return 'succeeded';
    if (statuses.some((status) => status === '2' || status === '4')) return 'pending';
    return 'failed';
  }

  async getPaymentEvidence(providerPaymentId: string): Promise<ToyyibPayPaymentEvidence | null> {
    const payload = await this.getBillTransactions(providerPaymentId);
    if (payload.length === 0) return null;

    const evidence = payload.map((item): ToyyibPayPaymentEvidence => {
      const record = item && typeof item === 'object' ? item as Record<string, unknown> : {};
      const rawStatus = String(record.billpaymentStatus ?? '');
      const status = mapTransactionStatus(rawStatus);
      const amountSen = parseProviderAmountSen(record.billpaymentAmount);
      const providerEventReference = typeof record.billpaymentInvoiceNo === 'string'
        ? record.billpaymentInvoiceNo.trim()
        : '';
      const externalReference = typeof record.billExternalReferenceNo === 'string'
        ? record.billExternalReferenceNo.trim()
        : '';
      if (
        !status
        || !['1', '2', '3', '4'].includes(rawStatus)
        || amountSen === null
        || !/^[A-Za-z0-9_-]{1,253}$/.test(providerEventReference)
        || !externalReference
        || externalReference.length > 255
      ) {
        throw new Error('toyyibpay_invalid_response');
      }
      return {
        status,
        rawStatus: rawStatus as ToyyibPayPaymentEvidence['rawStatus'],
        amountSen,
        providerEventReference,
        externalReference,
      };
    });

    return evidence.find((item) => item.status === 'succeeded')
      ?? evidence.find((item) => item.status === 'pending')
      ?? evidence[0]
      ?? null;
  }

  private async getBillTransactions(providerPaymentId: string): Promise<unknown[]> {
    const config = readConfiguration();
    if (!config) throw new Error('toyyibpay_not_configured');
    if (!BILL_CODE_PATTERN.test(providerPaymentId)) throw new Error('toyyibpay_invalid_request');

    const payload = await postForm(
      this.fetchImplementation,
      `${config.baseUrl}/index.php/api/getBillTransactions`,
      new URLSearchParams({ billCode: providerPaymentId }),
      this.timeoutMs,
    );

    if (!Array.isArray(payload)) throw new Error('toyyibpay_invalid_response');
    return payload;
  }
}

export function verifyToyyibPayCallback(input: {
  userSecretKey: string;
  status: string;
  orderId: string;
  refno: string;
  receivedHash: string;
}): boolean {
  if (!input.userSecretKey || !CALLBACK_HASH_PATTERN.test(input.receivedHash)) return false;

  const expected = Buffer.from(createHash('md5')
    .update(`${input.userSecretKey}${input.status}${input.orderId}${input.refno}ok`)
    .digest('hex'), 'hex');
  const received = Buffer.from(input.receivedHash, 'hex');
  return expected.length === received.length && timingSafeEqual(expected, received);
}
