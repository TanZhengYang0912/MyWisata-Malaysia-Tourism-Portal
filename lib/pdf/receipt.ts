import PDFDocument from 'pdfkit';
import path from 'node:path';
import type { AppLocale } from '@/lib/i18n/locale';
import { emailCopy, emailTime, emailPaymentMethod } from '@/lib/email/copy';
import { formatMYR } from '@/lib/i18n/format';

export type ReceiptItem = {
  activityName: string;
  variantLabel: string;
  unitPrice: number;
  qty: number;
};

export type ReceiptData = {
  locale?: AppLocale;
  orderId: string;
  orderReference?: string;
  recipientName: string;
  createdAt: string;
  paymentMethod: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  voucherCode?: string;
};

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const copy = emailCopy(data.locale);
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    // Embed CJK glyphs for Chinese copy and Chinese names in any language.
    const cjk = data.locale === 'zh-CN' || /[\u2e80-\u9fff\uf900-\ufaff]/u.test(JSON.stringify(data));
    if (cjk) doc.registerFont('ReceiptCJK', path.join(process.cwd(), 'lib/pdf/fonts/NotoSansCJKsc-Regular.otf'));
    const regular = cjk ? 'ReceiptCJK' : 'Helvetica';
    const bold = cjk ? 'ReceiptCJK' : 'Helvetica-Bold';
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).font(bold).text('MYLawatan Malaysia', { align: 'center' });
    doc.fontSize(11).font(regular).text(copy.receipt, { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Order details
    doc.fontSize(10).font(bold).text(copy.orderId + ':', { continued: true }).font(regular).text(`  ${data.orderReference ?? data.orderId}`);
    doc.font(bold).text(copy.date + ':', { continued: true }).font(regular).text(`  ${emailTime(data.createdAt, data.locale)}`);
    doc.font(bold).text(copy.payment + ':', { continued: true }).font(regular).text(`  ${emailPaymentMethod(data.paymentMethod, data.locale)}`);
    doc.font(bold).text(copy.customer + ':', { continued: true }).font(regular).text(`  ${data.recipientName}`);
    doc.moveDown(0.8);

    // Items header
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    const colX = { item: 50, variant: 220, qty: 360, price: 410, total: 470 };
    doc.fontSize(10).font(bold);
    const headerY = doc.y;
    let headerBottom = headerY;
    for (const [label, x, width, align] of [
      [copy.activity, colX.item, 165, 'left'],
      [copy.variant, colX.variant, 130, 'left'],
      [copy.quantity, colX.qty, 45, 'right'],
      [copy.unitPrice, colX.price, 55, 'right'],
      [copy.total, colX.total, 75, 'right'],
    ] as const) {
      doc.text(label, x, headerY, { width, align });
      headerBottom = Math.max(headerBottom, doc.y);
    }
    doc.y = headerBottom;
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    // Items rows
    doc.font(regular).fontSize(9);
    for (const item of data.items) {
      const rowY = doc.y;
      doc.text(item.activityName, colX.item, rowY, { width: 165 });
      const lineHeight = doc.y - rowY;
      doc.text(item.variantLabel, colX.variant, rowY, { width: 130 });
      doc.text(String(item.qty), colX.qty, rowY, { width: 45, align: 'right' });
      doc.text(formatMYR(item.unitPrice), colX.price, rowY, { width: 55, align: 'right' });
      doc.text(formatMYR(item.unitPrice * item.qty), colX.total, rowY, { width: 75, align: 'right' });
      if (doc.y < rowY + lineHeight) doc.y = rowY + lineHeight;
      doc.moveDown(0.2);
    }

    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Totals
    const totalsX = 370;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const totalsW = 175;
    doc.fontSize(10).font(regular);
    doc.text(copy.subtotal + ':', totalsX, doc.y, { width: 90 });
    doc.text(formatMYR(data.subtotal), totalsX + 90, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });

    if (data.discount > 0) {
      const voucherLabel = data.voucherCode ? `${copy.discount} (${data.voucherCode}):` : `${copy.discount}:`;
      doc.text(voucherLabel, totalsX, doc.y, { width: 90 });
      doc.text(formatMYR(data.discount), totalsX + 90, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });
    }

    doc.moveDown(0.3);
    doc.moveTo(totalsX, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font(bold).fontSize(11);
    doc.text(copy.total + ':', totalsX, doc.y, { width: 90 });
    doc.text(formatMYR(data.total), totalsX + 90, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });

    doc.moveDown(2);
    doc.fontSize(9).font(regular).fillColor('#888888').text(copy.thanks, 50, doc.y, { width: 495, align: 'center' });
    doc.text(copy.questions, 50, doc.y, { width: 495, align: 'center' });

    doc.end();
  });
}
