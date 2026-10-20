import type { SupabaseClient } from "@supabase/supabase-js";
import { calcBMR } from "@/lib/bmr";
import { HOLIDAY_TZ, dailyMetrics, type Snapshot } from "./snapshot";
import type { Signal } from "./engines";
import { correlate, type Correlation, type DailyRow } from "./correlate";

// Memoria do Holiday, em tres camadas (como o Jarvis):
// - curto prazo: conversa recente + o que mudou desde a ultima conversa + acoes de hoje
// - longo prazo: holiday_memories (factos, preferencias, objetivos, padroes)
// - correlacao: holiday_daily (1 linha/dia) -> baseline, padroes, persistencia

export interface LongTermMemory {
  id: string;
  kind: "fato" | "preferencia" | "objetivo" | "padrao";
  area: string | null;
  content: string;
  importance: number;
}

export interface ShortTerm {
  sinceLastTalk: string | null; // resumo do que mudou desde a ultima mensagem
  todayActions: { summary: string | null; status: string; result: string | null }[];
}

export interface AutomationBrief {
  id: string;
  name: string;
  kind: string;
  days: number[];
  time: string;
  active: boolean;
  trigger?: string;
  event?: string | null;
  run_at?: string | null;
}

export interface Memory {
  automations: AutomationBrief[];
  longTerm: LongTermMemory[];
  shortTerm: ShortTerm;
  correlation: Correlation;
}

function bmrOf(s: Snapshot): number | null {
  const w = s.body?.weight_kg;
  const p = s.profile;
  return w && p?.height_cm && p.age && p.sex ? calcBMR(w, p.height_cm, p.age, p.sex) : null;
}

function localDayStartIso(s: Snapshot): string {
  const now = new Date(s.now);
  const local = new Date(now.toLocaleString("en-US", { timeZone: HOLIDAY_TZ }));
  const utc = new Date(now.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(new Date(`${s.today}T00:00:00Z`).getTime() - (local.getTime() - utc.getTime())).toISOString();
}

// Grava/atualiza a linha de hoje no historico. Corre a cada ciclo (cron
// horario e cada conversa), por isso a ultima escrita do dia fica a valer.
export async function recordDaily(sb: SupabaseClient, s: Snapshot, signals: Signal[]) {
  const { count } = await sb
    .from("tasks_cache")
    .select("id", { count: "exact", head: true })
    .eq("status", "done")
    .gte("updated_at", localDayStartIso(s));
  await sb.from("holiday_daily").upsert(
    {
      date: s.today,
      ...dailyMetrics(s, bmrOf(s)),
      done_count: count ?? 0,
      signals: signals.map((x) => x.id),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "date" }
  );
}

export async function loadMemory(sb: SupabaseClient, s: Snapshot, signals: Signal[]): Promise<Memory> {
  const since30 = new Date(new Date(s.today + "T12:00:00Z").getTime() - 30 * 86400000).toISOString().slice(0, 10);
  const dayStart = localDayStartIso(s);

  const [mem, daily, lastMsg, todayActs, autos] = await Promise.all([
    sb
      .from("holiday_memories")
      .select("id, kind, area, content, importance")
      .eq("active", true)
      .order("importance", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(40),
    sb.from("holiday_daily").select("*").gte("date", since30).order("date"),
    sb
      .from("holiday_messages")
      .select("created_at")
      .in("role", ["assistant", "briefing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    sb.from("holiday_actions").select("summary, status, result").gte("created_at", dayStart).order("created_at"),
    sb.from("holiday_automations").select("id, name, kind, days, time, active, trigger, event, run_at").order("time"),
  ]);

  // O que mudou desde a ultima resposta do Holiday.
  let sinceLastTalk: string | null = null;
  const lastAt = lastMsg.data?.created_at as string | undefined;
  if (lastAt) {
    const { data: done } = await sb
      .from("tasks_cache")
      .select("content")
      .eq("status", "done")
      .gt("updated_at", lastAt)
      .limit(8);
    const meals = s.meals.filter((m) => m.at > lastAt);
    const hours = Math.round((new Date(s.now).getTime() - new Date(lastAt).getTime()) / 3600000);
    const parts = [`última conversa há ${hours} h`];
    if (done?.length) parts.push(`concluídas desde então: ${done.map((d) => d.content).join("; ")}`);
    if (meals.length) parts.push(`registos desde então: ${meals.map((m) => `${m.label} ${m.kcal} kcal`).join("; ")}`);
    sinceLastTalk = parts.join(" · ");
  }

  return {
    automations: (autos.data || []) as AutomationBrief[],
    longTerm: (mem.data || []) as LongTermMemory[],
    shortTerm: { sinceLastTalk, todayActions: todayActs.data || [] },
    correlation: correlate((daily.data || []) as DailyRow[], signals.map((x) => x.id), s.today),
  };
}
