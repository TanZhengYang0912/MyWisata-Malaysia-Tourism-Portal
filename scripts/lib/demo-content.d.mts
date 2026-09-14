export function buildDemoReviewCopy(input: {
  product?: { id?: string; name?: string; product_type?: string; type?: string };
  outlet?: { id?: string; name?: string };
  reviewIndex?: number;
  scenarioKey?: string;
}): { rating: number; title: string; body: string };

export function buildDemoReviewRefreshRows(input: {
  existingReviews?: Array<Record<string, unknown>>;
  products?: Array<Record<string, unknown>>;
  outlets?: Array<Record<string, unknown>>;
  canonicalOrderItemIds?: string[];
  approvedVendorIds?: string[];
  customerIds?: string[];
}): Array<Record<string, unknown> & { id: string; rating: number; title: string; body: string }>;

export function buildDemoOrderNote(input: {
  product?: { name?: string };
  outlet?: { name?: string };
  scenarioKey?: string;
}): string;

export function buildDemoVoucherCopy(vendorKey: string): { code: string; name: string };

export function buildDemoBookingReference(orderItemId: string): string;
