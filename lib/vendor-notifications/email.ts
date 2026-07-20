import { enqueueVendorEmail as enqueueDurableVendorEmail } from '@/lib/email/events';

/**
 * Stable adapter for the vendor notification emitter. The implementation is
 * delegated to the durable email outbox while retaining Task 2's input shape.
 */
export type VendorEmailEnqueueInput = {
  userId: string;
  eventKey: string;
  eventType: string;
  vendorName: string;
  reason: string;
  reference?: string | null;
  occurredAt: string;
};

export async function enqueueVendorEmail(input: VendorEmailEnqueueInput): Promise<void> {
  await enqueueDurableVendorEmail({
    ...input,
    eventType: input.eventType as Parameters<typeof enqueueDurableVendorEmail>[0]['eventType'],
    recipientName: null,
  });
}
