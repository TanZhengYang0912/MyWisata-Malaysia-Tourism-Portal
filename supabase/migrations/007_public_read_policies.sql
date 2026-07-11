-- ============================================================
-- Migration 007 — Public-read policies for browsable catalogue tables
--
-- Root cause: after DROP SCHEMA + reseed, some tables silently ended up
-- with RLS enabled but no policies. PostgREST returns empty rows with no
-- error in that state, which broke discovery/search/vendor pages.
--
-- Industrial-grade approach: rather than DISABLE RLS, we KEEP RLS on
-- and add explicit narrow SELECT policies that only expose "publishable"
-- rows (approved vendors, active products, etc.). Writes remain locked
-- down until vendor CRUD routes are wired.
-- ============================================================

-- Idempotent: ensure RLS is on so the policies actually apply
ALTER TABLE products         ENABLE ROW LEVEL SECURITY;
ALTER TABLE product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlets          ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_pages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors          ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories       ENABLE ROW LEVEL SECURITY;
ALTER TABLE booking_slots    ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vouchers         ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews          ENABLE ROW LEVEL SECURITY;
ALTER TABLE share_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_assets     ENABLE ROW LEVEL SECURITY;
ALTER TABLE outlet_managers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_rules      ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_threads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages    ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_message_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_kb_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE carts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE cart_items       ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders           ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items      ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE refunds          ENABLE ROW LEVEL SECURITY;
ALTER TABLE voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- ─────────────────────────────────────────────────────────────
-- CATALOGUE (public browsing — anyone can see published items)
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS categories_public_read ON categories;
CREATE POLICY categories_public_read ON categories
  FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS vendors_public_read ON vendors;
CREATE POLICY vendors_public_read ON vendors
  FOR SELECT USING (status = 'approved' OR owner_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS outlets_public_read ON outlets;
CREATE POLICY outlets_public_read ON outlets
  FOR SELECT USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = outlets.vendor_id
                 AND (v.owner_id = auth.uid() OR is_admin(auth.uid())))
    OR EXISTS (SELECT 1 FROM outlet_managers om WHERE om.outlet_id = outlets.id AND om.user_id = auth.uid())
  );

DROP POLICY IF EXISTS outlet_pages_public_read ON outlet_pages;
CREATE POLICY outlet_pages_public_read ON outlet_pages FOR SELECT USING (true);

DROP POLICY IF EXISTS products_public_read ON products;
CREATE POLICY products_public_read ON products
  FOR SELECT USING (
    status = 'active'
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = products.vendor_id
                 AND (v.owner_id = auth.uid() OR is_admin(auth.uid())))
  );

DROP POLICY IF EXISTS variants_public_read ON product_variants;
CREATE POLICY variants_public_read ON product_variants FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS inventory_public_read ON inventory;
CREATE POLICY inventory_public_read ON inventory FOR SELECT USING (true);

DROP POLICY IF EXISTS slots_public_read ON booking_slots;
CREATE POLICY slots_public_read ON booking_slots FOR SELECT USING (true);

DROP POLICY IF EXISTS vouchers_public_read ON vouchers;
CREATE POLICY vouchers_public_read ON vouchers FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS media_public_read ON media_assets;
CREATE POLICY media_public_read ON media_assets FOR SELECT USING (true);

DROP POLICY IF EXISTS price_rules_public_read ON price_rules;
CREATE POLICY price_rules_public_read ON price_rules FOR SELECT USING (is_active = true);

DROP POLICY IF EXISTS reviews_public_read ON reviews;
CREATE POLICY reviews_public_read ON reviews FOR SELECT USING (is_visible = true);

DROP POLICY IF EXISTS chatbot_kb_public_read ON chatbot_kb_documents;
CREATE POLICY chatbot_kb_public_read ON chatbot_kb_documents FOR SELECT USING (is_active = true);

-- ─────────────────────────────────────────────────────────────
-- OWN / ADMIN scoped tables
-- ─────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS outlet_managers_scoped ON outlet_managers;
CREATE POLICY outlet_managers_scoped ON outlet_managers
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS carts_own ON carts;
CREATE POLICY carts_own ON carts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS cart_items_own ON cart_items;
CREATE POLICY cart_items_own ON cart_items FOR ALL
  USING (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM carts c WHERE c.id = cart_items.cart_id AND c.user_id = auth.uid()));

DROP POLICY IF EXISTS orders_own_or_admin ON orders;
CREATE POLICY orders_own_or_admin ON orders
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM order_items oi
      JOIN vendors v ON v.id = oi.vendor_id
      WHERE oi.order_id = orders.id AND v.owner_id = auth.uid()
    ));

DROP POLICY IF EXISTS order_items_own_or_vendor ON order_items;
CREATE POLICY order_items_own_or_vendor ON order_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM orders o WHERE o.id = order_items.order_id AND o.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM vendors v WHERE v.id = order_items.vendor_id AND v.owner_id = auth.uid())
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS bookings_own_or_vendor ON bookings;
CREATE POLICY bookings_own_or_vendor ON bookings
  FOR SELECT USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM order_items oi
               JOIN vendors v ON v.id = oi.vendor_id
               WHERE oi.id = bookings.order_item_id AND v.owner_id = auth.uid())
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS payments_own ON payments;
CREATE POLICY payments_own ON payments
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = payments.order_id
      AND (o.user_id = auth.uid() OR is_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS refunds_own ON refunds;
CREATE POLICY refunds_own ON refunds
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM orders o WHERE o.id = refunds.order_id
      AND (o.user_id = auth.uid() OR is_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS voucher_redemptions_own ON voucher_redemptions;
CREATE POLICY voucher_redemptions_own ON voucher_redemptions
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));

DROP POLICY IF EXISTS share_events_own ON share_events;
CREATE POLICY share_events_own ON share_events
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));
DROP POLICY IF EXISTS share_events_insert_own ON share_events;
CREATE POLICY share_events_insert_own ON share_events
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS interactions_own ON user_interactions;
CREATE POLICY interactions_own ON user_interactions FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS chat_threads_participant ON chat_threads;
CREATE POLICY chat_threads_participant ON chat_threads
  FOR SELECT USING (
    customer_id = auth.uid()
    OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
                 WHERE o.id = chat_threads.outlet_id AND v.owner_id = auth.uid())
    OR EXISTS (SELECT 1 FROM outlet_managers om
                 WHERE om.outlet_id = chat_threads.outlet_id AND om.user_id = auth.uid())
    OR is_admin(auth.uid())
  );

DROP POLICY IF EXISTS chat_messages_participant ON chat_messages;
CREATE POLICY chat_messages_participant ON chat_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM chat_threads t WHERE t.id = chat_messages.thread_id
      AND (t.customer_id = auth.uid() OR is_admin(auth.uid())
           OR EXISTS (SELECT 1 FROM outlets o JOIN vendors v ON v.id = o.vendor_id
                        WHERE o.id = t.outlet_id AND v.owner_id = auth.uid())
           OR EXISTS (SELECT 1 FROM outlet_managers om
                        WHERE om.outlet_id = t.outlet_id AND om.user_id = auth.uid()))
  ));

DROP POLICY IF EXISTS chatbot_sessions_own ON chatbot_sessions;
CREATE POLICY chatbot_sessions_own ON chatbot_sessions
  FOR SELECT USING (user_id = auth.uid() OR user_id IS NULL);

DROP POLICY IF EXISTS chatbot_messages_own ON chatbot_messages;
CREATE POLICY chatbot_messages_own ON chatbot_messages
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM chatbot_sessions s WHERE s.id = chatbot_messages.session_id
      AND (s.user_id = auth.uid() OR s.user_id IS NULL OR is_admin(auth.uid()))
  ));

DROP POLICY IF EXISTS chat_reads_own ON chat_message_reads;
CREATE POLICY chat_reads_own ON chat_message_reads
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS support_own_or_admin ON support_tickets;
CREATE POLICY support_own_or_admin ON support_tickets
  FOR SELECT USING (user_id = auth.uid() OR is_admin(auth.uid()));
DROP POLICY IF EXISTS support_insert_own ON support_tickets;
CREATE POLICY support_insert_own ON support_tickets
  FOR INSERT WITH CHECK (user_id = auth.uid() OR user_id IS NULL);
