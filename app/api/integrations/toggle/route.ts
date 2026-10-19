import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Liga/desliga uma integracao. Desligada, o Holiday deixa de a usar.
export async function POST(req: NextRequest) {
  try {
    const { id, connect } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });
    const { error } = await supabaseServer().from("integrations").update({ connected: !!connect }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
