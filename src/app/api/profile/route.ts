import { NextResponse } from "next/server";
import { authOptions } from "@/lib/auth/auth-options";
import { getServerSession } from "next-auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * GET /api/profile — returns the authenticated user's profile info.
 * This data is meant to be shown ONLY to the user themselves in the
 * private Profile section. The sidebar chip does NOT expose any PII
 * (name/email) — the user has to open the Profile section to see it.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ ok: false, error: "Not authenticated" }, { status: 401 });
  }
  try {
    const user = await db.user.findUnique({
      where: { email: session.user.email },
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
