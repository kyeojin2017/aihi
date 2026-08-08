create extension if not exists pgcrypto;

create table if not exists family_members (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null references auth.users(id) on delete cascade,
  name         text not null,
  relation     text,
  avatar_label text,
  gender       text,
  birth_date   date,
  blood_type   text,
  height_cm    numeric,
  weight_kg    numeric,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists conditions (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references family_members(id) on delete cascade,
  name       text not null,
  memo       text,
  created_at timestamptz not null default now()
);

create table if not exists supplements (
  id         uuid primary key default gen_random_uuid(),
  member_id  uuid not null references family_members(id) on delete cascade,
  name       text not null,
  dosage     text,
  frequency  text,
  memo       text,
  created_at timestamptz not null default now()
);

create table if not exists symptoms (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references family_members(id) on delete cascade,
  date        date not null,
  has_symptom boolean,
  tags        text[] not null default '{}',
  pain_level  smallint check (pain_level between 1 and 5),
  temperature numeric,
  action      text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (member_id, date)
);

create table if not exists visits (
  id               uuid primary key default gen_random_uuid(),
  member_id        uuid not null references family_members(id) on delete cascade,
  date             date not null,
  time             time,
  hospital         text not null,
  department       text,
  doctor           text,
  next_visit_date  date,
  treatment        text,
  diagnosis_memo   text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists visits_member_date_idx on visits (member_id, date desc);

create table if not exists prescriptions (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references family_members(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  start_date   date not null,
  end_date     date,
  caution_memo text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists prescription_items (
  id              uuid primary key default gen_random_uuid(),
  prescription_id uuid not null references prescriptions(id) on delete cascade,
  drug_name       text not null,
  dose            text,
  frequency       text,
  note            text
);

create table if not exists checkups (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references family_members(id) on delete cascade,
  type         text not null check (type in ('vaccine','screening')),
  category     text,
  name         text not null,
  date         date,
  status       text,
  result_memo  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists photos (
  id           uuid primary key default gen_random_uuid(),
  member_id    uuid not null references family_members(id) on delete cascade,
  visit_id     uuid references visits(id) on delete set null,
  date         date not null,
  storage_path text not null,
  caption      text,
  created_at   timestamptz not null default now()
);

create table if not exists life_logs (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references family_members(id) on delete cascade,
  date           date not null,
  meals          jsonb,
  exercise_min   int,
  sleep_hours    numeric,
  water_ml       int,
  alcohol        boolean,
  caffeine_mg    int,
  is_period_day  boolean,
  memo           text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (member_id, date)
);

alter table family_members enable row level security;
alter table conditions enable row level security;
alter table supplements enable row level security;
alter table symptoms enable row level security;
alter table visits enable row level security;
alter table prescriptions enable row level security;
alter table prescription_items enable row level security;
alter table checkups enable row level security;
alter table photos enable row level security;
alter table life_logs enable row level security;

drop policy if exists "own family members" on family_members;
create policy "own family members" on family_members
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "own conditions" on conditions;
create policy "own conditions" on conditions
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own supplements" on supplements;
create policy "own supplements" on supplements
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own symptoms" on symptoms;
create policy "own symptoms" on symptoms
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own visits" on visits;
create policy "own visits" on visits
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own prescriptions" on prescriptions;
create policy "own prescriptions" on prescriptions
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own prescription items" on prescription_items;
create policy "own prescription items" on prescription_items
  for all using (
    prescription_id in (
      select p.id from prescriptions p
      join family_members f on f.id = p.member_id
      where f.owner_id = auth.uid()
    )
  )
  with check (
    prescription_id in (
      select p.id from prescriptions p
      join family_members f on f.id = p.member_id
      where f.owner_id = auth.uid()
    )
  );

drop policy if exists "own checkups" on checkups;
create policy "own checkups" on checkups
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own photos" on photos;
create policy "own photos" on photos
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));

drop policy if exists "own life logs" on life_logs;
create policy "own life logs" on life_logs
  for all using (member_id in (select id from family_members where owner_id = auth.uid()))
  with check (member_id in (select id from family_members where owner_id = auth.uid()));
