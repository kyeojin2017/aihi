-- Additive migration for real Supabase-backed data storage.
-- Run once in Supabase Dashboard > SQL Editor > New query > Run.
-- Safe to re-run: only adds columns/tables that don't already exist, nothing is dropped.

alter table family_members add column if not exists nickname text;
alter table family_members add column if not exists sort_order integer not null default 0;

alter table life_logs add column if not exists data jsonb not null default '{}'::jsonb;

create table if not exists period_settings (
  id            uuid primary key default gen_random_uuid(),
  member_id     uuid not null unique references family_members(id) on delete cascade,
  start_date    date,
  period_length int,
  cycle_length  int,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists period_entries (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references family_members(id) on delete cascade,
  date       date not null,
  created_at timestamptz not null default now(),
  unique (member_id, date)
);

alter table period_settings enable row level security;
alter table period_entries enable row level security;

drop policy if exists "own period settings" on period_settings;
create policy "own period settings" on period_settings
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own period entries" on period_entries;
create policy "own period entries" on period_entries
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));
