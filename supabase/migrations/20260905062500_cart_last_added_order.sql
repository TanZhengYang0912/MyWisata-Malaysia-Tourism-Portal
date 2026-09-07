alter table cart_items
  add column last_added_at timestamptz;

update cart_items
set last_added_at = created_at
where last_added_at is null;

alter table cart_items
  alter column last_added_at set default now(),
  alter column last_added_at set not null;

create index idx_cart_items_cart_last_added
  on cart_items (cart_id, last_added_at desc, created_at desc, id desc);
