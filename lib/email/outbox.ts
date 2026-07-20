import { createServiceClient } from '@/lib/supabase/service';
import { sendAccountEmail, sendTransactionEmail, sendVendorEmail } from '@/lib/email/sender';
import type {
  AccountEmailInput,
  AccountEmailType,
  TransactionEmailInput,
  TransactionEmailType,
  VendorEmailInput,
  VendorEmailType,
} from '@/lib/email/templates';

export type EmailEventType = TransactionEmailType | AccountEmailType | VendorEmailType;

export type EmailOutboxInput = (TransactionEmailInput | AccountEmailInput | VendorEmailInput) & {
  eventKey: string;
  userId?: string | null;
  toEmail: string;
};

type OutboxRow = {
  id: string;
  to_email: string;
  event_type: EmailEventType;
  payload: {
    recipientName?: string | null;
    amountRm?: number;
    vendorName?: string;
    reference?: string;
    reason?: string;
    occurredAt?: string;
  };
  status: 'pending' | 'sending' | 'sent' | 'failed';
  attempts: number;
};

export function makeEmailEventKey(eventType: EmailEventType, reference: string): string {
  return `${eventType}:${reference}`;
}

export async function enqueueEmail(input: EmailOutboxInput): Promise<{ inserted: boolean; id?: string }> {
  const db = createServiceClient();
  const payload: OutboxRow['payload'] = {
    recipientName: input.recipientName ?? null,
    occurredAt: input.occurredAt,
  };
  if ('amountRm' in input) payload.amountRm = input.amountRm;
  if ('vendorName' in input) payload.vendorName = input.vendorName;
  if ('reference' in input) payload.reference = input.reference ?? undefined;
  if ('reason' in input) payload.reason = input.reason;

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

export async function processEmailOutbox(limit = 20): Promise<{ sent: number; failed: number }> {
  const db = createServiceClient();
  const { data: claimed, error: claimError } = await db.rpc('claim_email_outbox', { p_limit: limit });
  if (claimError) throw claimError;

  let sent = 0;
  let failed = 0;
  for (const row of (claimed ?? []) as OutboxRow[]) {
    try {
      if (row.event_type.startsWith('vendor_')) {
        await sendVendorEmail({
          eventType: row.event_type as VendorEmailType,
          recipientName: row.payload?.recipientName ?? null,
          vendorName: String(row.payload?.vendorName ?? 'Your vendor'),
          reason: String(row.payload?.reason ?? 'Vendor notification update'),
          reference: row.payload?.reference ?? null,
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          to: row.to_email,
        });
      } else if (row.event_type.startsWith('account_')) {
        await sendAccountEmail({
          eventType: row.event_type as AccountEmailType,
          recipientName: row.payload?.recipientName ?? null,
          reason: String(row.payload?.reason ?? 'Account status updated'),
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          to: row.to_email,
        });
      } else {
        await sendTransactionEmail({
          eventType: row.event_type as TransactionEmailType,
          recipientName: row.payload?.recipientName ?? null,
          amountRm: Number(row.payload?.amountRm ?? 0),
          reference: String(row.payload?.reference ?? row.id),
          occurredAt: String(row.payload?.occurredAt ?? new Date().toISOString()),
          to: row.to_email,
        });
      }
      await db.from('email_outbox').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq('id', row.id);
      sent += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Email send failed';
      await db.from('email_outbox').update({
        status: 'failed',
        last_error: message.slice(0, 500),
        next_attempt_at: new Date(Date.now() + 60_000).toISOString(),
        updated_at: new Date().toISOString(),
      }).eq('id', row.id);
      failed += 1;
    }
  }

  return { sent, failed };
}
