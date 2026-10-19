import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { dateInTimeZone } from "@/lib/dates";
import { parseSteps } from "@/lib/steps";

export const runtime = "nodejs";

// Fonte principal dos passos: um atalho no iPhone (app Atalhos) le os passos
// da app Saude e envia-os aqui. Sem OAuth, nada expira.
//   POST /api/steps   header X-Steps-Token: <STEPS_TOKEN>   body {"steps": 6240, "date"?: "YYYY-MM-DD"}
function sameSecret(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function POST(req: NextRequest) {
  try {
    // trim: o secret enviado por pipe no PowerShell pode trazer a quebra de linha.
    const expected = process.env.STEPS_TOKEN?.trim();
    const provided = (req.headers.get("X-Steps-Token") || req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "").trim();
    if (!expected || !sameSecret(provided, expected)) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const steps = parseSteps(body.steps);
    const date = body.date ? String(body.date).slice(0, 10) : dateInTimeZone(new Date(), "Europe/Lisbon");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json({ error: "date invalida (YYYY-MM-DD)" }, { status: 400 });
    }
    if (steps === null) {
      return NextResponse.json({ error: "steps invalido" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { error } = await sb
      .from("daily_steps")
      .upsert({ date, steps, source: "iphone", updated_at: new Date().toISOString() }, { onConflict: "date" });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, date, steps });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

// ?date=YYYY-MM-DD — a data local vem do browser; o Worker corre em UTC e
// perto da meia-noite pedia os passos do dia errado.
export async function GET(req: NextRequest) {
  try {
    const param = req.nextUrl.searchParams.get("date");
    const today = param && /^\d{4}-\d{2}-\d{2}$/.test(param) ? param : new Date().toISOString().slice(0, 10);
    const sb = supabaseServer();
    const { data, error: dbError } = await sb.from("daily_steps").select("*").eq("date", today).maybeSingle();
    if (data) return NextResponse.json({ ok: true, steps: data.steps, date: today, source: data.source });
    // Sem envio do iPhone hoje: tenta o Google Health (se estiver configurado).
    if (!process.env.GOOGLE_HEALTH_REFRESH_TOKEN) {
      return NextResponse.json({ ok: true, steps: null, date: today, source: null, google_health_error: null, db_error: dbError?.message || null });
    }
    const { fetchFitbitSteps } = await import("@/lib/integrations");
    const { steps, error } = await fetchFitbitSteps(today);
    return NextResponse.json({ ok: true, steps, date: today, source: steps !== null ? "fitbit" : null, google_health_error: error || null, db_error: dbError?.message || null });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
