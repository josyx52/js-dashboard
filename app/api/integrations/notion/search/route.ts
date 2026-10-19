import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { notionSearch, notionToken } from "@/lib/connectors";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const { token } = await notionToken(supabaseServer());
    if (!token) return NextResponse.json({ error: "Notion não está ligado — cria a integração “Notion” com a chave" }, { status: 400 });
    const q = (req.nextUrl.searchParams.get("q") || "").slice(0, 100);
    const results = await notionSearch(token, q, 10);
    return NextResponse.json({ ok: true, results: results.filter((r: any) => r.type === "page") });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 502 });
  }
}
