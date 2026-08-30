alter table public.chat_messages add column context_product_id uuid references public.products(id) on delete set null;;
