import { createHash } from "node:crypto";

export type CheckoutRequest = {
  selectedKeys?: string[];
  voucherCode?: string | null;
  paymentMethod: string;
};

export type NormalizedCheckoutRequest = {
  selectedKeys: string[] | null;
  voucherCode: string | null;
  paymentMethod: string;
};

export function normalizeCheckoutRequest(input: CheckoutRequest): NormalizedCheckoutRequest {
  const selectedKeys = input.selectedKeys?.length
    ? [...new Set(input.selectedKeys)].sort()
    : null;

  return {
    selectedKeys,
    voucherCode: input.voucherCode?.trim().toUpperCase() || null,
    paymentMethod: input.paymentMethod.trim().toLowerCase(),
  };
}

export function buildCheckoutRequestHash(input: NormalizedCheckoutRequest): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

export function createIdempotencyKey(): string {
  return crypto.randomUUID();
}
