import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import type { Finding, ScanResult } from "@/lib/leak-scanner";

export const runtime = "nodejs";

/**
 * GET /api/scans — list the authenticated user's saved scans (most recent 50).
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  try {
    const user = await db.user.findUnique({ where: { email: session.user.email } });
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
  try {
    const user = await db.user.findUnique({ where: { email: session.user.email } });
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
