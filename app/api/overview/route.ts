import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { loadOverview } from "@/lib/overview";

export const runtime = "nodejs";

// Visao geral do dashboard (todas as areas). ?days=7|30|90
export async function GET(req: NextRequest) {
  try {
    const d = Number(req.nextUrl.searchParams.get("days"));
    const days = [7, 30, 90].includes(d) ? d : 30;
    const overview = await loadOverview(supabaseServer(), new Date(), days);
    return NextResponse.json({ ok: true, ...overview });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
