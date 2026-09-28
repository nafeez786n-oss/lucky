-- ============================================================================
-- LeakGuard — Supabase Schema
-- ============================================================================
-- Run this in the Supabase SQL Editor (or via `supabase db push`).
-- Creates the `users` and `scan_records` tables with Row Level Security
-- policies so users can only read/write their own rows.
-- ============================================================================

-- ---------- users table ----------------------------------------------------
-- NOTE: If you use Supabase Auth (recommended), the `auth.users` table is
-- created for you in the `auth` schema. This `public.users` table is a
-- profile/extension table that mirrors the local Prisma User model, so
-- the same code can run against either backend.
-- ----------------------------------------------------------------------------
create table if not exists public.users (
  id          uuid primary key default gen_random_uuid(),
  email       text not null unique,
  name        text,
  password_hash text not null,    -- bcrypt hash (only used when NOT using Supabase Auth)
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists users_email_idx on public.users (email);

-- ---------- scan_records table ---------------------------------------------
create table if not exists public.scan_records (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.users (id) on delete cascade,
  target_url        text not null,
  started_at        timestamptz not null,
  finished_at       timestamptz not null,
  duration_ms       integer not null default 0,
  fetched_bytes     integer not null default 0,
  script_count      integer not null default 0,
  file_probe_count  integer not null default 0,
  finding_count     integer not null default 0,
  critical_count    integer not null default 0,
  high_count        integer not null default 0,
  medium_count      integer not null default 0,
  low_count         integer not null default 0,
  info_count        integer not null default 0,
  ok                boolean not null default false,
  errors_json       text not null default '[]',     -- JSON-encoded string array
  findings_json     text not null default '[]',     -- JSON-encoded findings array
  created_at        timestamptz not null default now()
);

create index if not exists scan_records_user_id_idx on public.scan_records (user_id);
create index if not exists scan_records_created_at_idx on public.scan_records (created_at desc);

-- ---------- Row Level Security ---------------------------------------------
-- Enable RLS so users can only read/write their own scan_records.
alter table public.scan_records enable row level security;
alter table public.users enable row level security;

-- Policy: users can read their own profile row
drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile"
  on public.users for select
  using (auth.uid() = id);

-- Policy: users can update their own profile row
drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile"
  on public.users for update
  using (auth.uid() = id);

-- Policy: users can read their own scan_records
drop policy if exists "Users can read own scans" on public.scan_records;
create policy "Users can read own scans"
  on public.scan_records for select
  using (auth.uid() = user_id);

-- Policy: users can insert their own scan_records
drop policy if exists "Users can insert own scans" on public.scan_records;
create policy "Users can insert own scans"
  on public.scan_records for insert
  with check (auth.uid() = user_id);

-- Policy: users can delete their own scan_records
drop policy if exists "Users can delete own scans" on public.scan_records;
create policy "Users can delete own scans"
  on public.scan_records for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- NOTE: The API routes in this project use the SERVICE ROLE key (server-side),
-- which BYPASSES Row Level Security entirely. The RLS policies above are a
-- defense-in-depth measure that would protect you if the anon key were ever
-- used directly from the browser (e.g., via `getBrowserSupabase()`).
-- ============================================================================

-- ---------- Updated_at trigger for users ------------------------------------
create or replace function public.handle_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at
  before update on public.users
  for each row execute function public.handle_updated_at();
