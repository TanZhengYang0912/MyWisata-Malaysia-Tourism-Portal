vi.mock('@/lib/platform/operations-settings', () => ({ ensureCustomEmailDeliveryEnabled: vi.fn().mockResolvedValue(undefined) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
const mocks = vi.hoisted(() => ({ send: vi.fn(), pdf: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: mocks.send, close: vi.fn() }) } }));
vi.mock('../config', () => ({ getEmailConfig: () => ({ host: 'smtp.example.test', port: 587, user: 'test', pass: 'test', from: 'MYLawatan <test@example.test>' }) }));
vi.mock('@/lib/pdf/receipt', () => ({ generateReceiptPdf: mocks.pdf }));
import { sendOrderReceiptEmail } from '../order-receipt';

describe('receipt email language', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({ messageId: 'test-only', accepted: ['test@example.test'], rejected: [] }); mocks.pdf.mockResolvedValue(Buffer.from('test-pdf')); });
  it('uses English in mail and the attached receipt, even for a Chinese name', async () => {
    const [locale, subject, total] = ['en', 'Order Receipt', 'Total'];
    await sendOrderReceiptEmail({ recipientEmail: 'test@example.test', recipientName: '陈小明', orderId: 'MW-12345678', createdAt: '2026-10-14T00:00:00Z', paymentMethod: 'stripe_card', items: [{ activityName: 'Cake <Shop>', variantLabel: '原味', unitPrice: 25, qty: 1 }], subtotal: 25, total: 25, discount: 0 });
    expect(mocks.pdf.mock.calls.at(-1)![0]).not.toHaveProperty('locale');
    const mail = mocks.send.mock.calls.at(-1)![0];
    expect(mail.subject).toContain(subject);
    expect(mail.subject).toContain('MYLawatan');
    expect(mail.subject).not.toContain('MyLawatan');
    expect(mail.html).toContain(`lang="${locale}"`);
    expect(mail.html).toContain('Cake &lt;Shop&gt;');
    expect(mail.text).toContain(total);
    expect(mail.html).toContain(total);
    expect(mail.attachments).toHaveLength(1);
    if (process.env.RECEIPT_EMAIL_PREVIEW_DIR) {
      const directory = process.env.RECEIPT_EMAIL_PREVIEW_DIR;
      mkdirSync(directory, { recursive: true });
      const preview = mail.html.replace(/<body([^>]*)>/i, `$&<p style="padding:12px;background:#eef2ff">Synthetic locale preview · not sent<br>To: test@example.test<br>${subject}</p>`);
      writeFileSync(path.join(directory, `receipt-${locale}.html`), preview);
      writeFileSync(path.join(directory, `receipt-${locale}.txt`), mail.text);
    }
  });

  it('never embeds a QR image or pickup QR section in the receipt email', async () => {
    await sendOrderReceiptEmail({
      recipientEmail: 'test@example.test', recipientName: 'Synthetic buyer', orderId: '10000000-0000-4000-8000-000000000001', orderReference: 'ORD-DEMO-1000',
      createdAt: '2026-10-28T00:00:00+08:00', paymentMethod: 'ewallet', accessUrl: 'https://preview.invalid/customer/orders/10000000-0000-4000-8000-000000000001',
      items: [{ activityName: 'Original Banana Cake', variantLabel: 'Central Market Annexe, KL · 17:00–19:00', unitPrice: 15, qty: 1 }], subtotal: 15, total: 15, discount: 0,
    });
    const mail = mocks.send.mock.calls.at(-1)![0];
    expect(mail.attachments).toEqual([expect.objectContaining({ contentType: 'application/pdf' })]);
    expect(mail.html).not.toMatch(/<img|cid:|QR/i);
    expect(mail.text).not.toMatch(/QR|inline image/i);
    expect(mail.html).toContain('View your order');
  });
});
