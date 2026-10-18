import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// ?from=ISO&to=ISO (to opcional) — refeicoes/treinos num intervalo.
export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from");
    const to = req.nextUrl.searchParams.get("to");
    if (!from) return NextResponse.json({ error: "from obrigatorio" }, { status: 400 });
    let q = supabaseServer()
      .from("nutrition_logs")
      .select("*")
      .gte("created_at", from)
      .order("created_at", { ascending: false });
    if (to) q = q.lte("created_at", to);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, logs: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// Registo manual (refeicao ou treino). Antes era feito no browser sem
// user_id e falhava sempre com "null value in column user_id".
export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    if (!userId) return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });

    const { label, kcal, type } = await req.json();
    const kcalNum = Number(kcal);
    if (!label || !String(label).trim()) return NextResponse.json({ error: "nome obrigatorio" }, { status: 400 });
    if (!Number.isFinite(kcalNum) || kcalNum < 0) return NextResponse.json({ error: "kcal invalido" }, { status: 400 });
    if (type !== "in" && type !== "out") return NextResponse.json({ error: "type deve ser in ou out" }, { status: 400 });

    const { data, error } = await supabaseServer()
      .from("nutrition_logs")
      .insert({
        user_id: userId,
        label: String(label).trim(),
        kcal: kcalNum,
        type,
        source: type === "out" ? "treino" : "manual",
      })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, log: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
