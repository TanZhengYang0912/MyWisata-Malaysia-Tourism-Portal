vi.mock('@/lib/platform/operations-settings', () => ({ ensureCustomEmailDeliveryEnabled: vi.fn().mockResolvedValue(undefined) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { BinaryBitmap, HybridBinarizer, QRCodeReader, RGBLuminanceSource } from '@zxing/library';
import { signRetailPickupToken, verifyRetailPickupToken } from '@/lib/orders/retail-pickup-token';
import { escapeHtml } from '../templates';
const mocks = vi.hoisted(() => ({ send: vi.fn(), pdf: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: () => ({ sendMail: mocks.send, close: vi.fn() }) } }));
vi.mock('../config', () => ({ getEmailConfig: () => ({ host: 'smtp.example.test', port: 587, user: 'test', pass: 'test', from: 'MYLawatan <test@example.test>' }) }));
vi.mock('@/lib/pdf/receipt', () => ({ generateReceiptPdf: mocks.pdf }));
import { sendOrderReceiptEmail } from '../order-receipt';

describe('receipt email recipient language', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.send.mockResolvedValue({ messageId: 'test-only', accepted: ['test@example.test'], rejected: [] }); mocks.pdf.mockResolvedValue(Buffer.from('test-pdf')); });
  it.each([['en', 'Order Receipt', 'Total'], ['zh-CN', '订单收据', '总额'], ['ms', 'Resit Pesanan', 'Jumlah']] as const)('uses %s in mail and the attached receipt', async (locale, subject, total) => {
    await sendOrderReceiptEmail({ locale, recipientEmail: 'test@example.test', recipientName: '陈小明', orderId: 'MW-12345678', createdAt: '2026-10-14T00:00:00Z', paymentMethod: 'stripe_card', items: [{ activityName: 'Cake <Shop>', variantLabel: '原味', unitPrice: 25, qty: 1 }], subtotal: 25, total: 25, discount: 0 });
    expect(mocks.pdf).toHaveBeenLastCalledWith(expect.objectContaining({ locale }));
    const mail = mocks.send.mock.calls.at(-1)![0];
    expect(mail.subject).toContain(subject);
    expect(mail.subject).toContain('MYLawatan');
    expect(mail.subject).not.toContain('MyLawatan');
    expect(mail.html).toContain(`lang="${locale}"`);
    expect(mail.html).toContain('Cake &lt;Shop&gt;');
    expect(mail.text).toContain(total);
    expect(mail.html).toContain(total);
    expect(mail.attachments).toHaveLength(1);
  });

  it('embeds a scannable retail QR matching the signed order line without printing the token', async () => {
    const orderId = '10000000-0000-4000-8000-000000000001';
    const claims = { orderId, orderItemId: '10000000-0000-4000-8000-000000000002', vendorId: 'bbbbbbbb-2222-accc-3ddd-000000000003', outletId: 'cccccccc-dddd-aeee-3fff-111111111111', issuedAt: 1793124000 };
    const secret = 'synthetic-preview-only-not-a-shared-signing-secret';
    const token = signRetailPickupToken(claims, secret);
    const qrUrl = `https://preview.invalid/customer/orders/${orderId}?retail_t=${token}`;
    const payload = {
      locale: 'zh-CN' as const, recipientEmail: 'test@example.test', recipientName: '示例顾客', orderId, orderReference: 'ORD-DEMO-1000',
      createdAt: '2026-10-28T00:00:00+08:00', paymentMethod: 'ewallet',
      items: [{ activityName: 'Beh Teh Saw (Box of 12)', variantLabel: 'Default', unitPrice: 16, qty: 2 }], subtotal: 32, total: 32, discount: 0,
      pickupPasses: [{ kind: 'retail' as const, title: 'Jalan Macalister', subtitle: 'Ghee Hiang', details: ['2 × Beh Teh Saw (Box of 12) · Default'], qrUrl }],
    };
    await sendOrderReceiptEmail(payload);
    const mail = mocks.send.mock.calls.at(-1)![0];
    expect(mail.from).toBe('MYLawatan <test@example.test>');
    expect(mail.subject).toBe('您的 MYLawatan 订单收据 – ORD-DEMO-1000');
    expect(mail.html).toContain('cid:pickup-qr-0@mylawatan.my');
    expect(mail.html).toContain('一次领取下方所列全部数量');
    expect(mail.text).toContain('2 × Beh Teh Saw');
    expect(mail.attachments).toHaveLength(2);
    const attachment = mail.attachments[1];
    expect(attachment).toMatchObject({ contentType: 'image/png', contentDisposition: 'inline', cid: 'pickup-qr-0@mylawatan.my' });
    expect(mail.html).not.toContain(token);
    expect(mail.text).not.toContain(token);
    expect(attachment.filename).not.toContain(token);
    const image = await sharp(attachment.content).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
    const decoded = new QRCodeReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(new Uint8ClampedArray(image.data), image.info.width, image.info.height)))).getText();
    expect(decoded).toBe(qrUrl);
    expect(verifyRetailPickupToken(new URL(decoded).searchParams.get('retail_t')!, secret)).toMatchObject({ valid: true, claims });

    // Opt-in offline preview uses only synthetic identities and a non-production signing key.
    if (process.env.RECEIPT_EMAIL_PREVIEW_DIR) {
      const directory = process.env.RECEIPT_EMAIL_PREVIEW_DIR;
      mkdirSync(directory, { recursive: true });
      const { generateReceiptPdf } = await vi.importActual<typeof import('@/lib/pdf/receipt')>('@/lib/pdf/receipt');
      writeFileSync(path.join(directory, 'receipt.pdf'), await generateReceiptPdf(payload));
      writeFileSync(path.join(directory, 'pickup-qr.png'), attachment.content);
      const previewHtml = mail.html.replace(`cid:${attachment.cid}`, `data:image/png;base64,${attachment.content.toString('base64')}`)
        .replace('<h2', `<p style="padding:12px;background:#eef2ff">合成数据预览 · 非真实订单或领取凭证<br>From: ${escapeHtml(mail.from)}<br>${escapeHtml(mail.subject)}</p><h2`);
      writeFileSync(path.join(directory, 'receipt.html'), previewHtml);
    }
  });
});
