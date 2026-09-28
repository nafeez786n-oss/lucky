import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";
import type { Finding, ScanResult } from "@/lib/leak-scanner";

export const runtime = "nodejs";

/**
 * POST /api/scans/save
 * Body: ScanResult (the full result object from a scan)
 *
 * Persists a scan result to the DB for the authenticated user.
 * This endpoint is called by the frontend AFTER the scanner-service
 * (port 3030) emits `scan:complete` via WebSocket — the scanner service
 * runs the scan, this endpoint handles persistence. Clean separation of
 * compute (scanner-service) and persistence (Next.js + Prisma).
 *
 * Returns { ok: true } on success.
 */
export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
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
    const user = await db.user.findUnique({ where: { email: session.user.email } });
    if (!user) {
      return NextResponse.json({ ok: false, error: "User not found" }, { status: 404 });
    }

    // Count by severity for the indexed columns
    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of body.findings as Finding[]) {
      counts[f.severity]++;
    }

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
