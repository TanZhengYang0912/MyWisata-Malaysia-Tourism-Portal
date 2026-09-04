import { formatMYR } from "@/lib/i18n/format";

export interface VoucherDisplayInput {
  voucherType: string;
  discountValue: number | null | undefined;
  buyQuantity?: number | null;
  freeQuantity?: number | null;
}

export function voucherDiscountLabel(input: VoucherDisplayInput): string {
  if (input.voucherType === 'percent') return `${Number(input.discountValue ?? 0)}% off`;
  if (input.voucherType === 'fixed') return `${formatMYR(Number(input.discountValue ?? 0))} off`;
  if (input.voucherType === 'bogo' && input.buyQuantity && input.freeQuantity) {
    return `Buy ${input.buyQuantity} Get ${input.freeQuantity}`;
  }
  return 'Voucher offer';
}

export type VoucherConfirmationAction = 'create' | 'upload' | 'activate' | 'deactivate';

export function voucherConfirmationCopy(input: {
  action: VoucherConfirmationAction;
  count?: number;
  code?: string;
}): { title: string; description: string; confirmLabel: string; tone: 'primary' | 'danger' } {
  if (input.action === 'create') {
    return {
      title: 'Submit this voucher for review?',
      description: 'It will stay inactive until an administrator approves it.',
      confirmLabel: 'Submit for review',
      tone: 'primary',
    };
  }
  if (input.action === 'upload') {
    const count = input.count ? `${input.count} voucher${input.count === 1 ? '' : 's'}` : 'these vouchers';
    return {
      title: `Upload ${count}?`,
      description: `${count} will be submitted for admin review. Rows with existing codes keep them. Blank code cells will use the selected prefix only when automatic generation is enabled.`,
      confirmLabel: 'Upload CSV',
      tone: 'primary',
    };
  }
  const code = input.code || 'this voucher';
  const activating = input.action === 'activate';
  return {
    title: `${activating ? 'Activate' : 'Deactivate'} ${code}?`,
    description: activating
      ? 'Customers can use this voucher after it is active and approved.'
      : 'Customers will no longer be able to use this voucher while it is inactive.',
    confirmLabel: `${activating ? 'Activate' : 'Deactivate'} voucher`,
    tone: activating ? 'primary' : 'danger',
  };
}
