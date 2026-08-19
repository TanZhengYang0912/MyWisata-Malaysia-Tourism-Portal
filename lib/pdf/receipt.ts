import PDFDocument from 'pdfkit';

export type ReceiptItem = {
  activityName: string;
  variantLabel: string;
  unitPrice: number;
  qty: number;
};

export type ReceiptData = {
  orderId: string;
  recipientName: string;
  createdAt: string;
  paymentMethod: string;
  items: ReceiptItem[];
  subtotal: number;
  discount: number;
  total: number;
  voucherCode?: string;
};

function formatMYR(amount: number): string {
  return `MYR ${amount.toFixed(2)}`;
}

export function generateReceiptPdf(data: ReceiptData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const chunks: Buffer[] = [];

    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    // Header
    doc.fontSize(22).font('Helvetica-Bold').text('MyWisata Malaysia', { align: 'center' });
    doc.fontSize(11).font('Helvetica').text('Order Receipt', { align: 'center' });
    doc.moveDown(0.5);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.5);

    // Order details
    doc.fontSize(10).font('Helvetica-Bold').text('Order ID:', { continued: true }).font('Helvetica').text(`  ${data.orderId}`);
    doc.font('Helvetica-Bold').text('Date:', { continued: true }).font('Helvetica').text(`  ${new Date(data.createdAt).toLocaleString('en-MY', { timeZone: 'Asia/Kuala_Lumpur' })}`);
    doc.font('Helvetica-Bold').text('Payment:', { continued: true }).font('Helvetica').text(`  ${data.paymentMethod.replace(/_/g, ' ')}`);
    doc.font('Helvetica-Bold').text('Customer:', { continued: true }).font('Helvetica').text(`  ${data.recipientName}`);
    doc.moveDown(0.8);

    // Items header
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    const colX = { item: 50, variant: 220, qty: 360, price: 410, total: 470 };
    doc.fontSize(10).font('Helvetica-Bold');
    doc.text('Activity', colX.item, doc.y, { width: 165 });
    const headerY = doc.y - doc.currentLineHeight();
    doc.text('Variant', colX.variant, headerY, { width: 130 });
    doc.text('Qty', colX.qty, headerY, { width: 45, align: 'right' });
    doc.text('Unit Price', colX.price, headerY, { width: 55, align: 'right' });
    doc.text('Total', colX.total, headerY, { width: 75, align: 'right' });
    doc.moveDown(0.3);
    doc.moveTo(50, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);

    // Items rows
    doc.font('Helvetica').fontSize(9);
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
    doc.fontSize(10).font('Helvetica');
    doc.text('Subtotal:', totalsX, doc.y, { width: 90 });
    doc.text(formatMYR(data.subtotal), totalsX + 90, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });

    if (data.discount > 0) {
      const voucherLabel = data.voucherCode ? `Discount (${data.voucherCode}):` : 'Discount:';
      doc.text(voucherLabel, totalsX, doc.y, { width: 90 });
      doc.text(`-${formatMYR(data.discount)}`, totalsX + 90, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });
    }

    doc.moveDown(0.3);
    doc.moveTo(totalsX, doc.y).lineTo(545, doc.y).stroke();
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(11);
    doc.text('TOTAL:', totalsX, doc.y, { width: 90 });
    doc.text(formatMYR(data.total), totalsX + 90, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });

    doc.moveDown(2);
    doc.fontSize(9).font('Helvetica').fillColor('#888888').text('Thank you for booking with MyWisata Malaysia!', { align: 'center' });
    doc.text('For support, contact us at mywisatamalaysia@gmail.com', { align: 'center' });

    doc.end();
  });
}
