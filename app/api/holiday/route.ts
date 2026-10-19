import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { buildSnapshot } from "@/lib/holiday/snapshot";
import { detectSignals, groupProblems } from "@/lib/holiday/engines";
import { think } from "@/lib/holiday/run";

export const runtime = "nodejs";

// Estado do chat: ultimas mensagens, as acoes delas e os problemas atuais
// (so regras, sem IA — barato de calcular a cada abertura da pagina).
export async function GET() {
  try {
    const sb = supabaseServer();
    const [{ data: msgs, error }, snapshot, { data: memories }] = await Promise.all([
      sb
        .from("holiday_messages")
        .select("id, role, content, created_at, automation_id")
        .order("created_at", { ascending: false })
        .limit(40),
      buildSnapshot(sb),
      sb
        .from("holiday_memories")
        .select("id, kind, area, content, importance, created_at")
        .eq("active", true)
        .order("importance", { ascending: false })
        .order("created_at", { ascending: false }),
    ]);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Nome da automacao que gerou cada mensagem (para a etiqueta no chat).
    const autoIds = [...new Set((msgs || []).map((m) => m.automation_id).filter(Boolean))];
    const { data: autos } = autoIds.length
      ? await sb.from("holiday_automations").select("id, name").in("id", autoIds)
      : { data: [] as { id: string; name: string }[] };
    const autoName = new Map((autos || []).map((a) => [a.id, a.name]));
    const messages = (msgs || [])
      .reverse()
      .map((m) => ({ ...m, automation_name: m.automation_id ? autoName.get(m.automation_id) || "automação" : null }));
    const ids = messages.map((m) => m.id);
    const { data: actions } = ids.length
      ? await sb
          .from("holiday_actions")
          .select("id, type, summary, risk, status, reason, result, message_id, created_at")
          .in("message_id", ids)
          .order("created_at")
      : { data: [] };
    return NextResponse.json({
      ok: true,
      messages,
      actions: actions || [],
      problems: groupProblems(detectSignals(snapshot)),
      memories: memories || [],
      delegated: snapshot.tasks
        .filter((t) => t.owner === "holiday")
        .map((t) => ({ id: t.id, title: t.title, due: t.due, list: t.list, note: t.note })),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { message, imageBase64, voice } = await req.json();
    const text = String(message || "").trim();
    const image = typeof imageBase64 === "string" && imageBase64 ? imageBase64 : undefined;
    if (!text && !image) return NextResponse.json({ error: "mensagem ou foto obrigatoria" }, { status: 400 });
    if (text.length > 4000) return NextResponse.json({ error: "mensagem demasiado longa" }, { status: 400 });
    const result = await think(supabaseServer(), { kind: "chat", message: text, imageBase64: image, voice: !!voice });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
