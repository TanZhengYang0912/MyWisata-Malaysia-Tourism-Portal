import type { SupabaseClient } from '@supabase/supabase-js';
import { createServiceClient } from '@/lib/supabase/service';
import { enqueueVendorEmail } from '@/lib/vendor-notifications/email';
import {
  resolveVendorRecipients,
  type VendorAudience,
  type VendorRecipient,
} from '@/lib/vendor-notifications/scope';

export type VendorNotificationCategory =
  | 'vendor_orders'
  | 'vendor_bookings'
  | 'vendor_products'
  | 'vendor_wallet'
  | 'vendor_account';

export type VendorNotificationInput = {
  eventKey: string;
  vendorId: string;
  outletId?: string | null;
  audience: VendorAudience;
  category: VendorNotificationCategory;
  type: string;
  title: string;
  body: string;
  link: string;
  email: boolean;
  reference?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
  /** Used after a manager revoke, when the assignment no longer exists in DB. */
  recipientOverrides?: VendorRecipient[];
  /** Optional injection seam for tests and callers that already hold a service client. */
  serviceDb?: SupabaseClient;
};

const emailTypeByCategory: Record<VendorNotificationCategory, string> = {
  vendor_orders: 'vendor_order_update',
  vendor_bookings: 'vendor_booking_update',
  vendor_products: 'vendor_listing_review',
  vendor_wallet: 'vendor_wallet_update',
  vendor_account: 'vendor_account_update',
};

function sanitizeMetadata(metadata: VendorNotificationInput['metadata']): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(metadata ?? {})) {
    if (
      typeof value === 'string'
      || typeof value === 'boolean'
      || value === null
      || (typeof value === 'number' && Number.isFinite(value))
    ) {
      result[key] = value;
    }
  }
  return result;
}

function insertedId(data: unknown): string | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== 'object' || !('id' in row)) return null;
  const id = (row as { id?: unknown }).id;
  return typeof id === 'string' ? id : null;
}

export async function emitVendorNotification(input: VendorNotificationInput): Promise<{
  notificationIds: string[];
  recipientIds: string[];
}> {
  const serviceDb = input.serviceDb ?? (createServiceClient() as SupabaseClient);
  const recipientsResolved = await resolveVendorRecipients({
    vendorId: input.vendorId,
    outletId: input.outletId,
    audience: input.audience,
    allowUnapprovedOwner: input.category === 'vendor_account' && input.audience === 'owner',
    serviceDb,
  });
  const seenRecipients = new Set<string>();
  const recipients = [...recipientsResolved, ...(input.recipientOverrides ?? [])].filter((recipient) => {
    const key = `${recipient.userId}:${recipient.role}:${recipient.outletId ?? ''}`;
    if (seenRecipients.has(key)) return false;
    seenRecipients.add(key);
    return true;
  });
  const notificationIds: string[] = [];

  for (const recipient of recipients) {
    const recipientEventKey = `${input.eventKey}:${recipient.userId}`;
    const { data, error } = await serviceDb
      .from('notifications')
      .insert({
        user_id: recipient.userId,
        vendor_id: input.vendorId,
        outlet_id: recipient.outletId,
        audience_role: recipient.role,
        type: input.type,
        title: input.title,
        body: input.body,
        link: input.link,
        category: input.category,
        metadata: sanitizeMetadata(input.metadata),
        event_key: recipientEventKey,
      }, { onConflict: 'event_key', ignoreDuplicates: true } as never)
      .select('id')
      .maybeSingle();

    if (error) throw error;
    const id = insertedId(data);
    if (id) notificationIds.push(id);

    if (input.email) {
      const vendorName = typeof input.metadata?.vendorName === 'string'
        ? input.metadata.vendorName
        : input.vendorId;
      await enqueueVendorEmail({
        userId: recipient.userId,
        eventKey: recipientEventKey,
        eventType: emailTypeByCategory[input.category],
        vendorName,
        reason: input.body,
        reference: input.reference ?? null,
        occurredAt: new Date().toISOString(),
      });
    }
  }

  return {
    notificationIds,
    recipientIds: recipients.map((recipient: VendorRecipient) => recipient.userId),
  };
}
