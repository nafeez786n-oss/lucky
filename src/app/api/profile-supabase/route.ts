import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { getServerSupabase, isSupabaseConfigured } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * GET /api/profile-supabase
 *
 * Returns the authenticated user's profile info from Supabase.
 * This is the Supabase-backed equivalent of /api/profile.
 *
 * Returns:
 *   200 { ok: true, profile: { email, name, createdAt, scanCount, lastScan } }
 *   401 if not authenticated
 *   404 if user not found in Supabase
 *   500 if Supabase env vars are not configured
 */
export async function GET() {
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

  try {
    const supabase = getServerSupabase();

    // Look up the user by email
    const { data: userRow, error: userErr } = await supabase
      .from("users")
      .select("id, email, name, created_at")
      .eq("email", session.user.email)
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
