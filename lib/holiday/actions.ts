import type { SupabaseClient } from "@supabase/supabase-js";
import { completeTask } from "@/lib/tasks";
import { addCalendarEvent, createTodoistTask, rescheduleTodoistTask } from "@/lib/integrations";
import type { Snapshot } from "./snapshot";

// Etapa 5 do ciclo (SolutionEngine do Jarvis): catalogo fechado de acoes.
// Risco "low" executa logo; risco "high" (mexe em Todoist/TickTick/Calendar)
// fica como cartao a espera de aprovacao. A IA so pode propor tipos deste
// catalogo, e cada proposta e validada contra o snapshot antes de existir.

export type ActionType =
  | "register_meal"
  | "log_weight"
  | "complete_task"
  | "create_task"
  | "reschedule_task"
  | "schedule_event"
  | "remember"
  | "forget"
  | "set_owner"
  | "save_task_note";

export interface ActionSpec {
  risk: "low" | "high";
  params: string; // descricao para o prompt
}

export const ACTIONS: Record<ActionType, ActionSpec> = {
  register_meal: { risk: "low", params: '{"label": string, "kcal": number, "type": "in" (refeicao) | "out" (treino)}' },
  log_weight: { risk: "low", params: '{"weight_kg": number}' },
  complete_task: { risk: "high", params: '{"task_id": string (id exato do snapshot)}' },
  create_task: { risk: "high", params: '{"content": string, "due_date"?: "YYYY-MM-DD"}' },
  reschedule_task: { risk: "high", params: '{"task_id": string (so Todoist e nao recorrente), "due_date": "YYYY-MM-DD"}' },
  schedule_event: {
    risk: "high",
    params: '{"summary": string, "start": ISO com fuso, "end": ISO com fuso, "reminder_minutes"?: number}',
  },
  // Memoria e GTD: so mexem nos dados do proprio Holiday, por isso sao "low".
  remember: {
    risk: "low",
    params: '{"kind": "fato"|"preferencia"|"objetivo"|"padrao", "content": string curta, "area"?: pilar, "importance"?: 1-5}',
  },
  forget: { risk: "low", params: '{"memory_id": string (id da MEMORIA LONGO PRAZO)}' },
  set_owner: {
    risk: "low",
    params: '{"task_id": string, "owner": "eu"|"holiday", "list"?: "proxima"|"agendada"|"aguardando"|"algum_dia"}',
  },
  save_task_note: { risk: "low", params: '{"task_id": string, "note": string (o trabalho feito/proximo passo)}' },
};

export interface ValidationContext {
  memoryIds?: Set<string>;
  memoryContents?: string[];
}

export interface Proposal {
  type: string;
  params: Record<string, any>;
  reason?: string;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Valida e normaliza uma proposta. Devolve o resumo legivel, ou o motivo
// da rejeicao (ids inventados, parametros em falta, etc.).
export function validateProposal(
  p: Proposal,
  snap: Snapshot,
  ctx: ValidationContext = {}
): { ok: true; type: ActionType; params: Record<string, any>; summary: string } | { ok: false; error: string } {
  if (!(p.type in ACTIONS)) return { ok: false, error: `tipo desconhecido: ${p.type}` };
  const type = p.type as ActionType;
  const a = p.params || {};
  const task = (id: unknown) => snap.tasks.find((t) => t.id === id);

  switch (type) {
    case "register_meal": {
      const kcal = Number(a.kcal);
      const label = String(a.label || "").trim();
      const kind = a.type === "out" ? "out" : "in";
      if (!label || !Number.isFinite(kcal) || kcal < 0 || kcal > 5000) return { ok: false, error: "refeicao invalida" };
      return {
        ok: true,
        type,
        params: { label, kcal: Math.round(kcal), type: kind },
        summary: `${kind === "in" ? "Registar refeição" : "Registar treino"}: ${label} (${Math.round(kcal)} kcal)`,
      };
    }
    case "log_weight": {
      const w = Number(a.weight_kg);
      if (!(w > 25 && w < 300)) return { ok: false, error: "peso invalido" };
      return { ok: true, type, params: { weight_kg: Math.round(w * 10) / 10 }, summary: `Registar peso: ${w} kg` };
    }
    case "complete_task": {
      const t = task(a.task_id);
      if (!t) return { ok: false, error: `tarefa ${a.task_id} nao existe no snapshot` };
      return { ok: true, type, params: { task_id: t.id }, summary: `Concluir: ${t.title}` };
    }
    case "create_task": {
      const content = String(a.content || "").trim();
      if (!content) return { ok: false, error: "tarefa sem texto" };
      if (a.due_date && !DATE_RE.test(a.due_date)) return { ok: false, error: "due_date invalida" };
      return {
        ok: true,
        type,
        params: { content, due_date: a.due_date || null },
        summary: `Criar tarefa no Todoist: ${content}${a.due_date ? ` (${a.due_date})` : ""}`,
      };
    }
    case "reschedule_task": {
      const t = task(a.task_id);
      if (!t) return { ok: false, error: `tarefa ${a.task_id} nao existe no snapshot` };
      if (t.source !== "todoist") return { ok: false, error: "so tarefas do Todoist podem ser reagendadas" };
      if (t.recurring) return { ok: false, error: "tarefa recorrente — reagendar apagava a repeticao" };
      if (!DATE_RE.test(a.due_date || "")) return { ok: false, error: "due_date invalida" };
      return { ok: true, type, params: { task_id: t.id, due_date: a.due_date }, summary: `Reagendar "${t.title}" para ${a.due_date}` };
    }
    case "schedule_event": {
      const start = new Date(a.start);
      const end = new Date(a.end);
      const summary = String(a.summary || "").trim();
      if (!summary || isNaN(start.getTime()) || isNaN(end.getTime()) || end <= start) {
        return { ok: false, error: "evento invalido" };
      }
      const when = start.toLocaleString("pt-PT", {
        timeZone: "Europe/Lisbon",
        day: "2-digit",
        month: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      });
      return {
        ok: true,
        type,
        params: {
          summary,
          start: start.toISOString(),
          end: end.toISOString(),
          reminder_minutes: Number(a.reminder_minutes) > 0 ? Number(a.reminder_minutes) : 30,
        },
        summary: `Agendar "${summary}" — ${when}`,
      };
    }
    case "remember": {
      const kinds = ["fato", "preferencia", "objetivo", "padrao"];
      const content = String(a.content || "").trim().slice(0, 300);
      if (!content || !kinds.includes(a.kind)) return { ok: false, error: "memoria invalida" };
      const norm = content.toLowerCase();
      if ((ctx.memoryContents || []).some((m) => m.toLowerCase() === norm)) return { ok: false, error: "ja lembrado" };
      const importance = Math.min(5, Math.max(1, Math.round(Number(a.importance) || 3)));
      return {
        ok: true,
        type,
        params: { kind: a.kind, content, area: a.area ? String(a.area) : null, importance },
        summary: `Lembrar (${a.kind}): ${content}`,
      };
    }
    case "forget": {
      if (!ctx.memoryIds?.has(a.memory_id)) return { ok: false, error: "memoria nao existe" };
      return { ok: true, type, params: { memory_id: a.memory_id }, summary: "Esquecer uma memória" };
    }
    case "set_owner": {
      const t = task(a.task_id);
      if (!t) return { ok: false, error: `tarefa ${a.task_id} nao existe no snapshot` };
      if (a.owner !== "eu" && a.owner !== "holiday") return { ok: false, error: "owner invalido" };
      const lists = ["proxima", "agendada", "aguardando", "algum_dia"];
      const list = lists.includes(a.list) ? a.list : null;
      return {
        ok: true,
        type,
        params: { task_id: t.id, owner: a.owner, list },
        summary: `${a.owner === "holiday" ? "Holiday assume" : "Fica contigo"}: ${t.title}${list ? ` (${list.replace("_", " ")})` : ""}`,
      };
    }
    case "save_task_note": {
      const t = task(a.task_id);
      if (!t) return { ok: false, error: `tarefa ${a.task_id} nao existe no snapshot` };
      const note = String(a.note || "").trim().slice(0, 2000);
      if (!note) return { ok: false, error: "nota vazia" };
      return { ok: true, type, params: { task_id: t.id, note }, summary: `Trabalho registado em: ${t.title}` };
    }
  }
}

// Chave para comparar acoes (mesmo tipo + mesmos parametros).
export function actionKey(type: string, params: Record<string, any>): string {
  return `${type}:${JSON.stringify(params, Object.keys(params).sort())}`;
}

export async function executeAction(
  sb: SupabaseClient,
  type: ActionType,
  params: Record<string, any>,
  today: string
): Promise<{ ok: boolean; result: string }> {
  const userId = process.env.SYNC_USER_ID;
  switch (type) {
    case "register_meal": {
      if (!userId) return { ok: false, result: "SYNC_USER_ID nao configurado" };
      const { error } = await sb.from("nutrition_logs").insert({
        user_id: userId,
        label: params.label,
        kcal: params.kcal,
        type: params.type,
        source: params.type === "out" ? "treino" : "manual",
      });
      return error ? { ok: false, result: error.message } : { ok: true, result: "registado" };
    }
    case "log_weight": {
      if (!userId) return { ok: false, result: "SYNC_USER_ID nao configurado" };
      const { error } = await sb
        .from("body_composition")
        .upsert({ user_id: userId, date: today, weight_kg: params.weight_kg }, { onConflict: "user_id,date" });
      return error ? { ok: false, result: error.message } : { ok: true, result: "registado" };
    }
    case "complete_task": {
      const r = await completeTask(sb, params.task_id);
      if (!r.ok) return { ok: false, result: r.error || "falhou" };
      return r.remote_synced
        ? { ok: true, result: "concluída na origem" }
        : { ok: true, result: `concluída na app, mas não na origem: ${r.remote_error}` };
    }
    case "create_task": {
      const r = await createTodoistTask(params.content, params.due_date);
      return r.ok ? { ok: true, result: `criada no Todoist (id ${r.id})` } : { ok: false, result: r.error || "falhou" };
    }
    case "reschedule_task": {
      const r = await rescheduleTodoistTask(params.task_id, params.due_date);
      if (!r.ok) return { ok: false, result: r.error || "falhou" };
      await sb.from("tasks_cache").update({ due: params.due_date }).eq("id", params.task_id);
      return { ok: true, result: `nova data ${params.due_date}` };
    }
    case "schedule_event": {
      const r = await addCalendarEvent(params.summary, params.start, params.end, params.reminder_minutes);
      return r.ok ? { ok: true, result: "evento criado no Google Calendar" } : { ok: false, result: r.error || "falhou" };
    }
    case "remember": {
      const { error } = await sb.from("holiday_memories").insert({
        kind: params.kind,
        content: params.content,
        area: params.area,
        importance: params.importance,
        source: params.kind === "padrao" ? "correlacao" : "conversa",
      });
      return error ? { ok: false, result: error.message } : { ok: true, result: "guardado na memória" };
    }
    case "forget": {
      const { error } = await sb.from("holiday_memories").update({ active: false }).eq("id", params.memory_id);
      return error ? { ok: false, result: error.message } : { ok: true, result: "esquecido" };
    }
    case "set_owner": {
      const { error } = await sb
        .from("tasks_cache")
        .update({ gtd_owner: params.owner, gtd_list: params.list })
        .eq("id", params.task_id);
      return error ? { ok: false, result: error.message } : { ok: true, result: "atualizado" };
    }
    case "save_task_note": {
      const { data: cur } = await sb.from("tasks_cache").select("gtd_note").eq("id", params.task_id).maybeSingle();
      const stamp = new Date(today + "T12:00:00Z").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
      const note = `${cur?.gtd_note ? cur.gtd_note + "\n" : ""}[${stamp}] ${params.note}`.slice(-4000);
      const { error } = await sb.from("tasks_cache").update({ gtd_note: note }).eq("id", params.task_id);
      return error ? { ok: false, result: error.message } : { ok: true, result: "nota guardada" };
    }
  }
}
