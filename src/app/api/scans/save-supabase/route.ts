import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Finding, ScanResult } from "@/lib/leak-scanner";

export const runtime = "nodejs";

/**
 * POST /api/scans/save-supabase
 *
 * Saves a ScanResult to Supabase (Postgres) for the authenticated user.
 * This is the Supabase-backed equivalent of /api/scans/save.
 *
 * Returns:
 *   200 { ok: true } on success
 *   401 if not authenticated
 *   404 if user not found in Supabase
 *   500 if Supabase env vars are not configured or save fails
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json(
      { ok: false, error: "Supabase not configured. Set NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY in .env" },
      { status: 500 }
    );
  }

  let body: ScanResult;
  try {
    body = (await req.json()) as ScanResult;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.targetUrl || !Array.isArray(body.findings)) {
    return NextResponse.json(
      { ok: false, error: "Body must be a ScanResult with targetUrl + findings[]" },
      { status: 400 }
    );
  }

  try {
    const supabase = getServerSupabase();

    // Look up the user by email (the users table is keyed on email)
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", session.user.email)
      .single();

    if (userErr || !userRow) {
      return NextResponse.json(
        { ok: false, error: "User not found in Supabase. Did you run supabase/schema.sql and register the user?" },
        { status: 404 }
      );
    }

    // Count findings by severity
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of body.findings as Finding[]) {
      counts[f.severity]++;
    }

    // Insert the scan record (RLS is bypassed by the service role key)
    const { error: insertErr } = await supabase.from("scan_records").insert({
      user_id: userRow.id,
      target_url: body.targetUrl,
      started_at: body.startedAt || new Date().toISOString(),
      finished_at: body.finishedAt || new Date().toISOString(),
      duration_ms: body.durationMs ?? 0,
      fetched_bytes: body.fetchedBytes ?? 0,
      script_count: body.scriptCount ?? 0,
      file_probe_count: body.fileProbeCount ?? 0,
      finding_count: body.findings.length,
      critical_count: counts.critical,
      high_count: counts.high,
      medium_count: counts.medium,
      low_count: counts.low,
      info_count: counts.info,
      ok: body.ok ?? false,
      errors_json: JSON.stringify(body.errors ?? []),
      findings_json: JSON.stringify(body.findings),
    });

    if (insertErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase insert failed: ${insertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
