import { NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, verifySessionToken, cronKey, safeEqual } from "@/lib/auth";

// Toda a app (paginas e /api/*) exige sessao. Antes disto as rotas de escrita
// estavam abertas a quem soubesse o URL do Worker.
export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Excecoes: a pagina/rota de login e o POST de passos (tem token proprio).
  if (pathname === "/login" || pathname.startsWith("/api/auth/")) return NextResponse.next();
  if (pathname === "/api/steps" && req.method === "POST") return NextResponse.next();

  const secret = process.env.APP_PASSWORD;
  if (!secret) {
    // Falha fechada: sem APP_PASSWORD configurada ninguem entra.
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "APP_PASSWORD nao configurado nos secrets do Worker" }, { status: 503 });
    }
    return NextResponse.redirect(new URL("/login", req.url));
  }

  if ((pathname === "/api/sync" || pathname === "/api/holiday/briefing") && req.method === "POST") {
    const provided = req.headers.get("x-cron-key");
    if (provided && safeEqual(provided, await cronKey(secret))) return NextResponse.next();
  }

  if (await verifySessionToken(secret, req.cookies.get(SESSION_COOKIE)?.value)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "sessao expirada — volta a entrar" }, { status: 401 });
  }
  const login = new URL("/login", req.url);
  if (pathname !== "/") login.searchParams.set("next", pathname);
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
