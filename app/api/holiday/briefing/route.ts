import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { dateInTimeZone } from "@/lib/dates";
import { HOLIDAY_TZ } from "@/lib/holiday/snapshot";
import { cycle, think } from "@/lib/holiday/run";

export const runtime = "nodejs";

const BRIEFING_HOUR = 7; // a partir das 07h de Lisboa

// Ciclo de fundo + briefing diario. Chamado de hora a hora pelo cron
// (depois do sync): grava sempre a linha de hoje no historico (correlacao)
// e gera o briefing uma vez por dia, a partir das 07h. ?force=1 gera ja
// (botao no chat), mas continua a ser so um por dia.
export async function POST(req: NextRequest) {
  try {
    const sb = supabaseServer();
    const now = new Date();
    const today = dateInTimeZone(now, HOLIDAY_TZ);
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: HOLIDAY_TZ, hour: "2-digit", hour12: false }).format(now)) % 24;
    const force = req.nextUrl.searchParams.get("force") === "1";

    await cycle(sb);

    const { data: existing } = await sb.from("holiday_messages").select("id").eq("briefing_date", today).maybeSingle();
    if (existing) return NextResponse.json({ ok: true, skipped: "ja existe briefing hoje" });
    if (!force && hour < BRIEFING_HOUR) return NextResponse.json({ ok: true, skipped: `antes das ${BRIEFING_HOUR}h` });

    const result = await think(sb, { kind: "briefing" });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: any) {
    // briefing_date e unico: dois pedidos em simultaneo — o segundo falha aqui, sem problema.
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
