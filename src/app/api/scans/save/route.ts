import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Finding, ScanResult } from "@/lib/leak-scanner";

export const runtime = "nodejs";

/**
 * POST /api/scans/save
 * Body: ScanResult (the full result object from a scan)
 *
 * Persists a scan result for the authenticated user.
 *
 * AUTO-SWITCHING BACKEND:
 *   - If Supabase env vars are set (NEXT_PUBLIC_SUPABASE_URL +
 *     SUPABASE_SERVICE_ROLE_KEY), uses Supabase Postgres.
 *   - Otherwise, falls back to the local SQLite database via Prisma.
 *
 * This endpoint is called by the frontend AFTER the scanner-service
 * (port 3030) emits `scan:complete` via WebSocket — the scanner service
 * runs the scan, this endpoint handles persistence. Clean separation of
 * compute (scanner-service) and persistence (Next.js + Prisma/Supabase).
 *
 * Returns { ok: true } on success.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // ===== Supabase path =====
  if (isSupabaseConfigured) {
    return saveToSupabase(req, session.user.email);
  }

  // ===== Prisma/SQLite fallback path =====
  return saveToPrisma(req, session.user.email);
}

async function saveToSupabase(req: Request, email: string) {
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
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();
    if (userErr || !userRow) {
      return NextResponse.json(
        { ok: false, error: "User not found in Supabase. Run supabase/schema.sql + register the user." },
        { status: 404 }
      );
    }
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of body.findings as Finding[]) counts[f.severity]++;
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

async function saveToPrisma(req: Request, email: string) {
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
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of body.findings as Finding[]) counts[f.severity]++;
    await db.scanRecord.create({
      data: {
        userId: user.id,
        targetUrl: body.targetUrl,
        startedAt: new Date(body.startedAt || Date.now()),
        finishedAt: new Date(body.finishedAt || Date.now()),
        durationMs: body.durationMs ?? 0,
        fetchedBytes: body.fetchedBytes ?? 0,
        scriptCount: body.scriptCount ?? 0,
        fileProbeCount: body.fileProbeCount ?? 0,
        findingCount: body.findings.length,
        criticalCount: counts.critical,
        highCount: counts.high,
        mediumCount: counts.medium,
        lowCount: counts.low,
        infoCount: counts.info,
        ok: body.ok ?? false,
        errorsJson: JSON.stringify(body.errors ?? []),
        findingsJson: JSON.stringify(body.findings),
      },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
