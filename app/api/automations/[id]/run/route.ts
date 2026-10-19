import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { think } from "@/lib/holiday/run";
import type { Automation } from "@/lib/holiday/automations";

export const runtime = "nodejs";

// "Correr agora": executa a automacao fora do horario (nao conta como a
// ocorrencia agendada de hoje).
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sb = supabaseServer();
    const { data: a } = await sb.from("holiday_automations").select("*").eq("id", id).maybeSingle();
    if (!a) return NextResponse.json({ error: "automacao nao encontrada" }, { status: 404 });
    const auto = a as Automation;

    let messageId: string;
    let summary: string;
    if (auto.kind === "lembrete") {
      const { data: msg, error } = await sb
        .from("holiday_messages")
        .insert({ role: "briefing", content: auto.prompt, automation_id: auto.id })
        .select("id")
        .single();
      if (error) throw new Error(error.message);
      messageId = msg.id;
      summary = "lembrete enviado para o chat";
    } else {
      const r = await think(sb, { kind: "automation", automation: auto });
      messageId = r.message.id;
      summary = r.message.content.slice(0, 200);
    }
    await sb.from("holiday_automation_runs").insert({
      automation_id: auto.id,
      scheduled_for: new Date().toISOString(),
      status: "ok",
      result: `manual: ${summary}`.slice(0, 500),
      message_id: messageId,
    });
    return NextResponse.json({ ok: true, summary });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
