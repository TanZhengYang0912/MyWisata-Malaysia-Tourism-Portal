create table chat_report_bans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  banned_until timestamptz not null,
  reason text,
  banned_by uuid references users(id),
  created_at timestamptz not null default now()
);

alter table chat_report_bans enable row level security;

create policy chat_report_bans_admin_all on chat_report_bans
  for all using (is_admin(auth.uid())) with check (is_admin(auth.uid()));

create index chat_report_bans_user_active on chat_report_bans (user_id, banned_until);
