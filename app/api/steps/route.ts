import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// NOTA: esta rota POST foi pensada originalmente para o Tasker/Health Connect
// (Android). O utilizador usa iPhone, e a fonte real de passos e a Google
// Health API (ver GET abaixo). Fica aqui como fallback manual — nao esta
// ligada a nenhum dispositivo neste momento, mas continua funcional se um
// dia quiseres enviar passos manualmente ou via outra automacao (ex: Atalhos
// do iOS a fazer um POST direto).
export async function POST(req: NextRequest) {
  try {
    const expected = process.env.STEPS_TOKEN;
    const provided = req.headers.get("X-Steps-Token");
    if (!expected || provided !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const steps = Math.round(Number(body.steps));
    const date = body.date || new Date().toISOString().slice(0, 10);
    if (!steps || steps < 0) {
      return NextResponse.json({ error: "steps invalido" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { error } = await sb
      .from("daily_steps")
      .upsert({ date, steps, source: "tasker", updated_at: new Date().toISOString() }, { onConflict: "date" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, date, steps });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const { fetchFitbitSteps } = await import("@/lib/integrations");
    const fitbitSteps = await fetchFitbitSteps(today);
    if (fitbitSteps !== null) {
      return NextResponse.json({ ok: true, steps: fitbitSteps, date: today, source: "fitbit" });
    }
    const sb = supabaseServer();
    const { data } = await sb.from("daily_steps").select("*").eq("date", today).maybeSingle();
    return NextResponse.json({ ok: true, steps: data?.steps ?? null, date: today, source: data?.source ?? null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
