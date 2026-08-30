create table if not exists public.vendor_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  vendor_name text not null,
  source_url text not null,
  source_platform text not null check (source_platform in ('TikTok', 'YouTube')),
  location_text text not null,
  category text,
  reason text not null,
  signature_dish text,
  price_range text,
  additional_note text,
  status text not null default 'submitted' check (status in (
    'submitted', 'under_review', 'needs_info', 'accepted_for_processing',
    'processing', 'admin_review', 'draft_created', 'published',
    'duplicate', 'rejected', 'failed'
  )),
  admin_note text,
  rejection_reason text,
  ai_job_id text,
  vendor_id uuid references public.vendors(id) on delete set null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vendor_suggestions_user_created_idx
  on public.vendor_suggestions (user_id, created_at desc);

create index if not exists vendor_suggestions_status_created_idx
  on public.vendor_suggestions (status, created_at desc);

create index if not exists vendor_suggestions_vendor_name_idx
  on public.vendor_suggestions (lower(vendor_name));

alter table public.vendor_suggestions enable row level security;

grant select, insert on public.vendor_suggestions to authenticated;

drop policy if exists "customers read own vendor suggestions" on public.vendor_suggestions;
create policy "customers read own vendor suggestions"
  on public.vendor_suggestions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists "customers submit own vendor suggestions" on public.vendor_suggestions;
create policy "customers submit own vendor suggestions"
  on public.vendor_suggestions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create or replace function public.touch_vendor_suggestions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vendor_suggestions_updated_at on public.vendor_suggestions;
create trigger vendor_suggestions_updated_at
before update on public.vendor_suggestions
for each row execute function public.touch_vendor_suggestions_updated_at();;
