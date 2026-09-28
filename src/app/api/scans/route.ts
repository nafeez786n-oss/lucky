import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";
import type { Finding, ScanResult } from "@/lib/leak-scanner";

export const runtime = "nodejs";

/**
 * GET /api/scans — list the authenticated user's saved scans (most recent 50).
 *
 * AUTO-SWITCHING BACKEND:
 *   - If Supabase env vars are set, queries Supabase Postgres.
 *   - Otherwise, falls back to the local SQLite database via Prisma.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  if (isSupabaseConfigured) {
    const supaRes = await listScansFromSupabase(session.user.email);
    if (supaRes.status === 200) return supaRes;
    // Fallback to Prisma if Supabase fails (user not found etc.)
    return listScansFromPrisma(session.user.email);
  }
  return listScansFromPrisma(session.user.email);
}

async function listScansFromSupabase(email: string) {
  try {
    const supabase = getServerSupabase();
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();
    if (userErr || !userRow) {
      return NextResponse.json(
        { ok: false, error: "User not found in Supabase" },
        { status: 404 }
      );
    }
    const { data: rows, error: listErr } = await supabase
      .from("scan_records")
      .select("*")
      .eq("user_id", userRow.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (listErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase query failed: ${listErr.message}` },
        { status: 500 }
      );
    }
    const results: ScanResult[] = (rows ?? []).map((r: any) => ({
      targetUrl: r.target_url,
      startedAt: r.started_at,
      finishedAt: r.finished_at,
      durationMs: r.duration_ms,
      fetchedBytes: r.fetched_bytes,
      scriptCount: r.script_count,
      fileProbeCount: r.file_probe_count,
      findings: JSON.parse(r.findings_json || "[]"),
      errors: JSON.parse(r.errors_json || "[]"),
      ok: r.ok,
    }));
    return NextResponse.json({ ok: true, scans: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function listScansFromPrisma(email: string) {
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    const rows = await db.scanRecord.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const results: ScanResult[] = rows.map((r) => {
      const findings: Finding[] = JSON.parse(r.findingsJson || "[]");
      const errors: string[] = JSON.parse(r.errorsJson || "[]");
      return {
        targetUrl: r.targetUrl,
        startedAt: r.startedAt.toISOString(),
        finishedAt: r.finishedAt.toISOString(),
        durationMs: r.durationMs,
        fetchedBytes: r.fetchedBytes,
        scriptCount: r.scriptCount,
        fileProbeCount: r.fileProbeCount,
        findings,
        errors,
        ok: r.ok,
      };
    });
    return NextResponse.json({ ok: true, scans: results });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

/**
 * DELETE /api/scans — delete all saved scans for this user.
 */
export async function DELETE() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  if (isSupabaseConfigured) {
    const supaRes = await deleteScansFromSupabase(session.user.email);
    if (supaRes.status === 200) return supaRes;
    return deleteScansFromPrisma(session.user.email);
  }
  return deleteScansFromPrisma(session.user.email);
}

async function deleteScansFromSupabase(email: string) {
  try {
    const supabase = getServerSupabase();
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id")
      .eq("email", email)
      .single();
    if (userErr || !userRow) {
      return NextResponse.json(
        { ok: false, error: "User not found in Supabase" },
        { status: 404 }
      );
    }
    const { error: delErr } = await supabase
      .from("scan_records")
      .delete()
      .eq("user_id", userRow.id);
    if (delErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase delete failed: ${delErr.message}` },
        { status: 500 }
      );
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function deleteScansFromPrisma(email: string) {
  try {
    const user = await db.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    await db.scanRecord.deleteMany({ where: { userId: user.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
