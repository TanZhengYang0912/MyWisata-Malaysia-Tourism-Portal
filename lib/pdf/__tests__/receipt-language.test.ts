import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { generateReceiptPdf } from '../receipt';

describe('receipt PDF', () => {
  it('embeds extractable Chinese names with English labels', async () => {
    const locale = 'en';
    const bytes = await generateReceiptPdf({ orderId: 'MW-TEST-20261014', recipientName: '陈小明', createdAt: '2026-10-14T12:00:00Z', paymentMethod: 'stripe_card', items: [{ activityName: '手工蛋糕 / Handmade Cake', variantLabel: '原味', qty: 2, unitPrice: 12.5 }], subtotal: 25, discount: 0, total: 25 });
    const pdf = bytes.toString('latin1');
    expect(pdf).toContain('%PDF');
    expect(pdf).toContain('NotoSansCJKsc-Regular');
    expect(pdf).toContain('/ToUnicode');
    if (process.env.RECEIPT_SAMPLE_DIR) {
      mkdirSync(process.env.RECEIPT_SAMPLE_DIR, { recursive: true });
      writeFileSync(path.join(process.env.RECEIPT_SAMPLE_DIR, `receipt-${locale}.pdf`), bytes);
    }
  });
});
