-- Familienplaner: Schema. Idempotent, läuft bei jedem Build.
-- Zugriff ausschließlich serverseitig; RLS ohne Policies sperrt den öffentlichen Schlüssel aus.

create extension if not exists pgcrypto;

create table if not exists people (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  color text,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  place text,
  notes text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  all_day boolean not null default false,
  people uuid[] not null default '{}',
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists events_range_idx on events (starts_at, ends_at);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  area text not null default 'Haushalt',
  person_id uuid references people(id) on delete set null,
  due date,
  recurring text,
  done boolean not null default false,
  done_at timestamptz,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists shopping_items (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  amount text,
  category text not null default 'Vorrat',
  added_by uuid references people(id) on delete set null,
  done boolean not null default false,
  done_at timestamptz,
  created_at timestamptz not null default now()
);

-- Fehlversuche beim Login, für die Sperre
create table if not exists login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  success boolean not null,
  created_at timestamptz not null default now()
);
create index if not exists login_attempts_time_idx on login_attempts (created_at);

alter table people enable row level security;
alter table events enable row level security;
alter table tasks enable row level security;
alter table shopping_items enable row level security;
alter table login_attempts enable row level security;

insert into people (name, sort) values
  ('Selim', 1), ('Yasmina', 2), ('Samira', 3), ('Samir', 4), ('Denise', 5)
on conflict (name) do nothing;
