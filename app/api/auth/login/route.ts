import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, SESSION_DAYS, createSessionToken, hmac, safeEqual } from "@/lib/auth";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const secret = process.env.APP_PASSWORD;
  if (!secret) return NextResponse.json({ error: "APP_PASSWORD nao configurado nos secrets do Worker" }, { status: 503 });

  const { password } = await req.json().catch(() => ({ password: "" }));
  // Compara os HMACs (mesmo tamanho) em vez das strings cruas.
  const ok = safeEqual(await hmac(secret, String(password || "")), await hmac(secret, secret));
  if (!ok) {
    await new Promise((r) => setTimeout(r, 800)); // trava tentativas em serie
    return NextResponse.json({ error: "palavra-passe errada" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, await createSessionToken(secret), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, secure: true, sameSite: "lax", path: "/", maxAge: 0 });
  return res;
}
