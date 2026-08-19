import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { fetchTodoist, fetchTickTick, fetchCalendarEvents } from "@/lib/integrations";
import { classifyPillars } from "@/lib/groq";

export const runtime = "nodejs";

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

    // ── Todoist + TickTick -> tasks_cache ──
    const [todoist, ticktick] = await Promise.all([fetchTodoist(), fetchTickTick()]);
    const allTasks = [
      ...todoist.map((t) => ({ ...t, source: "todoist" as const })),
      ...ticktick.map((t) => ({ ...t, source: "ticktick" as const })),
    ];
    summary.todoist = todoist.length;
    summary.ticktick = ticktick.length;

    if (allTasks.length > 0) {
      const { error: upsertErr } = await sb.from("tasks_cache").upsert(
        allTasks.map((t) => ({
          id: t.id,
          user_id: userId,
          source: t.source,
          content: t.content,
          due: t.due,
          source_project_id: t.projectId || null,
          status: "open",
          updated_at: new Date().toISOString(),
        })),
        { onConflict: "id" }
      );
      if (upsertErr) summary.tasks_error = upsertErr.message;
    }

    // Classificar pilar SO das tarefas que ainda nao tem um (nunca re-inferir).
    // Uma so chamada em lote no fim — atualizar linha a linha esgotava o limite
    // de subrequests do Worker quando havia muitas tarefas por classificar.
    const { data: unclassified } = await sb
      .from("tasks_cache")
      .select("id, content, user_id, source, due, status")
      .eq("user_id", userId)
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
    const now = new Date();
    const timeMin = now.toISOString();
    const timeMax = new Date(now.getTime() + 14 * 24 * 60 * 60000).toISOString();
    const events = await fetchCalendarEvents(timeMin, timeMax);
    summary.calendar = events.length;

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
      updated_at: new Date().toISOString(),
    }));
    if (agendaRows.length > 0) {
      const { error: agendaErr } = await sb
        .from("agenda_cache")
        .upsert(agendaRows, { onConflict: "user_id,date,source_integration_id" });
      if (agendaErr) summary.agenda_error = agendaErr.message;
    }

    return NextResponse.json({ ok: true, summary });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || String(e), stack: e?.stack },
      { status: 500 }
    );
  }
}
