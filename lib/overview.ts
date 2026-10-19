import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateInTimeZone, weekdayOf } from "@/lib/dates";
import { calcBMR, GOAL_TARGET_PCT } from "@/lib/bmr";
import { taskBucket } from "@/lib/task-bucket";
import { PILLARS } from "@/lib/types";
import { plainTitle } from "@/lib/text";
import { occurrences, type Automation } from "@/lib/holiday/automations";

// Visao geral do dashboard: uma so leitura agrega todas as areas da app
// (tarefas, nutricao, corpo, passos, Holiday, automacoes, agenda).
// buildOverview e pura (testavel); loadOverview so faz as queries.

export const TZ = "Europe/Lisbon";

export interface DayPoint {
  date: string;
  done: number;
  kcal_in: number | null; // null = nada registado
  kcal_training: number;
  steps: number | null;
}

export interface Overview {
  today: string;
  days: number;
  series: DayPoint[];
  tasks: {
    open: number;
    today: number;
    overdue: number;
    undated: number;
    oldestOverdueDays: number | null;
    doneInRange: number;
    donePrevRange: number;
    byPillar: { key: string; label: string; color: string; overdue: number; today: number; undated: number }[];
    gtd: { eu: number; holiday: number; unclear: number };
  };
  nutrition: {
    bmr: number | null;
    goal: string | null;
    targetKcal: number | null;
    todayIn: number;
    todayTraining: number;
    macros: { protein: number; carbs: number; fat: number };
    avgKcal: number | null; // media dos dias com registo no intervalo
    loggedDays: number;
  };
  body: {
    latest: { date: string; weight: number | null; fat: number | null; lean: number | null } | null;
    previous: { date: string; weight: number | null } | null;
    series: { date: string; weight: number }[];
    bmi: number | null;
  };
  steps: { today: number | null; avg: number | null };
  holiday: {
    actions: { executed: number; proposed: number; failed: number; rejected: number };
    pending: { id: string; summary: string | null }[];
    messages: number;
    memories: number;
    automationsActive: number;
    runs: { ok: number; failed: number };
    next: { name: string; kind: string; at: string }[];
  };
  agenda: { date: string; time: string | null; title: string }[];
  activity: {
    total: number;
    prevTotal: number;
    since: string | null; // inicio do historico guardado
    byDay: { date: string; total: number; pillars: Record<string, number> }[];
    byPillar: { key: string; label: string; color: string; count: number }[];
    byProject: { name: string; count: number }[];
    byHour: number[]; // 24, hora local
    byWeekday: number[]; // 7, segunda..domingo
    streak: number; // dias seguidos com pelo menos uma atividade
    routine: { id: string; title: string; color: string; days: boolean[]; done: number }[];
    routineDays: string[];
    recent: { content: string; at: string; color: string; pillar: string; project: string | null }[];
  };
  calendar: {
    connected: boolean;
    error: string | null;
    count: number;
    hours: number;
    avgHours: number;
    byDay: { date: string; hours: number; count: number }[];
    top: { title: string; hours: number; count: number }[];
    byWeekday: number[]; // horas, segunda..domingo
  };
  lastSyncAt: string | null;
}

export interface ActivityLogRow {
  task_id: string;
  content: string;
  project_id: string | null;
  project_name: string | null;
  recurring: boolean;
  completed_at: string;
}

export interface CalendarEventRow {
  id: string;
  summary: string;
  start_at: string | null;
  end_at: string | null;
  all_day: boolean;
  date: string;
}

export interface OverviewRaw {
  openTasks: { id: string; content: string; due: string | null; pillar: string | null; recurring: boolean | null; gtd_owner: string | null }[];
  taskPillars: { id: string; pillar: string | null; source_project_id: string | null }[];
  activity: ActivityLogRow[];
  calendarEvents: CalendarEventRow[];
  syncSummary: Record<string, any> | null;
  doneTasks: { updated_at: string }[];
  logs: { created_at: string; kcal: number | string; type: string; protein_g: number | string | null; carbs_g: number | string | null; fat_g: number | string | null }[];
  body: { date: string; weight_kg: number | string | null; body_fat_pct: number | string | null; lean_mass_kg: number | string | null }[];
  profile: { height_cm: number | string | null; age: number | null; sex: string | null; goal: string | null } | null;
  steps: { date: string; steps: number }[];
  actions: { id: string; created_at: string; status: string; summary: string | null }[];
  messages: number;
  memories: number;
  automations: Automation[];
  runs: { status: string }[];
  agenda: { date: string; payload: any }[];
  lastSyncAt: string | null;
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v));

export function buildOverview(raw: OverviewRaw, now: Date, days: number): Overview {
  const today = dateInTimeZone(now, TZ);
  const from = addDays(today, -(days - 1));
  const prevFrom = addDays(from, -days);
  const localDay = (iso: string) => dateInTimeZone(new Date(iso), TZ);

  // ── Serie diaria ──
  const byDay = new Map<string, DayPoint>();
  for (let d = from; d <= today; d = addDays(d, 1)) byDay.set(d, { date: d, done: 0, kcal_in: null, kcal_training: 0, steps: null });
  let donePrevRange = 0;
  // Historico real (activity_log); sem ele, a data em que o sync viu a tarefa fechada.
  const doneTimes = raw.activity.length ? raw.activity.map((a) => a.completed_at) : raw.doneTasks.map((t) => t.updated_at);
  for (const at of doneTimes) {
    const d = localDay(at);
    const p = byDay.get(d);
    if (p) p.done += 1;
    else if (d >= prevFrom && d < from) donePrevRange += 1;
  }
  const macros = { protein: 0, carbs: 0, fat: 0 };
  for (const l of raw.logs) {
    const d = localDay(l.created_at);
    const p = byDay.get(d);
    if (!p) continue;
    const kcal = Number(l.kcal) || 0;
    if (l.type === "out") p.kcal_training += kcal;
    else {
      p.kcal_in = (p.kcal_in ?? 0) + kcal;
      if (d === today) {
        macros.protein += num(l.protein_g) ?? 0;
        macros.carbs += num(l.carbs_g) ?? 0;
        macros.fat += num(l.fat_g) ?? 0;
      }
    }
  }
  for (const s of raw.steps) {
    const p = byDay.get(s.date);
    if (p) p.steps = s.steps;
  }
  const series = [...byDay.values()];

  // ── Tarefas abertas ──
  const pillars = PILLARS.map((p) => ({ key: p.key, label: p.label, color: p.color, overdue: 0, today: 0, undated: 0 }));
  let todayN = 0;
  let overdue = 0;
  let undated = 0;
  let oldest: string | null = null;
  const gtd = { eu: 0, holiday: 0, unclear: 0 };
  for (const t of raw.openTasks) {
    const b = taskBucket(t.due, !!t.recurring, today);
    if (b === "today") todayN += 1;
    if (b === "overdue") {
      overdue += 1;
      if (!oldest || t.due! < oldest) oldest = t.due;
    }
    if (b === "undated") undated += 1;
    if (t.gtd_owner === "eu") gtd.eu += 1;
    else if (t.gtd_owner === "holiday") gtd.holiday += 1;
    else gtd.unclear += 1;
    const p = pillars.find((x) => x.key === t.pillar);
    if (p && b !== "future") p[b] += 1;
  }
  const oldestOverdueDays = oldest ? Math.round((new Date(today + "T12:00:00Z").getTime() - new Date(oldest + "T12:00:00Z").getTime()) / 86400000) : null;

  // ── Corpo e nutricao ──
  const bodyRows = [...raw.body].sort((a, b) => b.date.localeCompare(a.date));
  const withWeight = bodyRows.filter((b) => num(b.weight_kg) !== null);
  const latest = bodyRows[0] ? { date: bodyRows[0].date, weight: num(bodyRows[0].weight_kg), fat: num(bodyRows[0].body_fat_pct), lean: num(bodyRows[0].lean_mass_kg) } : null;
  const weight = withWeight[0] ? num(withWeight[0].weight_kg)! : null;
  const prof = raw.profile;
  const height = num(prof?.height_cm);
  const bmr = weight && height && prof?.age && (prof.sex === "m" || prof.sex === "f") ? calcBMR(weight, height, prof.age, prof.sex) : null;
  const goal = prof?.goal ?? null;
  const targetKcal = bmr && goal ? Math.round(bmr * (1 - (GOAL_TARGET_PCT[goal] ?? 0) / 100)) : null;
  const logged = series.filter((d) => d.kcal_in !== null);
  const todayPoint = byDay.get(today)!;
  const stepDays = series.filter((d) => d.steps !== null);

  // ── Holiday ──
  const actions = { executed: 0, proposed: 0, failed: 0, rejected: 0 };
  for (const a of raw.actions) if (a.status in actions) actions[a.status as keyof typeof actions] += 1;
  const runs = { ok: 0, failed: 0 };
  for (const r of raw.runs) {
    if (r.status === "ok") runs.ok += 1;
    else runs.failed += 1; // falhou ou perdida
  }
  const active = raw.automations.filter((a) => a.active);
  const next = occurrences(active, today, addDays(today, 7))
    .filter((o) => new Date(o.at).getTime() > now.getTime())
    .slice(0, 5)
    .map((o) => ({ name: o.automation.name, kind: o.automation.kind, at: o.at }));

  // ── Agenda (cache do Google Calendar) ──
  const agenda: Overview["agenda"] = [];
  for (const row of [...raw.agenda].sort((a, b) => a.date.localeCompare(b.date))) {
    if (row.date < today || row.date > addDays(today, 7)) continue;
    for (const ev of Array.isArray(row.payload) ? row.payload : []) {
      const start = String(ev.start || "");
      agenda.push({ date: row.date, time: start.length > 10 ? start.slice(11, 16) : null, title: plainTitle(String(ev.summary || ev.title || "Evento")) });
    }
  }

  return {
    today,
    days,
    series,
    tasks: {
      open: raw.openTasks.length,
      today: todayN,
      overdue,
      undated,
      oldestOverdueDays,
      doneInRange: series.reduce((a, d) => a + d.done, 0),
      donePrevRange,
      byPillar: pillars,
      gtd,
    },
    nutrition: {
      bmr,
      goal,
      targetKcal,
      todayIn: todayPoint.kcal_in ?? 0,
      todayTraining: todayPoint.kcal_training,
      macros: { protein: Math.round(macros.protein), carbs: Math.round(macros.carbs), fat: Math.round(macros.fat) },
      avgKcal: logged.length ? Math.round(logged.reduce((a, d) => a + d.kcal_in!, 0) / logged.length) : null,
      loggedDays: logged.length,
    },
    body: {
      latest,
      previous: withWeight[1] ? { date: withWeight[1].date, weight: num(withWeight[1].weight_kg) } : null,
      series: withWeight.map((b) => ({ date: b.date, weight: num(b.weight_kg)! })).reverse(),
      bmi: weight && height ? Math.round((weight / (height / 100) ** 2) * 10) / 10 : null,
    },
    steps: {
      today: todayPoint.steps,
      avg: stepDays.length ? Math.round(stepDays.reduce((a, d) => a + d.steps!, 0) / stepDays.length) : null,
    },
    holiday: {
      actions,
      pending: raw.actions.filter((a) => a.status === "proposed").slice(0, 3).map((a) => ({ id: a.id, summary: a.summary })),
      messages: raw.messages,
      memories: raw.memories,
      automationsActive: active.length,
      runs,
      next,
    },
    agenda: upcoming(raw, today, now) ?? agenda.slice(0, 8),
    activity: buildActivity(raw, today, from, prevFrom, days),
    calendar: buildCalendar(raw, from, today),
    lastSyncAt: raw.lastSyncAt,
  };
}

const NONE = { key: "none", label: "Sem pilar", color: "#6e6e74" }; // cinzento neutro, fora da paleta

// Pilar de cada tarefa; para tarefas sem pilar (ou ja fora da cache), o pilar
// mais comum do mesmo projeto.
function pillarResolver(raw: OverviewRaw) {
  const byTask = new Map<string, string>();
  const byProject = new Map<string, Map<string, number>>();
  for (const t of raw.taskPillars) {
    if (!t.pillar) continue;
    byTask.set(t.id, t.pillar);
    if (t.source_project_id) {
      const m = byProject.get(t.source_project_id) || new Map<string, number>();
      m.set(t.pillar, (m.get(t.pillar) || 0) + 1);
      byProject.set(t.source_project_id, m);
    }
  }
  return (taskId: string, projectId: string | null) => {
    const k = byTask.get(taskId) || (projectId ? [...(byProject.get(projectId) || new Map()).entries()].sort((a, b) => b[1] - a[1])[0]?.[0] : undefined);
    const p = PILLARS.find((x) => x.key === k);
    return p ? { key: p.key, label: p.label, color: p.color } : NONE;
  };
}

function buildActivity(raw: OverviewRaw, today: string, from: string, prevFrom: string, days: number): Overview["activity"] {
  const localDay = (iso: string) => dateInTimeZone(new Date(iso), TZ);
  const localHour = (iso: string) => Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(new Date(iso)));
  const pillarOf = pillarResolver(raw);
  const byDay = new Map<string, { date: string; total: number; pillars: Record<string, number> }>();
  for (let d = from; d <= today; d = addDays(d, 1)) byDay.set(d, { date: d, total: 0, pillars: {} });
  const byPillar = new Map<string, { key: string; label: string; color: string; count: number }>();
  const byProject = new Map<string, number>();
  const byHour = Array(24).fill(0);
  const byWeekday = Array(7).fill(0);
  const doneOn = new Map<string, Set<string>>(); // task -> dias
  let prevTotal = 0;
  const inRange: (ActivityLogRow & { day: string; pillar: ReturnType<ReturnType<typeof pillarResolver>> })[] = [];

  for (const a of raw.activity) {
    const day = localDay(a.completed_at);
    if (day >= prevFrom && day < from) prevTotal += 1;
    const slot = byDay.get(day);
    if (!slot) continue;
    const pillar = pillarOf(a.task_id, a.project_id);
    slot.total += 1;
    slot.pillars[pillar.key] = (slot.pillars[pillar.key] || 0) + 1;
    const bp = byPillar.get(pillar.key) || { ...pillar, count: 0 };
    bp.count += 1;
    byPillar.set(pillar.key, bp);
    if (a.project_name) byProject.set(a.project_name, (byProject.get(a.project_name) || 0) + 1);
    byHour[localHour(a.completed_at)] += 1;
    byWeekday[(weekdayOf(day) + 6) % 7] += 1;
    const set = doneOn.get(a.task_id) || new Set<string>();
    set.add(day);
    doneOn.set(a.task_id, set);
    inRange.push({ ...a, day, pillar });
  }

  // Dias seguidos com atividade (hoje ainda pode estar a zero).
  let streak = 0;
  for (let d = byDay.get(today)?.total ? today : addDays(today, -1); byDay.get(d)?.total; d = addDays(d, -1)) streak += 1;

  // Rotina: tarefas recorrentes abertas x ultimos dias.
  const nDays = Math.min(days, 30);
  const routineDays = Array.from({ length: nDays }, (_, i) => addDays(today, i - nDays + 1));
  // O mesmo habito pode existir no Todoist e no TickTick: junta pelo titulo
  // (feito num dia = feito em qualquer um dos dois).
  const habits = new Map<string, { id: string; title: string; color: string; days: boolean[]; done: number }>();
  for (const t of raw.openTasks.filter((x) => x.recurring)) {
    const title = plainTitle(t.content);
    const key = title.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
    const set = doneOn.get(t.id) || new Set<string>();
    const h = habits.get(key) || { id: t.id, title, color: pillarOf(t.id, null).color, days: routineDays.map(() => false), done: 0 };
    h.days = h.days.map((v, i) => v || set.has(routineDays[i]));
    if (h.color === NONE.color) h.color = pillarOf(t.id, null).color;
    habits.set(key, h);
  }
  const routine = [...habits.values()]
    .map((h) => ({ ...h, done: h.days.filter(Boolean).length }))
    .sort((a, b) => b.done - a.done || a.title.localeCompare(b.title));

  const since = raw.activity.reduce<string | null>((m, a) => (!m || a.completed_at < m ? a.completed_at : m), null);
  return {
    total: inRange.length,
    prevTotal,
    since: since ? localDay(since) : null,
    byDay: [...byDay.values()],
    byPillar: [...PILLARS.map((p) => byPillar.get(p.key)).filter(Boolean), byPillar.get("none")].filter((x): x is NonNullable<typeof x> => !!x),
    byProject: [...byProject.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 6),
    byHour,
    byWeekday,
    streak,
    routine,
    routineDays,
    recent: inRange
      .sort((a, b) => b.completed_at.localeCompare(a.completed_at))
      .slice(0, 8)
      .map((a) => ({ content: plainTitle(a.content), at: a.completed_at, color: a.pillar.color, pillar: a.pillar.label, project: a.project_name })),
  };
}

function eventHours(e: CalendarEventRow) {
  if (e.all_day || !e.start_at || !e.end_at) return 0;
  return Math.max(0, Math.min(24, (new Date(e.end_at).getTime() - new Date(e.start_at).getTime()) / 3600000));
}

function buildCalendar(raw: OverviewRaw, from: string, today: string): Overview["calendar"] {
  const byDay = new Map<string, { date: string; hours: number; count: number }>();
  for (let d = from; d <= today; d = addDays(d, 1)) byDay.set(d, { date: d, hours: 0, count: 0 });
  const top = new Map<string, { title: string; hours: number; count: number }>();
  const byWeekday = Array(7).fill(0);
  let count = 0;
  let hours = 0;
  for (const e of raw.calendarEvents) {
    const slot = byDay.get(e.date);
    if (!slot) continue;
    const h = eventHours(e);
    slot.hours += h;
    slot.count += 1;
    count += 1;
    hours += h;
    byWeekday[(weekdayOf(e.date) + 6) % 7] += h;
    const title = plainTitle(e.summary);
    const t = top.get(title) || { title, hours: 0, count: 0 };
    t.hours += h;
    t.count += 1;
    top.set(title, t);
  }
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const s = raw.syncSummary || {};
  const error = (s.calendar_history_error || s.calendar_error || null) as string | null;
  const n = byDay.size || 1;
  return {
    connected: !error,
    error,
    count,
    hours: r1(hours),
    avgHours: r1(hours / n),
    byDay: [...byDay.values()].map((d) => ({ ...d, hours: r1(d.hours) })),
    top: [...top.values()].map((t) => ({ ...t, hours: r1(t.hours) })).sort((a, b) => b.hours - a.hours || b.count - a.count).slice(0, 6),
    byWeekday: byWeekday.map(r1),
  };
}

// Proximos eventos a partir do historico do calendario (null = sem dados).
function upcoming(raw: OverviewRaw, today: string, now: Date): Overview["agenda"] | null {
  const end = addDays(today, 7);
  const list = raw.calendarEvents
    .filter((e) => e.date >= today && e.date <= end && (e.all_day || !e.end_at || new Date(e.end_at) > now))
    .sort((a, b) => (a.start_at || a.date).localeCompare(b.start_at || b.date));
  if (!raw.calendarEvents.length) return null;
  return list.slice(0, 8).map((e) => ({
    date: e.date,
    time: e.start_at ? new Date(e.start_at).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: TZ }) : null,
    title: plainTitle(e.summary),
  }));
}

export async function loadOverview(sb: SupabaseClient, now: Date, days: number): Promise<Overview> {
  const today = dateInTimeZone(now, TZ);
  // Busca o dobro do intervalo (para a comparacao com o periodo anterior),
  // com um dia de folga por causa do fuso.
  const since = new Date(new Date(addDays(today, -(2 * days)) + "T00:00:00Z").getTime() - 86400000).toISOString();
  const rangeSince = new Date(new Date(addDays(today, -days) + "T00:00:00Z").getTime()).toISOString();
  const q = await Promise.all([
    sb.from("tasks_cache").select("id, content, due, pillar, recurring, gtd_owner").eq("status", "open"),
    sb.from("tasks_cache").select("updated_at").eq("status", "done").gte("updated_at", since),
    sb.from("nutrition_logs").select("created_at, kcal, type, protein_g, carbs_g, fat_g").gte("created_at", rangeSince),
    sb.from("body_composition").select("date, weight_kg, body_fat_pct, lean_mass_kg").order("date", { ascending: false }).limit(60),
    sb.from("user_profile").select("height_cm, age, sex, goal").limit(1).maybeSingle(),
    sb.from("daily_steps").select("date, steps").gte("date", addDays(today, -days)),
    sb.from("holiday_actions").select("id, created_at, status, summary").gte("created_at", rangeSince).order("created_at", { ascending: false }),
    sb.from("holiday_messages").select("id", { count: "exact", head: true }).gte("created_at", rangeSince),
    sb.from("holiday_memories").select("id", { count: "exact", head: true }).eq("active", true),
    sb.from("holiday_automations").select("*"),
    sb.from("holiday_automation_runs").select("status").gte("ran_at", rangeSince),
    sb.from("agenda_cache").select("date, payload").gte("date", today),
    sb.from("sync_state").select("last_sync_at, summary").eq("id", 1).maybeSingle(),
    sb.from("tasks_cache").select("id, pillar, source_project_id"),
    sb.from("activity_log").select("task_id, content, project_id, project_name, recurring, completed_at").gte("completed_at", since).order("completed_at").limit(5000),
    sb.from("calendar_events").select("id, summary, start_at, end_at, all_day, date").gte("date", addDays(today, -days)).lte("date", addDays(today, 7)),
  ]);
  const err = q.find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const [open, done, logs, body, profile, steps, actions, msgs, mems, autos, runs, agenda, sync, pillars, activity, events] = q as any[];
  return buildOverview(
    {
      openTasks: open.data || [],
      doneTasks: done.data || [],
      logs: logs.data || [],
      body: body.data || [],
      profile: profile.data || null,
      steps: steps.data || [],
      actions: actions.data || [],
      messages: msgs.count ?? 0,
      memories: mems.count ?? 0,
      automations: autos.data || [],
      runs: runs.data || [],
      agenda: agenda.data || [],
      lastSyncAt: sync.data?.last_sync_at ?? null,
      syncSummary: sync.data?.summary ?? null,
      taskPillars: pillars.data || [],
      activity: activity.data || [],
      calendarEvents: events.data || [],
    },
    now,
    days
  );
}
