/**
 * Supabase table setup script.
 *
 * Usage:
 *   bun run scripts/setup-supabase.ts "postgresql://postgres.dhkbbtzgednywbeljbrv:YOUR_PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres"
 *
 * Get the connection string from:
 *   https://supabase.com/dashboard/project/dhkbbtzgednywbeljbrv/settings/database
 *   → scroll to "Connection string" → copy the URI (reveal the password first)
 *
 * This script:
 *   1. Connects to your Supabase Postgres database
 *   2. Creates the `users` and `scan_records` tables (with RLS policies)
 *   3. Reloads the PostgREST schema cache
 *   4. Inserts the existing test user
 *   5. Verifies the tables are accessible
 */
import { Client } from "pg";

const CONNECTION_STRING = process.argv[2];

if (!CONNECTION_STRING) {
  console.error("Usage: bun run scripts/setup-supabase.ts \"postgresql://postgres.REF:PASSWORD@HOST:PORT/postgres\"");
  console.error("Get the connection string from: https://supabase.com/dashboard/project/dhkbbtzgednywbeljbrv/settings/database");
  process.exit(1);
}

const SCHEMA_SQL = `
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  name text,
  password_hash text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists users_email_idx on public.users (email);
create table if not exists public.scan_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  target_url text not null,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  duration_ms integer not null default 0,
  fetched_bytes integer not null default 0,
  script_count integer not null default 0,
  file_probe_count integer not null default 0,
  finding_count integer not null default 0,
  critical_count integer not null default 0,
  high_count integer not null default 0,
  medium_count integer not null default 0,
  low_count integer not null default 0,
  info_count integer not null default 0,
  ok boolean not null default false,
  errors_json text not null default '[]',
  findings_json text not null default '[]',
  created_at timestamptz not null default now()
);
create index if not exists scan_records_user_idx on public.scan_records (user_id);
create index if not exists scan_records_created_idx on public.scan_records (created_at desc);
alter table public.users enable row level security;
alter table public.scan_records enable row level security;
drop policy if exists "Users can read own profile" on public.users;
create policy "Users can read own profile" on public.users for select using (auth.uid() = id);
drop policy if exists "Users can update own profile" on public.users;
create policy "Users can update own profile" on public.users for update using (auth.uid() = id);
drop policy if exists "Users can read own scans" on public.scan_records;
create policy "Users can read own scans" on public.scan_records for select using (auth.uid() = user_id);
drop policy if exists "Users can insert own scans" on public.scan_records;
create policy "Users can insert own scans" on public.scan_records for insert with check (auth.uid() = user_id);
drop policy if exists "Users can delete own scans" on public.scan_records;
create policy "Users can delete own scans" on public.scan_records for delete using (auth.uid() = user_id);
create or replace function public.handle_updated_at() returns trigger as $$ begin new.updated_at = now(); return new; end; $$ language plpgsql;
drop trigger if exists users_updated_at on public.users;
create trigger users_updated_at before update on public.users for each row execute function public.handle_updated_at();
NOTIFY pgrst, 'reload schema';
`;

async function main() {
  console.log("Connecting to Supabase Postgres...");
  const client = new Client({
    connectionString: CONNECTION_STRING,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10000,
  });

  try {
    await client.connect();
    console.log("Connected to database");
    console.log("Creating tables...");
    await client.query(SCHEMA_SQL);
    console.log("Tables created");
    const result = await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('users','scan_records')");
    console.log("Verified tables:", result.rows.map((r: any) => r.table_name));
    const existingUser = await client.query("SELECT id FROM public.users WHERE email = 'test-op@x.local'");
    if (existingUser.rows.length === 0) {
      await client.query("INSERT INTO public.users (email, name, password_hash) VALUES ('test-op@x.local', 'OpTester', '$2b$10$HMgADcgbfjpQZ2WTnhBk2ur6wJrEqxauXwrvDUPkUDeA5NxVIQ/7y') ON CONFLICT (email) DO NOTHING");
      console.log("Inserted test user: test-op@x.local");
    } else {
      console.log("User test-op@x.local already exists");
    }
    console.log("\nSetup complete!");
  } catch (err: any) {
    console.error("Setup failed:", err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
