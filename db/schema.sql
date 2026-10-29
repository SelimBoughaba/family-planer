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

-- Etappe 3: Wiederholungen und Kalender-Abo
alter table events add column if not exists recurrence text;
alter table events add column if not exists recurrence_until date;
alter table events add column if not exists exdates timestamptz[] not null default '{}';
create index if not exists events_series_idx on events (recurrence) where recurrence is not null;

alter table people add column if not exists calendar_token text unique;

-- Etappe 4: Erinnerungen und Mitteilungen
alter table events add column if not exists reminders int[] not null default '{}'; -- Minuten vor Beginn
alter table tasks add column if not exists remind_time time; -- Uhrzeit am Fälligkeitstag
alter table people add column if not exists notify_prefs jsonb not null default '{"assigned": true, "invited": true}';

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  person_id uuid not null references people(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_success timestamptz
);
alter table push_subscriptions enable row level security;

create table if not exists notifications_sent (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table notifications_sent enable row level security;

-- Systemwerte, z. B. letzter Lauf des Zeitplaners
create table if not exists app_meta (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table app_meta enable row level security;

-- Etappe Owner: Fehlerprotokoll, Backups, Art des Login-Versuchs
alter table login_attempts add column if not exists kind text not null default 'family';

create table if not exists error_log (
  id bigint generated always as identity primary key,
  source text not null,
  message text not null,
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists error_log_time_idx on error_log (created_at desc);
alter table error_log enable row level security;

create table if not exists backups (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'auto',
  data jsonb not null,
  size_bytes int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists backups_time_idx on backups (created_at desc);
alter table backups enable row level security;

-- Etappe 5: Essen
create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  servings int not null default 4,
  minutes int,
  ingredients jsonb not null default '[]', -- [{ "amount": "200 g", "name": "Mehl" }]
  steps jsonb not null default '[]',       -- ["Schritt 1", ...]
  tags text[] not null default '{}',
  source_url text,
  favorite boolean not null default false,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table recipes enable row level security;

create table if not exists meal_plan (
  id uuid primary key default gen_random_uuid(),
  day date not null unique,
  recipe_id uuid references recipes(id) on delete set null,
  title text not null,
  cook uuid references people(id) on delete set null,
  note text,
  created_by uuid references people(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table meal_plan enable row level security;

create table if not exists ai_usage (
  id bigint generated always as identity primary key,
  kind text not null,
  input_tokens int not null,
  output_tokens int not null,
  cost_usd numeric(10, 6) not null,
  created_at timestamptz not null default now()
);
create index if not exists ai_usage_time_idx on ai_usage (created_at);
alter table ai_usage enable row level security;

-- Etappe 6: Aufgaben mit Dienstplan (Reihenfolge der Personen, die sich abwechseln)
alter table tasks add column if not exists rotation uuid[] not null default '{}';

-- Etappe 8: Wer isst mit (nur ausdrückliche Angaben; ohne Eintrag gilt „da“), Originalfotos von Rezepten
create table if not exists meal_attendance (
  day date not null,
  person_id uuid not null references people(id) on delete cascade,
  present boolean not null,
  updated_at timestamptz not null default now(),
  primary key (day, person_id)
);
alter table meal_attendance enable row level security;
alter table recipes add column if not exists images text[] not null default '{}';
