import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { dateInTimeZone } from "@/lib/dates";
import { HOLIDAY_TZ } from "@/lib/holiday/snapshot";
import { cycle, think } from "@/lib/holiday/run";
import { runDueAutomations } from "@/lib/holiday/automations";

export const runtime = "nodejs";

const BRIEFING_HOUR = 7; // a partir das 07h de Lisboa

// Ciclo de fundo do Holiday, chamado pelo cron de 15 em 15 min:
// 1. grava a linha de hoje no historico (correlacao)
// 2. corre as automacoes que chegaram a hora
// 3. gera o briefing uma vez por dia, a partir das 07h
// ?force=1 (botao no chat) so gera o briefing, mesmo antes das 07h.
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseServer();
    const now = new Date();
    const today = dateInTimeZone(now, HOLIDAY_TZ);
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: HOLIDAY_TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
    const force = req.nextUrl.searchParams.get("force") === "1";

    let automations: { ran: number; missed: number; events: number } | null = null;
    if (!force) {
      const { signals } = await cycle(sb);
      automations = await runDueAutomations(
        sb,
        async (a) => {
          const r = await think(sb, { kind: "automation", automation: a });
          return { messageId: r.message.id, summary: r.message.content.slice(0, 200) };
        },
        now,
        signals
      );
    }

    const { data: existing } = await sb.from("holiday_messages").select("id").eq("briefing_date", today).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, automations, skipped: "ja existe briefing hoje" });
    if (!force && hour < BRIEFING_HOUR) return NextResponse.json({ ok: true, automations, skipped: `antes das ${BRIEFING_HOUR}h` });

    const result = await think(sb, { kind: "briefing" });
    return NextResponse.json({ ok: true, automations, ...result });
  } catch (e: any) {
    // briefing_date e unico: dois pedidos em simultaneo — o segundo falha aqui, sem problema.
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
