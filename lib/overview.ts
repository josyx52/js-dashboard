import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateInTimeZone } from "@/lib/dates";
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
  lastSyncAt: string | null;
}

export interface OverviewRaw {
  openTasks: { content: string; due: string | null; pillar: string | null; recurring: boolean | null; gtd_owner: string | null }[];
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
  for (const t of raw.doneTasks) {
    const d = localDay(t.updated_at);
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
    agenda: agenda.slice(0, 8),
    lastSyncAt: raw.lastSyncAt,
  };
}

export async function loadOverview(sb: SupabaseClient, now: Date, days: number): Promise<Overview> {
  const today = dateInTimeZone(now, TZ);
  // Busca o dobro do intervalo (para a comparacao com o periodo anterior),
  // com um dia de folga por causa do fuso.
  const since = new Date(new Date(addDays(today, -(2 * days)) + "T00:00:00Z").getTime() - 86400000).toISOString();
  const rangeSince = new Date(new Date(addDays(today, -days) + "T00:00:00Z").getTime()).toISOString();
  const q = await Promise.all([
    sb.from("tasks_cache").select("content, due, pillar, recurring, gtd_owner").eq("status", "open"),
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
    sb.from("sync_state").select("last_sync_at").eq("id", 1).maybeSingle(),
  ]);
  const err = q.find((r) => r.error)?.error;
  if (err) throw new Error(err.message);
  const [open, done, logs, body, profile, steps, actions, msgs, mems, autos, runs, agenda, sync] = q as any[];
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
    },
    now,
    days
  );
}
