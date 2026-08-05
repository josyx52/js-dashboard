import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

// Recebe passos do Tasker (plugin TaskerHealthConnect + acao HTTP Request).
// Autenticacao simples por token partilhado, ja que o Tasker nao suporta
// fluxos OAuth — o mesmo padrao usado no sistema-3-pilares.
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
