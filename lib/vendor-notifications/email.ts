/**
 * Email seam for vendor notifications. Task 3 supplies the durable outbox
 * implementation; keeping this adapter local makes recipient emission
 * production-compilable and straightforward to mock in Task 2 tests.
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

export async function enqueueVendorEmail(_input: VendorEmailEnqueueInput): Promise<void> {
  // Intentionally a no-op until lib/email/events.ts is extended in Task 3.
}
