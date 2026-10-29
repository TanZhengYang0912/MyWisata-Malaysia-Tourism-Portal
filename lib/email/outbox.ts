import { emailCopy, emailLocale, emailTime, type EventEmailReasonCode } from './copy';
import { EmailDeliveryError, type EmailDelivery } from '@/lib/email/delivery';
import { sendOrderReceiptEmail } from '@/lib/email/order-receipt';
import { isPlatformOperationEnabled, PLATFORM_OPERATION_KEYS } from '@/lib/platform/operations-settings';
import { loadOrderPickupPasses } from '@/lib/checkout/order-pickup-passes';
import { resolvePaymentAppUrl } from '@/lib/payments/app-url';
import { createServiceClient } from '@/lib/supabase/service';
import {
  sendAccountEmail,
  sendRecommendationEmail,
  sendTransactionEmail,
  sendVendorEmail,
  sendKycSecurityEmail,
} from '@/lib/email/sender';
import type {
  AccountEmailInput,
  AccountEmailType,
  RecommendationEmailInput,
  RecommendationEmailType,
  TransactionEmailInput,
  TransactionEmailType,
  VendorEmailInput,
  VendorEmailType,
  EventVendorChange,
  KycSecurityEmailInput,
} from '@/lib/email/templates';

export type EmailEventType =
  | TransactionEmailType
  | AccountEmailType
  | VendorEmailType
  | 'kyc_security_alert'
  | RecommendationEmailType;

export type EmailOutboxInput = (
  | TransactionEmailInput
  | AccountEmailInput
  | VendorEmailInput
  | RecommendationEmailInput
  | KycSecurityEmailInput
) & {
  eventKey: string;
  userId?: string | null;
  toEmail: string;
};

type OutboxRow = {
  id: string;
  user_id: string | null;
  to_email: string;
  event_type: EmailEventType;
  payload: {
    locale?: string;
    reasonCode?: EventEmailReasonCode;
    reasonDetails?: string;
    recipientName?: string | null;
    amountRm?: number;
    vendorName?: string;
    reference?: string;
    guestAccessToken?: string;
    receiptOrderId?: string;
    reason?: string;
    occurredAt?: string;
    eventChange?: EventVendorChange;
    kind?: KycSecurityEmailInput['kind'];
    count?: number;
    actionPath?: '/vendor/orders' | '/vendor/wallet';
  };
  status: 'pending' | 'sending' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  lease_token: string;
};

export function makeEmailEventKey(eventType: EmailEventType, reference: string): string {
  return `${eventType}:${reference}`;
}

class EmailOutboxCancelledError extends Error {}

export async function enqueueEmail(input: EmailOutboxInput, db = createServiceClient()): Promise<{ inserted: boolean; id?: string }> {
  const payload: OutboxRow['payload'] = {
    locale: emailLocale(input.locale),
    recipientName: input.recipientName ?? null,
    occurredAt: input.occurredAt,
  };
  if ('amountRm' in input) payload.amountRm = input.amountRm;
  if ('vendorName' in input) payload.vendorName = input.vendorName;
  if ('reference' in input) payload.reference = input.reference ?? undefined;
  if ('reason' in input) payload.reason = input.reason;
  if ('reasonCode' in input) payload.reasonCode = input.reasonCode;
  if ('reasonDetails' in input) payload.reasonDetails = input.reasonDetails;
  if ('eventChange' in input) payload.eventChange = input.eventChange;
  if ('kind' in input) payload.kind = input.kind;
  if ('count' in input) payload.count = input.count;

  const { data, error } = await db
    .from('email_outbox')
    .upsert({
      event_key: input.eventKey,
      user_id: input.userId ?? null,
      to_email: input.toEmail,
      event_type: input.eventType,
      payload,
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
    }, { onConflict: 'event_key', ignoreDuplicates: true })
    .select('id')
    .maybeSingle();

  if (error) throw error;
  return { inserted: Boolean(data), id: data?.id as string | undefined };
}

export async function processEmailOutbox(limit = 2): Promise<{ sent: number; failed: number; reviewRequired: number }> {
  if (await isPlatformOperationEnabled(PLATFORM_OPERATION_KEYS.pauseCustomDelivery)) {
    return { sent: 0, failed: 0, reviewRequired: 0 };
  }
  const db = createServiceClient();
  const { data: claimed, error: claimError } = await db.rpc('claim_email_outbox_delivery_v2', { p_limit: Math.max(1, Math.min(Number.isFinite(limit) ? Math.floor(limit) : 2, 2)) });
  if (claimError || !claimed || !Array.isArray(claimed.rows)) throw new Error('email_claim_unavailable');

  let sent = 0;
  let failed = 0;
  let reviewRequired = Number(claimed.reviewRequired ?? 0);
  for (const row of claimed.rows as OutboxRow[]) {
    const locale = emailLocale(row.payload?.locale);
    const copy = emailCopy(locale);
    let started = false;
    let stateUnavailable = false;
    let cancelled = false;
    const delivery: EmailDelivery = {
      messageId: `<outbox-${row.id}@mylawatan.my>`,
      beforeSend: async () => {
        const { data, error } = await db.rpc('begin_email_outbox_delivery', { p_id: row.id, p_token: row.lease_token });
        if (error) { stateUnavailable = true; throw new Error('email_state_unavailable'); }
        if (data !== true) {
          let currentStatus: string | undefined;
          try {
            const { data: current, error: currentError } = await db.from('email_outbox').select('status').eq('id', row.id).maybeSingle();
            if (!currentError) currentStatus = current?.status;
          } catch { /* If the cancellation check is unavailable, fail closed below. */ }
          if (currentStatus === 'cancelled') {
            cancelled = true;
            throw new EmailOutboxCancelledError('email_delivery_cancelled');
          }
          stateUnavailable = true;
          throw new Error('email_state_unavailable');
        }
        started = true;
      },
    };
    const finish = async (outcome: 'sent' | 'retry' | 'unknown', messageId: string | null = null) => {
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          const { data, error } = await db.rpc('finish_email_outbox_delivery', {
            p_id: row.id, p_token: row.lease_token, p_outcome: outcome, p_message_id: messageId,
          });
          if (!error && data === true) return;
        } catch { /* Retry acknowledgement only; never repeat SMTP here. */ }
      }
      throw new Error('email_state_unavailable');
    };
    let accepted: { id: string } | undefined;
    try {
      if (row.payload?.receiptOrderId || (row.payload?.guestAccessToken && !row.payload.reason)) {
        const isGuest = Boolean(row.payload.guestAccessToken);
        if (!isGuest && !row.user_id) throw new Error('receipt_owner_unavailable');
        let orderQuery = db.from('orders')
          .select('id,display_id,user_id,guest_subject_id,status,contact_email,contact_name,created_at,payment_method,subtotal,discount_amount,total_amount,voucher_code,order_items(product_name,variant_name,unit_price,quantity)')
          .eq('id', row.payload.receiptOrderId ?? row.payload.reference);
        orderQuery = isGuest ? orderQuery.is('user_id', null) : orderQuery.eq('user_id', row.user_id!);
        const { data: order, error } = await orderQuery.single();
        if (error || !order || !['paid', 'completed'].includes(String(order.status).toLowerCase())) throw new Error('receipt_order_unavailable');
        if (isGuest && !order.guest_subject_id) throw new Error('receipt_owner_unavailable');
        let recipient = order.contact_email?.trim();
        if (!recipient && !isGuest) {
          const { data: account, error: accountError } = await db.from('users').select('email').eq('id', row.user_id!).single();
          if (accountError) throw new Error('receipt_recipient_unavailable');
          recipient = account?.email?.trim();
        }
        if (!recipient || recipient.toLowerCase() !== row.to_email.trim().toLowerCase()) throw new Error('receipt_recipient_unavailable');
        const pickupPasses = await loadOrderPickupPasses(db, order.id);
        const orderUrl = new URL(`/customer/orders/${encodeURIComponent(order.id)}`, resolvePaymentAppUrl());
        const foodPickupPasses = pickupPasses.foodOrders.map((pass) => {
          const url = new URL(orderUrl);
          url.searchParams.set('food_t', pass.foodToken);
          return {
            kind: 'food' as const,
            title: pass.outletName,
            subtitle: pass.vendorName,
            details: [pass.mode === 'dine_in' ? copy.foodDineIn : copy.foodTakeaway, ...pass.items.map((item) => `${item.quantity} × ${item.name}${item.variant ? ` · ${item.variant}` : ''}`)],
            qrUrl: url.toString(),
          };
        });
        const eventPickupPasses = pickupPasses.eventPickups.map((pass) => {
          const url = new URL(orderUrl);
          url.searchParams.set('event_t', pass.eventToken);
          return {
            kind: 'event' as const,
            title: pass.pickupLabels.join(', '),
            subtitle: `${pass.vendorName} · ${emailTime(`${pass.pickupDate}T00:00:00+08:00`, locale)}`,
            details: pass.items.map((item) => `${item.quantity} × ${item.name}`),
            qrUrl: url.toString(),
          };
        });
        const retailPickupPasses = pickupPasses.retailPickups.flatMap((pass) => {
          if (pass.status !== 'pending' || !pass.retailToken) return [];
          const url = new URL(orderUrl);
          url.searchParams.set('retail_t', pass.retailToken);
          return [{
            kind: 'retail' as const,
            title: pass.outletName,
            subtitle: pass.vendorName,
            details: [`${pass.quantity} × ${pass.name}${pass.variant ? ` · ${pass.variant}` : ''}`],
            qrUrl: url.toString(),
          }];
        });
        accepted = await sendOrderReceiptEmail({
          delivery, locale,
          recipientEmail:row.to_email,recipientName:order.contact_name ?? copy.guest,orderId:order.id,orderReference:order.display_id ?? order.id,createdAt:order.created_at,paymentMethod:order.payment_method ?? 'free_reservation',
          items:(order.order_items ?? []).map(item=>({activityName:item.product_name,variantLabel:item.variant_name ?? copy.standard,unitPrice:Number(item.unit_price),qty:item.quantity})),
          subtotal:Number(order.subtotal),discount:Number(order.discount_amount),total:Number(order.total_amount),
          accessUrl: isGuest ? `${resolvePaymentAppUrl()}/customer/orders/access#token=${row.payload.guestAccessToken}` : orderUrl.toString(),
          voucherCode: order.voucher_code ?? undefined,
          pickupPasses: [...foodPickupPasses, ...eventPickupPasses, ...retailPickupPasses],
        });
      } else if (row.event_type === 'kyc_security_alert') {
        accepted = await sendKycSecurityEmail({
          delivery, locale,
          eventType: 'kyc_security_alert',
          kind: row.payload?.kind as KycSecurityEmailInput['kind'],
          count: Number(row.payload?.count),
          occurredAt: String(row.payload?.occurredAt ?? ''),
          to: row.to_email,
        });
      } else if (row.event_type === 'recommendation_approved') {
        accepted = await sendRecommendationEmail({
          delivery, locale,
          eventType: row.event_type,
          recipientName: row.payload?.recipientName ?? null,
          vendorName: String(row.payload?.vendorName ?? copy.recommendation),
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          to: row.to_email,
        });
      } else if (row.event_type.startsWith('vendor_')) {
        accepted = await sendVendorEmail({
          delivery, locale,
          eventType: row.event_type as VendorEmailType,
          recipientName: row.payload?.recipientName ?? null,
          vendorName: String(row.payload?.vendorName ?? copy.vendor),
          reason: String(row.payload?.reason ?? ''),
          reasonCode: row.payload?.reasonCode,
          reasonDetails: row.payload?.reasonDetails,
          reference: row.payload?.reference ?? null,
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          eventChange: row.payload?.eventChange,
          actionUrl: row.event_type === 'vendor_event_update' ? `${resolvePaymentAppUrl()}/vendor/events`
            : ['/vendor/orders', '/vendor/wallet'].includes(row.payload?.actionPath ?? '') ? `${resolvePaymentAppUrl()}${row.payload.actionPath}` : undefined,
          to: row.to_email,
        });
      } else if (row.event_type.startsWith('account_') || row.event_type === 'staff_withdrawal_approval') {
        accepted = await sendAccountEmail({
          delivery, locale,
          eventType: row.event_type as AccountEmailType,
          recipientName: row.payload?.recipientName ?? null,
          reason: String(row.payload?.reason ?? copy.account),
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          to: row.to_email,
        });
      } else {
        let reference = String(row.payload?.reference ?? row.id);
        if (row.payload?.guestAccessToken) {
          const { data: order, error: orderError } = await db.from('orders')
            .select('id,display_id,contact_email,guest_subject_id,user_id')
            .eq('id', reference)
            .is('user_id', null)
            .maybeSingle();
          if (orderError || !order?.guest_subject_id || order.contact_email?.trim().toLowerCase() !== row.to_email.trim().toLowerCase()) {
            throw new Error('guest_recovery_recipient_unavailable');
          }
          reference = order.display_id ?? order.id;
        }
        accepted = await sendTransactionEmail({
          delivery, locale,
          eventType: row.event_type as TransactionEmailType,
          recipientName: row.payload?.recipientName ?? null,
          amountRm: Number(row.payload?.amountRm ?? 0),
          reference,
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          reason: row.payload?.reason,
          accessUrl: row.payload?.guestAccessToken ? `${resolvePaymentAppUrl()}/customer/orders/access#token=${row.payload.guestAccessToken}` : undefined,
          to: row.to_email,
        });
      }
    } catch (error) {
      if (cancelled && !started && error instanceof EmailOutboxCancelledError) continue;
      if (stateUnavailable) throw new Error('email_state_unavailable');
      const retrySafe = error instanceof EmailDeliveryError ? error.retrySafe : !started;
      await finish(retrySafe ? 'retry' : 'unknown');
      if (retrySafe) { failed += 1; if (row.attempts >= 5) reviewRequired += 1; }
      else reviewRequired += 1;
      continue;
    }
    // SMTP acceptance and its acknowledgement have separate failure boundaries.
    // Never reclassify accepted mail as retryable if this write/response is lost.
    await finish('sent', accepted?.id ?? delivery.messageId);
    sent += 1;
  }

  return { sent, failed, reviewRequired };
}
