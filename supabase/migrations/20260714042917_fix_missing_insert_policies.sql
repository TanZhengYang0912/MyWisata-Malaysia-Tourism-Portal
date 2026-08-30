-- The reenable_rls migration (028) restored SELECT-only policies on orders/
-- order_items/bookings, with no matching INSERT policy. Since RLS defaults to
-- deny, every customer checkout has been failing with 42501 since that
-- migration. This adds the missing owner-scoped INSERT policies, reusing the
-- order_owned_by/is_admin helpers already defined in 028 to avoid the
-- orders<->order_items recursion.

drop policy if exists orders_insert_own on public.orders;
create policy orders_insert_own on public.orders
  for insert
  with check (user_id = auth.uid());

drop policy if exists order_items_insert_own on public.order_items;
create policy order_items_insert_own on public.order_items
  for insert
  with check (order_owned_by(order_id, auth.uid()));

drop policy if exists bookings_insert_own on public.bookings;
create policy bookings_insert_own on public.bookings
  for insert
  with check (customer_id = auth.uid());
;
