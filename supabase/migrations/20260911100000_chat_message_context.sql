-- Chat message context: richer "what is this conversation about" markers.
--
-- context_product_id already exists (20260731130842) for the customer's
-- "inquiring about this item" flow. This adds:
--   * context_order_id  — a vendor attaching one of the customer's orders as a
--                         Booking-Confirmation card.
--   * context_snapshot  — a server-built, display-only JSON snapshot frozen at
--                         send time (title / subtitle / image / href), so the
--                         card still renders if the product or order later
--                         changes or is deleted (same principle as
--                         order_items.product_name).

ALTER TABLE public.chat_messages
  ADD COLUMN IF NOT EXISTS context_order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS context_snapshot JSONB;

COMMENT ON COLUMN public.chat_messages.context_snapshot IS
  'Server-built display snapshot for the context card: { type, id, title, subtitle, imageUrl, href }. Never trust client-supplied values here.';
