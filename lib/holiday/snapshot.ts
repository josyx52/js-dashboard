import type { SupabaseClient } from "@supabase/supabase-js";
import { dateInTimeZone } from "@/lib/dates";
import { plainTitle } from "@/lib/text";
import { fetchFitbitSteps } from "@/lib/integrations";
import type { Pillar } from "@/lib/types";

// Etapa 1 do ciclo (como o SnapshotBuilder do Jarvis): fotografia do estado
// atual, so com dados — sem IA. Tudo o resto (regras, raciocinio, acoes)
// trabalha sobre este objeto.

export const HOLIDAY_TZ = "Europe/Lisbon";

export type Bucket = "overdue" | "today" | "future" | "undated";

export interface SnapTask {
  id: string;
  source: "todoist" | "ticktick";
  title: string;
  due: string | null;
  pillar: Pillar | null;
  recurring: boolean;
  bucket: Bucket;
}

export interface SnapMeal {
  label: string;
  kcal: number;
  type: "in" | "out";
  at: string;
}

export interface Snapshot {
  now: string; // ISO
  today: string; // YYYY-MM-DD em Lisboa
  hour: number; // hora local (0-23)
  tasks: SnapTask[];
  meals: SnapMeal[];
  body: { weight_kg: number | null; body_fat_pct: number | null; date: string } | null;
  profile: { height_cm: number | null; age: number | null; sex: "m" | "f" | null; goal: string | null } | null;
  steps: number | null;
  lastSyncAt: string | null;
}

export function taskBucket(due: string | null, recurring: boolean, today: string): Bucket {
  if (!due) return "undated";
  if (due === today || (recurring && due < today)) return "today";
  return due < today ? "overdue" : "future";
}

function localHour(d: Date): number {
  return Number(new Intl.DateTimeFormat("en-GB", { timeZone: HOLIDAY_TZ, hour: "2-digit", hour12: false }).format(d)) % 24;
}

// Inicio do dia de hoje em Lisboa, em ISO (para filtrar refeicoes por created_at).
function startOfLocalDay(now: Date, today: string): string {
  // Diferenca entre a hora local e UTC neste instante (Lisboa: 0 ou +1h).
  const local = new Date(now.toLocaleString("en-US", { timeZone: HOLIDAY_TZ }));
  const offsetMs = local.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(new Date(`${today}T00:00:00Z`).getTime() - offsetMs).toISOString();
}

export async function buildSnapshot(sb: SupabaseClient, now = new Date()): Promise<Snapshot> {
  const today = dateInTimeZone(now, HOLIDAY_TZ);
  const dayStart = startOfLocalDay(now, today);

  const [tasksQ, mealsQ, bodyQ, profileQ, stepsQ, syncQ] = await Promise.all([
    sb.from("tasks_cache").select("id, source, content, due, pillar, recurring").eq("status", "open"),
    sb.from("nutrition_logs").select("label, kcal, type, created_at").gte("created_at", dayStart).order("created_at"),
    sb.from("body_composition").select("weight_kg, body_fat_pct, date").order("date", { ascending: false }).limit(1).maybeSingle(),
    sb.from("user_profile").select("height_cm, age, sex, goal").limit(1).maybeSingle(),
    sb.from("daily_steps").select("steps").eq("date", today).maybeSingle(),
    sb.from("sync_state").select("last_sync_at").eq("id", 1).maybeSingle(),
  ]);

  let steps: number | null = stepsQ.data?.steps ?? null;
  if (steps === null) {
    // Google Health e opcional — se falhar, o Holiday segue sem passos.
    steps = await fetchFitbitSteps(today)
      .then((r) => r.steps)
      .catch(() => null);
  }

  return {
    now: now.toISOString(),
    today,
    hour: localHour(now),
    tasks: (tasksQ.data || []).map((t: any) => ({
      id: t.id,
      source: t.source,
      title: plainTitle(t.content),
      due: t.due,
      pillar: t.pillar,
      recurring: !!t.recurring,
      bucket: taskBucket(t.due, !!t.recurring, today),
    })),
    meals: (mealsQ.data || []).map((m: any) => ({ label: m.label, kcal: Number(m.kcal), type: m.type, at: m.created_at })),
    body: bodyQ.data ? { weight_kg: bodyQ.data.weight_kg, body_fat_pct: bodyQ.data.body_fat_pct, date: bodyQ.data.date } : null,
    profile: profileQ.data || null,
    steps,
    lastSyncAt: syncQ.data?.last_sync_at ?? null,
  };
}
