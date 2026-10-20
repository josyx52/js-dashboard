import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, dateInTimeZone, weekdayOf, zonedTimeToUtc } from "@/lib/dates";
import { HOLIDAY_TZ } from "./snapshot";
import type { Signal } from "./engines";

// Automacoes do Holiday: atividades agendadas que ele faz sozinho.
// - lembrete: publica a mensagem no chat (sem IA)
// - analise:  o Holiday pensa sobre o que pedes (ciclo completo) e responde
// - trabalho: o Holiday trabalha numa tarefa/tema e guarda o resultado
// O cron corre de 15 em 15 min; uma automacao corre uma vez por ocorrencia.
// Se o cron falhar mais de 2h depois da hora marcada, fica "perdida".

export type AutomationKind = "lembrete" | "analise" | "trabalho";

export interface Automation {
  id: string;
  name: string;
  kind: AutomationKind;
  prompt: string;
  days: number[];
  time: string; // HH:MM Lisboa
  active: boolean;
  created_by: "eu" | "holiday";
  last_run_at: string | null;
  // "horario": dias + hora. "evento": dispara quando as regras detetam `event`,
  // nos dias marcados, a partir de `time`, no maximo 1x a cada cooldown_hours.
  // "uma_vez": corre em `run_at` e desliga-se (o "once" do Lachesis no Jarvis).
  trigger?: "horario" | "evento" | "uma_vez";
  run_at?: string | null;
  event?: string | null;
  cooldown_hours?: number;
}

// Eventos que podem disparar automacoes (ligados aos sinais das regras).
export const EVENTS: Record<string, { label: string; match: (s: Signal) => boolean }> = {
  "meals:none": { label: "Sem refeições registadas (depois das 14h)", match: (s) => s.id === "meals:none" },
  overdue: { label: "Há tarefas atrasadas", match: (s) => s.id.startsWith("overdue:") },
  overdue_old: { label: "Tarefas atrasadas há mais de 14 dias", match: (s) => s.id.startsWith("overdue:") && s.severity === "alta" },
  today: { label: "Rotina / tarefas de hoje por fazer", match: (s) => s.id.startsWith("today:") },
  "deficit:off": { label: "Défice calórico fora da meta (à noite)", match: (s) => s.id === "deficit:off" },
  "weight:stale": { label: "Peso sem registo há mais de 7 dias", match: (s) => s.id === "weight:stale" || s.id === "weight:none" },
  "sync:stale": { label: "Tarefas desatualizadas (sync parado)", match: (s) => s.id === "sync:stale" || s.id === "sync:never" },
  "gtd:holiday_backlog": { label: "Tarefas delegadas ao Holiday sem trabalho", match: (s) => s.id === "gtd:holiday_backlog" },
  "gtd:unclarified": { label: "Tarefas por esclarecer (quem faz?)", match: (s) => s.id === "gtd:unclarified" },
  dup: { label: "Tarefas duplicadas", match: (s) => s.id.startsWith("dup:") },
};

export function isEvent(a: Automation) {
  return a.trigger === "evento" && !!a.event && !!EVENTS[a.event];
}

// Automacoes por evento que devem disparar agora, com os sinais que as ativam.
export function eventsDue(autos: Automation[], signals: Signal[], now: Date): { automation: Automation; signals: Signal[] }[] {
  const today = dateInTimeZone(now, HOLIDAY_TZ);
  const wd = weekdayOf(today);
  const out: { automation: Automation; signals: Signal[] }[] = [];
  for (const a of autos) {
    if (!a.active || !isEvent(a) || !a.days.includes(wd)) continue;
    if (now.getTime() < zonedTimeToUtc(today, a.time, HOLIDAY_TZ).getTime()) continue; // ainda antes da janela
    const cooldown = (a.cooldown_hours || 24) * 3600000;
    if (a.last_run_at && now.getTime() - new Date(a.last_run_at).getTime() < cooldown) continue;
    const hit = signals.filter(EVENTS[a.event!].match);
    if (hit.length) out.push({ automation: a, signals: hit });
  }
  return out;
}

export interface Occurrence {
  automation: Automation;
  date: string;
  at: string; // ISO
}

const LATE_LIMIT_MS = 2 * 3600 * 1000;

export const KIND_LABEL: Record<AutomationKind, string> = { lembrete: "Lembrete", analise: "Análise", trabalho: "Trabalho" };

// Automacoes fixas do sistema, so para mostrar na agenda.
export const SYSTEM_AUTOMATIONS = [
  { name: "Sincronizar tarefas", detail: "Todoist, TickTick e Google Calendar", time: "de hora a hora" },
  { name: "Histórico diário", detail: "grava o dia para a correlação e verifica automações", time: "a cada 15 min" },
  { name: "Briefing do dia", detail: "resumo do dia, causas e próximas ações", time: "07:00" },
];

export function normalizeTime(t: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t).trim());
  if (!m) return null;
  let h = Number(m[1]);
  let min = Math.round(Number(m[2]) / 15) * 15;
  if (min === 60) {
    min = 0;
    h += 1;
  }
  if (h > 23 || h < 0) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

export function normalizeDays(days: unknown): number[] | null {
  if (!Array.isArray(days)) return null;
  const out = [...new Set(days.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort();
  return out.length ? out : null;
}

// Ocorrencias de uma lista de automacoes entre duas datas (inclusive).
export function occurrences(autos: Automation[], from: string, to: string): Occurrence[] {
  const out: Occurrence[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const wd = weekdayOf(d);
    for (const a of autos) {
      if (isEvent(a)) continue;
      if (a.trigger === "uma_vez") {
        // Uma so ocorrencia, no dia de run_at, e so enquanto nao correu.
        if (a.run_at && !a.last_run_at && dateInTimeZone(new Date(a.run_at), HOLIDAY_TZ) === d) {
          out.push({ automation: a, date: d, at: new Date(a.run_at).toISOString() });
        }
        continue;
      }
      if (!a.days.includes(wd)) continue;
      out.push({ automation: a, date: d, at: zonedTimeToUtc(d, a.time, HOLIDAY_TZ).toISOString() });
    }
  }
  return out.sort((x, y) => x.at.localeCompare(y.at));
}

// O que ha para correr agora (e o que ja se perdeu), so para hoje.
export function dueNow(autos: Automation[], now: Date): { run: Occurrence[]; missed: Occurrence[] } {
  const today = dateInTimeZone(now, HOLIDAY_TZ);
  const run: Occurrence[] = [];
  const missed: Occurrence[] = [];
  for (const o of occurrences(autos.filter((a) => a.active), today, today)) {
    const at = new Date(o.at).getTime();
    if (at > now.getTime()) continue;
    if (o.automation.last_run_at && new Date(o.automation.last_run_at).getTime() >= at) continue;
    if (now.getTime() - at > LATE_LIMIT_MS) missed.push(o);
    else run.push(o);
  }
  return { run, missed };
}

export async function listAutomations(sb: SupabaseClient): Promise<Automation[]> {
  const { data } = await sb.from("holiday_automations").select("*").order("time");
  return (data || []) as Automation[];
}

// Corre as automacoes devidas. `think` e injetado para evitar dependencia
// circular com run.ts. Maximo de 2 com IA por ciclo (limite da Groq).
export async function runDueAutomations(
  sb: SupabaseClient,
  think: (a: Automation) => Promise<{ messageId: string; summary: string }>,
  now = new Date(),
  signals: Signal[] = []
): Promise<{ ran: number; missed: number; events: number }> {
  const all = await listAutomations(sb);
  const { run, missed } = dueNow(all, now);

  for (const o of missed) {
    await sb.from("holiday_automation_runs").insert({
      automation_id: o.automation.id,
      scheduled_for: o.at,
      status: "perdida",
      result: "o ciclo não correu a tempo",
    });
    await sb
      .from("holiday_automations")
      .update({ last_run_at: now.toISOString(), ...(o.automation.trigger === "uma_vez" ? { active: false } : {}) })
      .eq("id", o.automation.id);
  }

  let llmRuns = 0;
  let ran = 0;
  for (const o of run) {
    const a = o.automation;
    if (a.kind !== "lembrete" && llmRuns >= 2) continue; // fica para o proximo ciclo
    // Marca primeiro, para dois ciclos sobrepostos nao correrem a mesma.
    const { data: claimed } = await sb
      .from("holiday_automations")
      .update({ last_run_at: now.toISOString() })
      .eq("id", a.id)
      .or(`last_run_at.is.null,last_run_at.lt.${o.at}`)
      .select("id");
    if (!claimed?.length) continue;

    let status: "ok" | "falhou" = "ok";
    let result = "";
    let messageId: string | null = null;
    try {
      if (a.kind === "lembrete") {
        const { data: msg, error } = await sb
          .from("holiday_messages")
          .insert({ role: "briefing", content: a.prompt, automation_id: a.id })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        messageId = msg.id;
        result = "lembrete enviado para o chat";
      } else {
        llmRuns += 1;
        const r = await think(a);
        messageId = r.messageId;
        result = r.summary;
      }
    } catch (e: any) {
      status = "falhou";
      result = e?.message || String(e);
    }
    await sb.from("holiday_automation_runs").insert({
      automation_id: a.id,
      scheduled_for: o.at,
      status,
      result: result.slice(0, 500),
      message_id: messageId,
    });
    // Uma vez: cumprida, desliga-se (fica no historico).
    if (a.trigger === "uma_vez") await sb.from("holiday_automations").update({ active: false }).eq("id", a.id);
    ran += 1;
  }

  // ── Por evento ──
  let events = 0;
  for (const { automation: a, signals: hit } of eventsDue(all, signals, now)) {
    if (a.kind !== "lembrete" && llmRuns >= 2) continue;
    const { data: claimed } = await sb
      .from("holiday_automations")
      .update({ last_run_at: now.toISOString() })
      .eq("id", a.id)
      .or(`last_run_at.is.null,last_run_at.lt.${new Date(now.getTime() - (a.cooldown_hours || 24) * 3600000).toISOString()}`)
      .select("id");
    if (!claimed?.length) continue;

    const why = hit.map((h) => h.title + (h.detail ? ` (${h.detail.slice(0, 120)})` : "")).join("; ");
    let status: "ok" | "falhou" = "ok";
    let result = "";
    let messageId: string | null = null;
    try {
      if (a.kind === "lembrete") {
        const { data: msg, error } = await sb
          .from("holiday_messages")
          .insert({ role: "briefing", content: a.prompt, automation_id: a.id })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        messageId = msg.id;
        result = `evento: ${why}`;
      } else {
        llmRuns += 1;
        const r = await think({ ...a, prompt: `${a.prompt}\nEVENTO QUE DISPAROU: ${why}` });
        messageId = r.messageId;
        result = `evento: ${why} → ${r.summary}`;
      }
    } catch (e: any) {
      status = "falhou";
      result = e?.message || String(e);
    }
    await sb.from("holiday_automation_runs").insert({
      automation_id: a.id,
      scheduled_for: now.toISOString(),
      status,
      result: result.slice(0, 500),
      message_id: messageId,
    });
    events += 1;
  }
  return { ran, missed: missed.length, events };
}
