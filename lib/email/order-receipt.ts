import nodemailer from 'nodemailer';
import { getEmailConfig } from '@/lib/email/config';
import { generateReceiptPdf, type ReceiptData } from '@/lib/pdf/receipt';
import { formatMYR } from '@/lib/i18n/format';

export type OrderReceiptPayload = ReceiptData & { recipientEmail: string };

function redactError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Unknown SMTP error';
  return new Error(message.replace(/(?:password|pass|token|secret|auth)=[^\s]+/gi, '$1=[redacted]'));
}

export async function sendOrderReceiptEmail(payload: OrderReceiptPayload): Promise<void> {
  const pdfBuffer = await generateReceiptPdf(payload);

  const orderRef = payload.orderId.slice(-8).toUpperCase();
  const subject = `Your MyWisata Order Receipt – ${orderRef}`;

  const html = `
<!DOCTYPE html>
<html>
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a7f5a">Booking Confirmed!</h2>
  <p>Hi ${payload.recipientName},</p>
  <p>Thank you for your order. Your receipt is attached as a PDF. Here's a summary:</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f5f5f5">
      <th style="text-align:left;padding:8px;border:1px solid #ddd">Activity</th>
      <th style="text-align:right;padding:8px;border:1px solid #ddd">Qty</th>
      <th style="text-align:right;padding:8px;border:1px solid #ddd">Amount</th>
    </tr>
    ${payload.items.map(item => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd">${item.activityName}<br><span style="color:#777;font-size:12px">${item.variantLabel}</span></td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd">${item.qty}</td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd">${formatMYR(item.unitPrice * item.qty)}</td>
    </tr>`).join('')}
    ${payload.discount > 0 ? `
    <tr>
      <td colspan="2" style="padding:8px;border:1px solid #ddd;text-align:right">Discount${payload.voucherCode ? ` (${payload.voucherCode})` : ''}:</td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd;color:#c0392b">${formatMYR(payload.discount)}</td>
    </tr>` : ''}
    <tr style="font-weight:bold;background:#f5f5f5">
      <td colspan="2" style="padding:8px;border:1px solid #ddd;text-align:right">Total:</td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd">${formatMYR(payload.total)}</td>
    </tr>
  </table>
  <p style="color:#777;font-size:13px">Order ID: ${payload.orderId}</p>
  <p style="color:#777;font-size:13px">Questions? Email us at mywisatamalaysia@gmail.com</p>
  <p>See you in Malaysia! 🌴</p>
</body>
</html>`;

  const text = [
    `Booking Confirmed – Order ${orderRef}`,
    '',
    `Hi ${payload.recipientName},`,
    'Thank you for your order. Please find your receipt attached.',
    '',
    ...payload.items.map(i => `• ${i.activityName} (${i.variantLabel}) x${i.qty}: ${formatMYR(i.unitPrice * i.qty)}`),
    payload.discount > 0 ? `Discount: ${formatMYR(payload.discount)}` : '',
    `Total: ${formatMYR(payload.total)}`,
    '',
    `Order ID: ${payload.orderId}`,
  ].filter(line => line !== undefined).join('\n');

  const config = getEmailConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
  });

  try {
    await transport.sendMail({
      from: config.from,
      to: payload.recipientEmail,
      subject,
      text,
      html,
      attachments: [{ filename: `receipt-${orderRef}.pdf`, content: pdfBuffer, contentType: 'application/pdf' }],
    });
  } catch (error) {
    throw redactError(error);
  } finally {
    transport.close();
  }
}
