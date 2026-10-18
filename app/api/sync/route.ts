import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchTodoist, fetchTickTick, fetchCalendarEventsResult, RawTask } from "@/lib/integrations";
import { classifyPillars } from "@/lib/groq";

export const runtime = "nodejs";

// Chamado pelo botao "Sincronizar" e de hora a hora pelo cron (worker.ts).
export async function POST() {
  try {
    const userId = process.env.SYNC_USER_ID;
    if (!userId) {
      return NextResponse.json(
        { error: "SYNC_USER_ID nao configurado (ver Settings -> Variables and Secrets)" },
        { status: 500 }
      );
    }

    const sb = supabaseServer();
    const summary: Record<string, number | string> = {};
    const now = new Date().toISOString();

    // ── Todoist + TickTick -> tasks_cache ──
    const [todoist, ticktick] = await Promise.all([fetchTodoist(), fetchTickTick()]);
    const sources = [
      { source: "todoist" as const, result: todoist },
      { source: "ticktick" as const, result: ticktick },
    ];

    for (const { source, result } of sources) {
      summary[source] = result.items.length;
      if (result.error) summary[`${source}_error`] = result.error;
      if (!result.ok) continue; // falhou: nao mexer na cache desta fonte

      if (result.items.length > 0) {
        const { error: upsertErr } = await sb.from("tasks_cache").upsert(
          result.items.map((t: RawTask) => ({
            id: t.id,
            user_id: userId,
            source,
            content: t.content,
            due: t.due,
            source_project_id: t.projectId || null,
            status: "open",
            updated_at: now,
          })),
          { onConflict: "id" }
        );
        if (upsertErr) {
          summary[`${source}_error`] = upsertErr.message;
          continue;
        }
      }

      // Tarefas abertas na cache que ja nao vem da origem foram concluidas ou
      // apagadas la — antes ficavam "abertas" para sempre no dashboard.
      const { data: openRows } = await sb.from("tasks_cache").select("id").eq("source", source).eq("status", "open");
      const live = new Set(result.items.map((t) => t.id));
      const gone = (openRows || []).map((r) => r.id).filter((id) => !live.has(id));
      if (gone.length > 0) {
        const { error: closeErr } = await sb
          .from("tasks_cache")
          .update({ status: "done", updated_at: now })
          .in("id", gone);
        if (closeErr) summary[`${source}_close_error`] = closeErr.message;
        else summary[`${source}_closed`] = gone.length;
      }
    }

    // Classificar pilar SO das tarefas que ainda nao tem um (nunca re-inferir).
    // Uma so chamada em lote no fim — atualizar linha a linha esgotava o limite
    // de subrequests do Worker quando havia muitas tarefas por classificar.
    const { data: unclassified } = await sb
      .from("tasks_cache")
      .select("id, content, user_id, source, due, status")
      .eq("user_id", userId)
      .eq("status", "open")
      .is("pillar", null);

    if (unclassified && unclassified.length > 0) {
      const pillars = await classifyPillars(unclassified);
      const updates = unclassified
        .filter((t) => pillars[t.id])
        .map((t) => ({
          ...t,
          pillar: pillars[t.id],
          delegable: pillars[t.id] === "negocio" || pillars[t.id] === "trabalho",
        }));
      if (updates.length > 0) {
        const { error: classifyErr } = await sb.from("tasks_cache").upsert(updates, { onConflict: "id" });
        if (classifyErr) summary.classify_error = classifyErr.message;
      }
      summary.classified = updates.length;
    }

    // ── Google Calendar -> agenda_cache (agrupado por dia) ──
    const start = new Date();
    const timeMin = start.toISOString();
    const timeMax = new Date(start.getTime() + 14 * 24 * 60 * 60000).toISOString();
    const calendar = await fetchCalendarEventsResult(timeMin, timeMax);
    const events = calendar.items;
    summary.calendar = events.length;
    if (calendar.error) summary.calendar_error = calendar.error;

    const byDate: Record<string, typeof events> = {};
    for (const ev of events) {
      const day = String(ev.start).slice(0, 10);
      if (!byDate[day]) byDate[day] = [];
      byDate[day].push(ev);
    }
    const agendaRows = Object.entries(byDate).map(([date, dayEvents]) => ({
      user_id: userId,
      date,
      source_integration_id: null,
      payload: dayEvents,
      updated_at: now,
    }));
    // Substitui o snapshot inteiro: o upsert por (user_id,date,source_integration_id)
    // nunca dava conflito com source_integration_id NULL e duplicava linhas.
    if (calendar.ok) {
      const { error: delErr } = await sb
        .from("agenda_cache")
        .delete()
        .eq("user_id", userId)
        .is("source_integration_id", null);
      if (delErr) summary.agenda_error = delErr.message;
      else if (agendaRows.length > 0) {
        const { error: agendaErr } = await sb.from("agenda_cache").insert(agendaRows);
        if (agendaErr) summary.agenda_error = agendaErr.message;
      }
    }

    // Hora real do ultimo sync — o dashboard mostra isto em vez da hora atual.
    const { error: stateErr } = await sb
      .from("sync_state")
      .upsert({ id: 1, last_sync_at: now, summary }, { onConflict: "id" });
    if (stateErr) summary.state_error = stateErr.message;

    return NextResponse.json({ ok: true, summary, last_sync_at: now });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
