import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase integration.
 *
 * The site can run in TWO backend modes:
 *   1. SQLite (default, no env vars needed) — Prisma ORM + local SQLite file.
 *   2. Supabase (set NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY) —
 *      Postgres database + Row Level Security.
 *
 * When the Supabase env vars are present, the /api endpoints auto-switch to
 * using Supabase. Otherwise they fall back to Prisma/SQLite. This lets you
 * run the site locally with zero setup, and flip to Supabase for production
 * just by setting 3 env vars.
 *
 * env vars:
 *   NEXT_PUBLIC_SUPABASE_URL       — e.g. https://xyz.supabase.co
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY  — public anon key (safe for browser)
 *   SUPABASE_SERVICE_ROLE_KEY      — server-only service role key (bypasses RLS)
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

/** True when Supabase env vars are configured (auto-switches API routes). */
export const isSupabaseConfigured = Boolean(
  SUPABASE_URL && SUPABASE_ANON_KEY && SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Server-side Supabase client using the SERVICE ROLE key.
 * Bypasses Row Level Security — only use this in server-side code,
 * NEVER expose it to the browser.
 *
 * Throws if env vars are missing — callers should check `isSupabaseConfigured` first.
 */
let _serverClient: SupabaseClient | null = null;
export function getServerSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      "Supabase env vars not set. Define NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env"
    );
  }
  if (!_serverClient) {
    _serverClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _serverClient;
}

/**
 * Browser-side Supabase client using the ANON key.
 * Subject to Row Level Security policies. Safe to expose to the browser
 * (the anon key is designed to be public).
 *
 * Returns null if env vars aren't set — callers should handle this.
 */
let _browserClient: SupabaseClient | null = null;
export function getBrowserSupabase(): SupabaseClient | null {
  if (!isSupabaseConfigured) return null;
  if (!_browserClient) {
    _browserClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }
  return _browserClient;
}

// ----------------------------------------------------------------------------
//  Shared types — mirror the Prisma schema so the Supabase + Prisma code paths
//  can use the same TypeScript types.
// ----------------------------------------------------------------------------

export type SupabaseUser = {
  id: string;          // uuid in Supabase
  email: string;
  name: string | null;
  created_at: string;  // ISO timestamp
};

export type SupabaseScanRecord = {
  id: string;                  // uuid
  user_id: string;              // uuid (FK → users.id)
  target_url: string;
  started_at: string;           // ISO
  finished_at: string;          // ISO
  duration_ms: number;
  fetched_bytes: number;
  script_count: number;
  file_probe_count: number;
  finding_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  ok: boolean;
  errors_json: string;         // JSON-encoded string array
  findings_json: string;       // JSON-encoded findings array
  created_at: string;          // ISO
};

// Map a Supabase row → the format the frontend expects (matches ScanResult type)
export function supabaseRowToScanResult(row: SupabaseScanRecord) {
  return {
    targetUrl: row.target_url,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    durationMs: row.duration_ms,
    fetchedBytes: row.fetched_bytes,
    scriptCount: row.script_count,
    fileProbeCount: row.file_probe_count,
    findings: JSON.parse(row.findings_json || "[]"),
    errors: JSON.parse(row.errors_json || "[]"),
    ok: row.ok,
  };
}
