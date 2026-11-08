// Shape returned by public.get_chat_thread_summaries (migration
// 20261106014314_chat_thread_summaries), mapped to the thread JSON the chat
// lists already used, minus the full message history.

type SummaryRow = {
  id: string;
  customer_id: string;
  outlet_id: string;
  vendor_id: string | null;
  status: string | null;
  last_message_at: string | null;
  created_at: string;
  outlet_name: string | null;
  outlet_city: string | null;
  outlet_state: string | null;
  customer_full_name: string | null;
  customer_email: string | null;
  latest_message: Record<string, unknown> | null;
  unread_count: number;
  muted: boolean;
};

/** `includeCustomer` adds the customer's name and email (vendor inbox only). */
export function toChatThreadSummaries(rows: unknown, includeCustomer = false) {
  return ((rows ?? []) as SummaryRow[]).map((row) => ({
    id: row.id,
    customer_id: row.customer_id,
    outlet_id: row.outlet_id,
    vendor_id: row.vendor_id,
    status: row.status,
    last_message_at: row.last_message_at,
    created_at: row.created_at,
    outlets: { id: row.outlet_id, name: row.outlet_name, city: row.outlet_city, state: row.outlet_state },
    ...(includeCustomer ? { customer: { full_name: row.customer_full_name, email: row.customer_email } } : {}),
    latest_message: row.latest_message,
    unread_count: row.unread_count,
    muted: row.muted,
  }));
}
