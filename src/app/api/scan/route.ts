import { NextResponse } from "next/server";
import { scanTarget, type Finding, type ScanResult } from "@/lib/leak-scanner";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const maxDuration = 60;

function countBySeverity(findings: Finding[]) {
  const c = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const f of findings) c[f.severity]++;
  return c;
}

/**
 * POST /api/scan
 * Body: { "url": "https://example.com" }
 *
 * Bounded, single-shot scan. Returns a complete ScanResult.
 * If the caller is authenticated, the scan is also persisted to the DB.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, errors: ["Invalid JSON body. Send { \"url\": \"https://example.com\" }"] },
      { status: 400 }
    );
  }

  const url = typeof body?.url === "string" ? body.url.trim() : "";
  if (!url) {
    return NextResponse.json(
      { ok: false, errors: ["Missing 'url' field. Example: { \"url\": \"https://example.com\" }"] },
      { status: 400 }
    );
  }
  if (url.length > 2048) {
    return NextResponse.json(
      { ok: false, errors: ["URL too long (>2048 chars)."] },
      { status: 400 }
    );
  }

  let result: ScanResult;
  try {
    result = await scanTarget(url);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      {
        ok: false,
        targetUrl: url,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
        fetchedBytes: 0,
        scriptCount: 0,
        fileProbeCount: 0,
        findings: [],
        errors: [`Scan failed: ${msg}`],
      },
      { status: 500 }
    );
  }

  // If authenticated, persist to DB
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.email) {
      const user = await db.user.findUnique({ where: { email: session.user.email } });
      if (user) {
        const counts = countBySeverity(result.findings);
        await db.scanRecord.create({
          data: {
            userId: user.id,
            targetUrl: result.targetUrl,
            startedAt: new Date(result.startedAt),
            finishedAt: new Date(result.finishedAt),
            durationMs: result.durationMs,
            fetchedBytes: result.fetchedBytes,
            scriptCount: result.scriptCount,
            fileProbeCount: result.fileProbeCount,
            findingCount: result.findings.length,
            criticalCount: counts.critical,
            highCount: counts.high,
            mediumCount: counts.medium,
            lowCount: counts.low,
            infoCount: counts.info,
            ok: result.ok,
            errorsJson: JSON.stringify(result.errors),
            findingsJson: JSON.stringify(result.findings),
          },
        });
      }
    }
  } catch {
    // persistence failure must NOT fail the scan response
  }

  return NextResponse.json(result, { status: 200 });
}

export async function GET() {
  return NextResponse.json({
    name: "LeakGuard scan API",
    usage: "POST /api/scan with body { \"url\": \"https://example.com\" }",
    categories: [
      "api_key",
      "secret",
      "ai_fingerprint",
      "exposed_file",
      "debug_endpoint",
      "source_map",
      "pii",
      "misconfig",
    ],
  });
}
