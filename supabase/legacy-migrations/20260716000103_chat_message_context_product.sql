-- 6.2.2: nullable context link so a chat message can carry "Re: <activity>"
-- and route back to that product page. Set only on the marker message posted
-- when a customer starts a chat from an activity page.

alter table chat_messages add column context_product_id uuid references products(id) on delete set null;
