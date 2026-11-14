-- One-off demo data repair (2026-11-14). Not a migration: it fixes seed output, not the schema.
--
-- The old demo seed created one `products` row per outlet for the same item, so
-- Rasa Malaysia Kitchen ("Cendol Gula Melaka" x6, ...) and Kraftangan Artisan
-- Market showed one card per outlet instead of one card with "N locations" and
-- "From RM". The schema already models one product sold at many outlets through
-- `outlet_offers`; this moves the duplicates onto that shape.
--
-- Per (vendor, lower(name)) group of active+approved products:
--   * the oldest row (created_at, then id) is kept;
--   * every other row's outlet_offers move to the kept row, keeping their own
--     outlet and price;
--   * the other rows are archived (status = 'archived'), never deleted.
--
-- Scope is the two demo vendors only. Distinct real products must never be
-- merged because their names match (CLAUDE.md), so the vendor list is explicit.
--
-- Preflight (2026-11-14, project ncdlaehknicabzjqskvk):
--   39 duplicate rows in 8 groups, 39 offers to move.
--   0 rows reference them in order_items, reviews, vouchers, booking_slots,
--   product_variants, media_assets, customer_wishlists, trip_items,
--   product_places, price_rules, promotion_campaign_*, sponsored_discovery_*,
--   digital_entitlements, chat_messages, external_booking_sources,
--   product_source_evidence, or the featured/bundle uuid[] columns.
--   No two moved offers land on the same (product, outlet).
-- The guards below stop the transaction if any of that is no longer true.

begin;

create temp table demo_duplicate_products on commit drop as
select id, keeper
from (
  select p.id,
    first_value(p.id) over (partition by p.vendor_id, lower(p.name) order by p.created_at, p.id) as keeper,
    count(*) over (partition by p.vendor_id, lower(p.name)) as group_size
  from products p
  where p.vendor_id in ('bbbbbbbb-0000-0000-0000-000000000001', 'dfde2fb1-4900-464e-ae23-840f7a6c3e1c')
    and p.status = 'active'
    and p.review_status = 'approved'
) grouped
where group_size > 1 and id <> keeper;

do $$
begin
  if exists (select 1 from order_items x join demo_duplicate_products d on d.id = x.product_id)
    or exists (select 1 from reviews x join demo_duplicate_products d on d.id = x.product_id)
    or exists (select 1 from vouchers x join demo_duplicate_products d on d.id = x.product_id)
    or exists (select 1 from booking_slots x join demo_duplicate_products d on d.id = x.product_id)
    or exists (select 1 from product_variants x join demo_duplicate_products d on d.id = x.product_id)
    or exists (select 1 from customer_wishlists x join demo_duplicate_products d on d.id = x.product_id)
    or exists (select 1 from trip_items x join demo_duplicate_products d on d.id = x.experience_id) then
    raise exception 'A duplicate product is now referenced by commerce or trip data; repoint it before merging.';
  end if;
  if exists (
    select 1 from outlet_offers o join demo_duplicate_products d on d.id = o.product_id
    group by d.keeper, o.outlet_id
    having count(*) > 1 or bool_or(exists (select 1 from outlet_offers k where k.product_id = d.keeper and k.outlet_id = o.outlet_id))
  ) then
    raise exception 'Two offers would land on the same (product, outlet).';
  end if;
end $$;

update outlet_offers o
set product_id = d.keeper
from demo_duplicate_products d
where o.product_id = d.id;

update products p
set status = 'archived'
from demo_duplicate_products d
where p.id = d.id;

commit;
