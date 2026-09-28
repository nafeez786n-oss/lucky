# Connecting Supabase

This site supports **two backend modes** that auto-switch based on env vars:

| Mode | Used when | Database | Setup |
|---|---|---|---|
| **Local SQLite** (default) | No Supabase env vars | `db/custom.db` (Prisma) | Zero config — runs out of the box |
| **Supabase Postgres** | All 3 Supabase env vars set | Your Supabase project | 5-minute setup below |

## Setup (5 minutes)

### 1. Create a Supabase project

1. Sign up at [supabase.com](https://supabase.com) (free tier is fine)
2. Click **New Project** → choose a name + region → **Create**
3. Wait ~2 minutes for provisioning to finish

### 2. Create the schema

1. In your Supabase dashboard, open the **SQL Editor** (left sidebar)
2. Click **New Query**
3. Paste the entire contents of [`supabase/schema.sql`](./supabase/schema.sql)
4. Click **Run** — you should see "Success. No rows returned."
5. The `public.users` and `public.scan_records` tables are now created with Row Level Security policies

### 3. Get your API keys

1. In the Supabase dashboard, go to **Settings → API** (or **Project Settings → API**)
2. Note the **Project URL** (e.g. `https://abcdefgh.supabase.co`)
3. Note the **anon public** key (safe for the browser — it's designed to be public)
4. Note the **service_role** key (⚠️ secret — bypasses RLS, server-only)

### 4. Set the env vars

Edit `.env` in the project root and fill in the 3 values:

```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefgh.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your-service-role-key...
```

Save the file. The dev server will hot-reload — no restart needed.

### 5. Register a user

Sign up via the website's login overlay (Login → Register). The user will be created
in your local SQLite database via NextAuth + bcrypt. To make the user available in
Supabase too, either:

**Option A — Use the existing user table**: The Supabase integration reads from
`public.users` (not Supabase Auth's `auth.users`). You'll need to insert the user
into `public.users` manually:

```sql
-- In the Supabase SQL Editor:
insert into public.users (email, name, password_hash)
values ('your@email.com', 'Your Name', '$2a$10$...your-bcrypt-hash...');
```

To generate the bcrypt hash, run:
```bash
node -e "import('bcryptjs').then(b => console.log(b.default.hashSync('your-password', 10)))"
```

**Option B — Use Supabase Auth instead** (recommended for production): Replace
NextAuth's credentials provider with the Supabase Auth provider. This is a larger
change — see the [NextAuth + Supabase guide](https://supabase.com/docs/guides/auth/server-side/nextjs).

### 6. Verify

1. Run a scan on any URL
2. Open the **Profile** section — you should see "Member since" + scan count from Supabase
3. In the Supabase dashboard → **Table Editor → `scan_records`** — you should see the row

## How it works

The integration uses an **auto-switching** pattern in `src/lib/supabase.ts`:

```ts
export const isSupabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY
);
```

Every API endpoint that touches the database checks this flag:

```ts
if (isSupabaseConfigured) {
  return saveToSupabase(req, email);  // uses supabase-js client
}
return saveToPrisma(req, email);       // uses Prisma + SQLite
```

This means you can develop locally with zero setup (SQLite), then flip to Supabase
for production just by setting 3 env vars. No code changes needed.

### Two Supabase clients

| Client | Key | Use case |
|---|---|---|
| `getServerSupabase()` | service_role | Server-side API routes — bypasses RLS |
| `getBrowserSupabase()` | anon | Browser-side code (if you add direct client-side Supabase calls) — subject to RLS |

### Files

- `src/lib/supabase.ts` — Supabase client wrappers + `isSupabaseConfigured` flag + shared types
- `supabase/schema.sql` — SQL to create `users` + `scan_records` tables with RLS policies
- `src/app/api/scans/save/route.ts` — POST handler (auto-switches Supabase/Prisma)
- `src/app/api/scans/route.ts` — GET (list) + DELETE (auto-switches Supabase/Prisma)
- `src/app/api/profile/route.ts` — GET profile (auto-switches Supabase/Prisma)
- `src/app/api/scans/save-supabase/route.ts` — Supabase-only POST (for explicit testing)
- `src/app/api/profile-supabase/route.ts` — Supabase-only GET (for explicit testing)

## Row Level Security

The `supabase/schema.sql` file enables RLS on both tables with these policies:

- `users`: users can read + update their own row (matched via `auth.uid() = id`)
- `scan_records`: users can read/insert/delete their own scans (matched via `auth.uid() = user_id`)

**Note**: The API routes in this project use the **service_role** key, which
**bypasses RLS entirely**. The RLS policies are a defense-in-depth measure that
would protect you if you ever used the **anon** key from the browser directly
(via `getBrowserSupabase()`).

## Troubleshooting

**"Supabase not configured" error** — One of the 3 env vars is missing or empty. Check `.env` and make sure all 3 are set (no trailing whitespace).

**"User not found in Supabase"** — The user exists in NextAuth/SQLite but not in `public.users` in Supabase. See step 5 above.

**`relation "public.users" does not exist`** — You haven't run `supabase/schema.sql` yet. Open the Supabase SQL Editor and run it.

**Scan count stays at 0** — The scan ran but wasn't saved. Check that:
- You were logged in when the scan completed
- The `/api/scans/save` POST returned 200 OK (check Network tab)
- The user exists in `public.users` (Supabase Table Editor)
