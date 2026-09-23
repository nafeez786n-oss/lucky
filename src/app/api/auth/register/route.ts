import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";

export const runtime = "nodejs";

/**
 * POST /api/auth/register
 * Body: { email, password, name? }
 *
 * Creates a user with a bcrypt-hashed password (10 rounds).
 * Returns { ok: true } on success.
 */
export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const name = typeof body?.name === "string" ? body.name.trim() : null;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please provide a valid email address." },
      { status: 400 }
    );
  }
  if (!password || password.length < 8) {
    return NextResponse.json(
      { ok: false, error: "Password must be at least 8 characters." },
      { status: 400 }
    );
  }
  if (password.length > 200) {
    return NextResponse.json(
      { ok: false, error: "Password too long." },
      { status: 400 }
    );
  }

  try {
    const existing = await db.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { ok: false, error: "An account already exists with that email." },
        { status: 409 }
      );
    }
    const passwordHash = await bcrypt.hash(password, 10);
    await db.user.create({
      data: { email, name, passwordHash },
    });
    return NextResponse.json({ ok: true, email });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { ok: false, error: `Registration failed: ${msg}` },
      { status: 500 }
    );
  }
}
