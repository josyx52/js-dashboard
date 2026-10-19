import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

// { config: {...} } — ex: Notion { parent_id, parent_title }
export async function PATCH(req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const { config } = await req.json();
    if (!config || typeof config !== "object") return NextResponse.json({ error: "config obrigatorio" }, { status: 400 });
    const clean = {
      parent_id: typeof config.parent_id === "string" ? config.parent_id.slice(0, 64) : undefined,
      parent_title: typeof config.parent_title === "string" ? config.parent_title.slice(0, 200) : undefined,
    };
    const { error } = await supabaseServer().from("integrations").update({ config: clean }).eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: Ctx) {
  try {
    const { id } = await params;
    const sb = supabaseServer();
    await sb.from("delegations").delete().eq("integration_id", id);
    const { error } = await sb.from("integrations").delete().eq("id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
