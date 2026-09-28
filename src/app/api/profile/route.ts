import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/profile — returns the authenticated user's profile info.
 *
 * AUTO-SWITCHING BACKEND:
 *   - If Supabase env vars are set, queries Supabase Postgres.
 *   - Otherwise, falls back to the local SQLite database via Prisma.
 *
 * This data is meant to be shown ONLY to the user themselves in the
 * private Profile section. The sidebar chip does NOT expose any PII
 * (name/email) — the user has to open the Profile section to see it.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }

  // ===== Supabase path =====
  if (isSupabaseConfigured) {
    return getProfileFromSupabase(session.user.email);
  }

  // ===== Prisma/SQLite fallback path =====
  return getProfileFromPrisma(session.user.email);
}

async function getProfileFromSupabase(email: string) {
  try {
    const supabase = getServerSupabase();

    // Look up the user by email
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, email, name, created_at")
      .eq("email", email)
      .single();

    if (userErr || !userRow) {
      return NextResponse.json(
        { ok: false, error: "User not found in Supabase" },
        { status: 404 }
      );
    }

    // Count the user's scans
    const { count: scanCount, error: countErr } = await supabase
      .from("scan_records")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userRow.id);

    if (countErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase count failed: ${countErr.message}` },
        { status: 500 }
      );
    }

    // Get the most recent scan
    const { data: lastScanRow, error: lastErr } = await supabase
      .from("scan_records")
      .select("target_url, created_at, finding_count, critical_count, high_count")
      .eq("user_id", userRow.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastErr) {
      return NextResponse.json(
        { ok: false, error: `Supabase query failed: ${lastErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      ok: true,
      profile: {
        email: userRow.email,
        name: userRow.name,
        createdAt: userRow.created_at,
        scanCount: scanCount ?? 0,
        lastScan: lastScanRow
          ? {
              targetUrl: lastScanRow.target_url,
              createdAt: lastScanRow.created_at,
              findingCount: lastScanRow.finding_count,
              criticalCount: lastScanRow.critical_count,
              highCount: lastScanRow.high_count,
            }
          : null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

async function getProfileFromPrisma(email: string) {
  try {
    const user = await db.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      },
    });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }
    const scanCount = await db.scanRecord.count({ where: { userId: user.id } });
    const lastScan = await db.scanRecord.findFirst({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      select: {
        targetUrl: true,
        createdAt: true,
        findingCount: true,
        criticalCount: true,
        highCount: true,
      },
    });
    return NextResponse.json({
      ok: true,
      profile: {
        email: user.email,
        name: user.name,
        createdAt: user.createdAt.toISOString(),
        scanCount,
        lastScan: lastScan
          ? {
              targetUrl: lastScan.targetUrl,
              createdAt: lastScan.createdAt.toISOString(),
              findingCount: lastScan.findingCount,
              criticalCount: lastScan.criticalCount,
              highCount: lastScan.highCount,
            }
          : null,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
