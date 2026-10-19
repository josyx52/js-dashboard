import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { EVENTS, isEvent, listAutomations, occurrences, SYSTEM_AUTOMATIONS } from "@/lib/holiday/automations";
import { parseAutomationInput } from "@/lib/holiday/automation-input";
import { addDays } from "@/lib/dates";

export const runtime = "nodejs";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// ?from=YYYY-MM-DD&to=YYYY-MM-DD — automacoes e as ocorrencias nesse periodo,
// com o resultado das que ja correram.
export async function GET(req: NextRequest) {
  try {
    const from = req.nextUrl.searchParams.get("from") || "";
    const to = req.nextUrl.searchParams.get("to") || (DATE_RE.test(from) ? addDays(from, 6) : "");
    if (!DATE_RE.test(from) || !DATE_RE.test(to) || to < from) {
      return NextResponse.json({ error: "from/to invalidos" }, { status: 400 });
    }
    const sb = supabaseServer();
    const automations = await listAutomations(sb);
    const occ = occurrences(automations, from, to);
    const { data: runs } = await sb
      .from("holiday_automation_runs")
      .select("automation_id, scheduled_for, ran_at, status, result")
      .gte("scheduled_for", `${addDays(from, -1)}T00:00:00Z`)
      .lte("scheduled_for", `${addDays(to, 1)}T00:00:00Z`);
    const eventIds = new Set(automations.filter(isEvent).map((a) => a.id));
    const runKey = (id: string, at: string) => `${id}|${new Date(at).toISOString()}`;
    const byKey = new Map((runs || []).map((r) => [runKey(r.automation_id, r.scheduled_for), r]));

    return NextResponse.json({
      ok: true,
      automations,
      occurrences: occ.map((o) => ({
        automation_id: o.automation.id,
        date: o.date,
        at: o.at,
        run: byKey.get(runKey(o.automation.id, o.at)) || null,
      })),
      // Disparos por evento (aparecem no dia em que aconteceram).
      eventRuns: (runs || [])
        .filter((r) => eventIds.has(r.automation_id))
        .map((r) => ({
          automation_id: r.automation_id,
          at: r.scheduled_for,
          date: new Date(r.scheduled_for).toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" }),
          run: { status: r.status, result: r.result, ran_at: r.ran_at },
        }))
        .filter((r) => r.date >= from && r.date <= to),
      events: Object.fromEntries(Object.entries(EVENTS).map(([k, v]) => [k, v.label])),
      system: SYSTEM_AUTOMATIONS,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const parsed = parseAutomationInput(await req.json());
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
    const { data, error } = await supabaseServer()
      .from("holiday_automations")
      .insert({ ...parsed.value, created_by: "eu" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, automation: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
