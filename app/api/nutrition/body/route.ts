import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    if (!userId) return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });

    const { date, weight_kg, body_fat_pct, lean_mass_kg } = await req.json();
    if (!date) return NextResponse.json({ error: "date obrigatorio" }, { status: 400 });

    const sb = supabaseServer();

    // Le a linha existente do dia (se houver) para nao apagar campos que o
    // utilizador deixou em branco neste pedido — so atualiza o que veio.
    const { data: existing } = await sb
      .from("body_composition")
      .select("weight_kg, body_fat_pct, lean_mass_kg")
      .eq("user_id", userId)
      .eq("date", date)
      .maybeSingle();

    const { error } = await sb.from("body_composition").upsert(
      {
        user_id: userId,
        date,
        weight_kg: weight_kg ?? existing?.weight_kg ?? null,
        body_fat_pct: body_fat_pct ?? existing?.body_fat_pct ?? null,
        lean_mass_kg: lean_mass_kg ?? existing?.lean_mass_kg ?? null,
      },
      { onConflict: "user_id,date" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
