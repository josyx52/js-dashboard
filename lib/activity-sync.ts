import type { SupabaseClient } from "@supabase/supabase-js";
import { dateInTimeZone } from "@/lib/dates";
import { googleAccessTokenResult } from "@/lib/integrations";

// Historico de atividades e eventos, guardado pela app (ver migracao 0018).
// Todoist da duas fontes, cada uma incompleta:
// - registo de atividade: inclui cada repeticao da rotina, mas o plano
//   gratuito so deixa ler os ultimos dias;
// - concluidas por data: meses de historico, mas sem as repeticoes.
// Juntamos as duas com a mesma chave (tarefa + minuto da conclusao), e como
// o sync corre de hora a hora o historico fica completo daqui para a frente.

const TZ = "Europe/Lisbon";
const TODOIST = "https://api.todoist.com/api/v1";

export interface ActivityRow {
  id: string;
  source: "todoist" | "ticktick";
  task_id: string;
  content: string;
  project_id: string | null;
  project_name: string | null;
  recurring: boolean;
  completed_at: string;
}

export function activityKey(source: string, taskId: string, completedAt: string) {
  return `${source}:${taskId}:${new Date(completedAt).toISOString().slice(0, 16)}`;
}

async function todoistPages(path: string, params: Record<string, string>, token: string, listKey: "results" | "items") {
  const out: any[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL(TODOIST + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(`Todoist ${path} HTTP ${r.status}${j?.error ? `: ${j.error}` : ""}`);
    out.push(...(j[listKey] || j.results || j.items || []));
    cursor = j.next_cursor || null;
    if (!cursor) break;
  }
  return out;
}

// Mapeamentos puros (testados) das respostas da API para linhas da tabela.
export function fromActivityEvent(e: any, projects: Map<string, string>): ActivityRow | null {
  if (e?.event_type && e.event_type !== "completed") return null;
  const taskId = String(e.object_id ?? "");
  const at = e.event_date;
  if (!taskId || !at) return null;
  const x = e.extra_data || {};
  const project = e.parent_project_id ? String(e.parent_project_id) : null;
  return {
    id: activityKey("todoist", taskId, at),
    source: "todoist",
    task_id: taskId,
    content: String(x.content || "(sem título)"),
    project_id: project,
    project_name: project ? projects.get(project) ?? null : null,
    recurring: !!(x.is_recurring ?? x.due?.is_recurring),
    completed_at: new Date(at).toISOString(),
  };
}

export function fromCompletedTask(t: any, projects: Map<string, string>): ActivityRow | null {
  const taskId = String(t?.task_id ?? t?.id ?? "");
  const at = t?.completed_at;
  if (!taskId || !at) return null;
  const project = t.project_id ? String(t.project_id) : null;
  return {
    id: activityKey("todoist", taskId, at),
    source: "todoist",
    task_id: taskId,
    content: String(t.content || "(sem título)"),
    project_id: project,
    project_name: project ? projects.get(project) ?? null : null,
    recurring: !!t.due?.is_recurring,
    completed_at: new Date(at).toISOString(),
  };
}

export async function syncTodoistActivity(sb: SupabaseClient, now = new Date()): Promise<{ added: number; error?: string }> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return { added: 0, error: "TODOIST_API_TOKEN nao configurado" };
  const errors: string[] = [];

  const projects = new Map<string, string>();
  try {
    for (const p of await todoistPages("/projects", { limit: "200" }, token, "results")) projects.set(String(p.id), p.name);
  } catch (e: any) {
    errors.push(e.message);
  }

  // Primeira vez (tabela vazia): importa 90 dias; depois so a ultima semana.
  const { count } = await sb.from("activity_log").select("id", { count: "exact", head: true }).eq("source", "todoist");
  const backDays = count ? 7 : 89;
  const rows = new Map<string, ActivityRow>();

  try {
    const since = new Date(now.getTime() - backDays * 86400000).toISOString();
    const items = await todoistPages("/tasks/completed/by_completion_date", { since, until: now.toISOString(), limit: "200" }, token, "items");
    for (const t of items) {
      const r = fromCompletedTask(t, projects);
      if (r) rows.set(r.id, r);
    }
  } catch (e: any) {
    errors.push(e.message);
  }

  // Registo de atividade (rotina incluida), dentro do limite do plano.
  try {
    const from = new Date(now.getTime() - 6 * 86400000).toISOString();
    let events: any[] = [];
    try {
      events = await todoistPages("/activities", { object_type: "task", event_type: "completed", date_from: from, limit: "100" }, token, "results");
    } catch {
      events = await todoistPages("/activities", { object_type: "item", event_type: "completed", date_from: from, limit: "100" }, token, "results");
    }
    for (const e of events) {
      const r = fromActivityEvent(e, projects);
      if (r) rows.set(r.id, { ...r, recurring: r.recurring || !!rows.get(r.id)?.recurring });
    }
  } catch (e: any) {
    errors.push(e.message);
  }

  // Recorrencia: o registo nem sempre a traz; a cache de tarefas sabe.
  if (rows.size) {
    const { data: rec } = await sb.from("tasks_cache").select("id").eq("recurring", true);
    const recurring = new Set((rec || []).map((r) => r.id));
    for (const r of rows.values()) if (recurring.has(r.task_id)) r.recurring = true;
    const { error } = await sb.from("activity_log").upsert([...rows.values()], { onConflict: "id" });
    if (error) errors.push(error.message);
  }
  return { added: rows.size, error: errors.length ? errors.join(" | ") : undefined };
}

// TickTick nao tem historico na API publica: regista a conclusao quando o
// sync deteta que a tarefa saiu da lista de abertas.
export async function recordClosed(sb: SupabaseClient, source: "ticktick" | "todoist", ids: string[], now: string) {
  if (!ids.length) return;
  const { data } = await sb.from("tasks_cache").select("id, content, source_project_id, recurring").in("id", ids);
  const rows: ActivityRow[] = (data || []).map((t) => ({
    id: activityKey(source, t.id, now),
    source,
    task_id: t.id,
    content: t.content,
    project_id: t.source_project_id ?? null,
    project_name: null,
    recurring: !!t.recurring,
    completed_at: now,
  }));
  // Todoist ja vem do registo de atividade com a hora exata.
  if (source === "ticktick" && rows.length) await sb.from("activity_log").upsert(rows, { onConflict: "id" });
}

export interface CalendarRow {
  id: string;
  summary: string;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  date: string;
}

export function fromCalendarEvent(e: any): CalendarRow | null {
  if (!e?.id || e.status === "cancelled") return null;
  const allDay = !e.start?.dateTime;
  const start = e.start?.dateTime || e.start?.date;
  if (!start) return null;
  return {
    id: String(e.id),
    summary: String(e.summary || "(sem título)"),
    start_at: allDay ? null : new Date(e.start.dateTime).toISOString(),
    end_at: allDay ? null : e.end?.dateTime ? new Date(e.end.dateTime).toISOString() : null,
    all_day: allDay,
    date: allDay ? String(start).slice(0, 10) : dateInTimeZone(new Date(start), TZ),
  };
}

// Eventos de -90 a +14 dias -> calendar_events (substitui a janela inteira,
// para que eventos apagados no Google desaparecam tambem aqui).
export async function syncCalendarHistory(sb: SupabaseClient, now = new Date()): Promise<{ events: number; error?: string }> {
  const { token, error } = await googleAccessTokenResult();
  if (!token) return { events: 0, error: `sem acesso ao Google Calendar: ${error}` };
  const timeMin = new Date(now.getTime() - 90 * 86400000);
  const timeMax = new Date(now.getTime() + 14 * 86400000);
  const rows: CalendarRow[] = [];
  let pageToken: string | null = null;
  for (let page = 0; page < 10; page++) {
    const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
    url.searchParams.set("timeMin", timeMin.toISOString());
    url.searchParams.set("timeMax", timeMax.toISOString());
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("maxResults", "2500");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) return { events: 0, error: `Calendar HTTP ${r.status}` };
    const j: any = await r.json();
    for (const e of j.items || []) {
      const row = fromCalendarEvent(e);
      if (row) rows.push(row);
    }
    pageToken = j.nextPageToken || null;
    if (!pageToken) break;
  }
  const from = dateInTimeZone(timeMin, TZ);
  const to = dateInTimeZone(timeMax, TZ);
  const { error: delErr } = await sb.from("calendar_events").delete().gte("date", from).lte("date", to);
  if (delErr) return { events: 0, error: delErr.message };
  if (rows.length) {
    const { error: insErr } = await sb.from("calendar_events").upsert(rows.map((r) => ({ ...r, updated_at: now.toISOString() })), { onConflict: "id" });
    if (insErr) return { events: 0, error: insErr.message };
  }
  return { events: rows.length };
}
