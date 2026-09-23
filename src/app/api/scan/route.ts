import { NextResponse } from "next/server";
import { scanTarget } from "@/lib/leak-scanner";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/scan
 * Body: { "url": "https://example.com" }
 *
 * Bounded, single-shot scan. Returns a complete ScanResult.
 * No polling, no streaming, no loops on the client.
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

  try {
    const result = await scanTarget(url);
    return NextResponse.json(result, { status: 200 });
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
