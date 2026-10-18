import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const sb = supabaseServer();
    let q = sb.from("tasks_cache").select("*").eq("status", "open");
    if (req.nextUrl.searchParams.get("delegable") === "1") q = q.eq("delegable", true);
    const [{ data, error }, { data: state }] = await Promise.all([
      q,
      sb.from("sync_state").select("last_sync_at, summary").eq("id", 1).maybeSingle(),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({
      ok: true,
      tasks: data || [],
      last_sync_at: state?.last_sync_at ?? null,
      last_sync_summary: state?.summary ?? null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
