import { escapeHtml } from '@/lib/email/templates';
import nodemailer from 'nodemailer';
import QRCode from 'qrcode';
import { getEmailConfig } from '@/lib/email/config';
import { classifyEmailDeliveryError, emailTransportTimeouts, type EmailDelivery } from '@/lib/email/delivery';
import { generateReceiptPdf, type ReceiptData } from '@/lib/pdf/receipt';
import { emailCopy, emailLocale } from './copy';
import { formatMYR } from '@/lib/i18n/format';
import type { AppLocale } from '@/lib/i18n/locale';
import { ensureCustomEmailDeliveryEnabled } from '@/lib/platform/operations-settings';

export type OrderReceiptPickupPass = {
  kind: 'food' | 'event' | 'retail';
  title: string;
  subtitle: string;
  details: string[];
  qrUrl: string;
};

export type OrderReceiptPayload = ReceiptData & { recipientEmail: string; locale?: AppLocale; accessUrl?: string; pickupPasses?: OrderReceiptPickupPass[]; delivery?: EmailDelivery };

function redactError(error: unknown): Error {
  const message = error instanceof Error ? error.message : 'Unknown SMTP error';
  return new Error(message.replace(/(?:password|pass|token|secret|auth)=[^\s]+/gi, '$1=[redacted]'));
}

export async function sendOrderReceiptEmail(payload: OrderReceiptPayload): Promise<{ id: string }> {
  if (!payload.delivery) await ensureCustomEmailDeliveryEnabled();
  const pdfBuffer = await generateReceiptPdf(payload);

  const copy = emailCopy(payload.locale);
  const pickupPasses = await Promise.all((payload.pickupPasses ?? []).map(async (pass, index) => ({
    ...pass,
    instructions: pass.kind === 'event' ? copy.eventPickupQrInstructions : pass.kind === 'retail' ? copy.retailPickupQrInstructions : copy.pickupQrInstructions,
    cid: `pickup-qr-${index}@mylawatan.my`,
    image: await QRCode.toBuffer(pass.qrUrl, { type: 'png', width: 256, margin: 2, errorCorrectionLevel: 'M' }),
  })));
  const pickupHtml = pickupPasses.map((pass) => `
    <section style="margin:20px 0;padding:16px;border:1px solid #ddd;border-radius:10px;page-break-inside:avoid">
      <h3 style="margin:0 0 8px;color:#1a7f5a">${copy.pickupQrTitle}: ${escapeHtml(pass.title)}</h3>
      <p style="margin:0 0 8px;color:#555">${escapeHtml(pass.subtitle)}</p>
      <p style="margin:0 0 12px;color:#555">${pass.instructions}</p>
      <ul style="margin:0 0 12px;padding-left:20px">${pass.details.map((detail) => `<li>${escapeHtml(detail)}</li>`).join('')}</ul>
      <img src="cid:${pass.cid}" alt="${escapeHtml(copy.qrImageAlt)}" width="256" height="256" style="display:block;width:256px;height:256px;max-width:100%;background:#fff" />
    </section>`).join('');
  const orderRef = payload.orderReference ?? payload.orderId;
  const subject = `${copy.receiptSubject} – ${orderRef}`;

  const html = `
<!DOCTYPE html>
<html lang="${emailLocale(payload.locale)}">
<body style="font-family:Arial,sans-serif;color:#333;max-width:600px;margin:0 auto;padding:20px">
  <h2 style="color:#1a7f5a">${copy.confirmed}</h2>
  <p>${copy.greeting} ${escapeHtml(payload.recipientName)},</p>
  <p>${copy.receiptIntro}</p>
  <table style="width:100%;border-collapse:collapse;margin:16px 0">
    <tr style="background:#f5f5f5">
      <th style="text-align:left;padding:8px;border:1px solid #ddd">${copy.activity}</th>
      <th style="text-align:right;padding:8px;border:1px solid #ddd">${copy.quantity}</th>
      <th style="text-align:right;padding:8px;border:1px solid #ddd">${copy.amount}</th>
    </tr>
    ${payload.items.map(item => `
    <tr>
      <td style="padding:8px;border:1px solid #ddd">${escapeHtml(item.activityName)}<br><span style="color:#777;font-size:12px">${escapeHtml(item.variantLabel)}</span></td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd">${item.qty}</td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd">${formatMYR(item.unitPrice * item.qty)}</td>
    </tr>`).join('')}
    ${payload.discount > 0 ? `
    <tr>
      <td colspan="2" style="padding:8px;border:1px solid #ddd;text-align:right">${copy.discount}${payload.voucherCode ? ` (${escapeHtml(payload.voucherCode)})` : ''}:</td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd;color:#c0392b">${formatMYR(payload.discount)}</td>
    </tr>` : ''}
    <tr style="font-weight:bold;background:#f5f5f5">
      <td colspan="2" style="padding:8px;border:1px solid #ddd;text-align:right">${copy.total}:</td>
      <td style="text-align:right;padding:8px;border:1px solid #ddd">${formatMYR(payload.total)}</td>
    </tr>
  </table>
  ${pickupHtml}
  ${payload.accessUrl ? `<p><a href="${escapeHtml(payload.accessUrl)}">${copy.viewOrder}</a> — ${copy.privateLink}</p>` : ""}
  <p style="color:#777;font-size:13px">${copy.orderId}: ${escapeHtml(orderRef)}</p>
  <p style="color:#777;font-size:13px">${copy.questions}</p>
  <p>${copy.seeYou}</p>
</body>
</html>`;

  const text = [
    `${copy.confirmed} – ${copy.orderId} ${orderRef}`,
    '',
    `${copy.greeting} ${payload.recipientName},`,
    copy.receiptIntro,
    '',
    ...payload.items.map(i => `• ${i.activityName} (${i.variantLabel}) x${i.qty}: ${formatMYR(i.unitPrice * i.qty)}`),
    payload.discount > 0 ? `${copy.discount}: ${formatMYR(payload.discount)}` : '',
    `${copy.total}: ${formatMYR(payload.total)}`,
    '',
    ...(pickupPasses.length ? pickupPasses.flatMap((pass) => [
      `${copy.pickupQrTitle}: ${pass.title}`,
      pass.subtitle,
      pass.instructions,
      ...pass.details.map((detail) => `- ${detail}`),
      `${copy.qrImageAlt}: [inline image ${pass.cid}]`,
      '',
    ]) : []),
    `${copy.orderId}: ${orderRef}`,
    payload.accessUrl ? `${copy.viewOrder}: ${payload.accessUrl}` : "",
  ].filter(line => line !== undefined).join('\n');

  const config = getEmailConfig();
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.port === 465,
    auth: { user: config.user, pass: config.pass },
    ...emailTransportTimeouts,
  });

  let attempted = false;
  try {
    await payload.delivery?.beforeSend();
    attempted = true;
    const result = await transport.sendMail({
      from: config.from,
      to: payload.recipientEmail,
      subject,
      text,
      html,
      attachments: [
        { filename: `receipt-${orderRef}.pdf`, content: pdfBuffer, contentType: 'application/pdf' },
        ...pickupPasses.map((pass) => ({ filename: `${pass.cid}.png`, content: pass.image, contentType: 'image/png', contentDisposition: 'inline' as const, cid: pass.cid })),
      ],
      ...(payload.delivery ? { messageId: payload.delivery.messageId } : {}),
    });
    if (!result.accepted?.length || result.rejected?.length) throw new Error('email_delivery_not_confirmed');
    return { id: result.messageId };
  } catch (error) {
    if (payload.delivery) throw classifyEmailDeliveryError(error, attempted);
    throw redactError(error);
  } finally {
    transport.close();
  }
}
