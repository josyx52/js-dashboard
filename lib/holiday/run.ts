import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSnapshot } from "./snapshot";
import { detectSignals, groupProblems, type Problem } from "./engines";
import { reason, type HistoryItem, type PastAction } from "./reasoning";
import { ACTIONS, actionKey, executeAction, validateProposal, type ActionType } from "./actions";
import { loadMemory, recordDaily } from "./memory";
import { analyzeMealPhoto, insertPhotoMeal } from "@/lib/nutrition";

// Orquestrador do ciclo completo do Holiday:
// snapshot -> regras -> problemas -> memoria (curto/longo/correlacao)
// -> raciocinio (IA) -> acoes -> memoria.

export interface HolidayAction {
  id: string;
  type: string;
  summary: string | null;
  risk: "low" | "high";
  status: "proposed" | "executed" | "rejected" | "failed";
  reason: string | null;
  result: string | null;
  message_id: string | null;
  created_at: string;
}

export interface HolidayMessage {
  id: string;
  role: "user" | "assistant" | "briefing";
  content: string;
  created_at: string;
  problems?: Problem[] | null;
}

const BRIEFING_PROMPT =
  "Faz o briefing de hoje: o que tenho para hoje, o mais importante e o que esta a falhar (causa provavel, " +
  "usa a correlacao e a persistencia). Se ha tarefas delegadas a ti sem trabalho, adianta uma. Se ha tarefas " +
  "por esclarecer, pergunta sobre as 2 mais importantes. Se a correlacao mostra um padrao estavel novo, guarda-o. " +
  "No maximo 6 linhas.";

const SELECT_ACTION = "id, type, summary, risk, status, reason, result, message_id, created_at";

// Ciclo de fundo (cron de hora a hora): atualiza o historico diario usado
// pela correlacao. Nao chama a IA.
export async function cycle(sb: SupabaseClient) {
  const snapshot = await buildSnapshot(sb);
  const signals = detectSignals(snapshot);
  await recordDaily(sb, snapshot, signals);
  return { snapshot, signals };
}

export async function think(
  sb: SupabaseClient,
  opts: { kind: "chat"; message: string; imageBase64?: string; voice?: boolean } | { kind: "briefing" }
): Promise<{ message: HolidayMessage; actions: HolidayAction[]; problems: Problem[]; userMessage?: HolidayMessage }> {
  const userId = process.env.SYNC_USER_ID;

  // Foto de refeicao no chat (a antiga "calculadora"): analisa e regista
  // antes de pensar, para o raciocinio ja contar com ela.
  let photoNote: string | null = null;
  let photoAction: { summary: string; result: string; ok: boolean; params: Record<string, any> } | null = null;
  if (opts.kind === "chat" && opts.imageBase64) {
    try {
      if (!userId) throw new Error("SYNC_USER_ID nao configurado");
      const est = await analyzeMealPhoto(opts.imageBase64);
      const { error } = await insertPhotoMeal(sb, userId, est);
      if (error) throw new Error(error.message);
      const macros = [est.protein_g, est.carbs_g, est.fat_g].every((x) => x !== null)
        ? ` · P ${est.protein_g}g C ${est.carbs_g}g G ${est.fat_g}g`
        : "";
      photoNote = `[foto analisada e registada: ${est.label}, ${est.kcal} kcal${macros}]`;
      photoAction = {
        ok: true,
        summary: `Registar refeição (foto): ${est.label} (${est.kcal} kcal)`,
        result: `registado${macros}`,
        params: { label: est.label, kcal: est.kcal, type: "in", source: "foto" },
      };
    } catch (e: any) {
      photoNote = `[a foto nao foi analisada: ${e?.message || e}]`;
      photoAction = { ok: false, summary: "Analisar foto da refeição", result: e?.message || String(e), params: {} };
    }
  }

  const voice = opts.kind === "chat" && !!opts.voice;
  const snapshot = await buildSnapshot(sb, new Date(), { skipRemote: voice });
  const signals = detectSignals(snapshot);
  const problems = groupProblems(signals);
  // Na conversa por voz o historico diario fica para o cron (sem passos remotos).
  if (!voice) await recordDaily(sb, snapshot, signals);

  const [{ data: hist }, { data: recent }, memory] = await Promise.all([
    sb.from("holiday_messages").select("role, content").order("created_at", { ascending: false }).limit(12),
    sb.from("holiday_actions").select("type, params, summary, status, result, created_at").order("created_at", { ascending: false }).limit(15),
    loadMemory(sb, snapshot, signals),
  ]);
  const history = ((hist || []) as HistoryItem[]).reverse();
  const recentActions = (recent || []) as (PastAction & { params: Record<string, any>; created_at: string })[];

  let userMessage: HolidayMessage | undefined;
  let userText = "";
  if (opts.kind === "chat") {
    userText = [opts.imageBase64 ? "📷" : "", opts.message].filter(Boolean).join(" ").trim() || "📷";
    const { data } = await sb
      .from("holiday_messages")
      .insert({ role: "user", content: userText })
      .select("id, role, content, created_at")
      .single();
    userMessage = (data as HolidayMessage) || undefined;
  }

  const r = await reason({
    snapshot,
    problems,
    history,
    recentActions,
    memory,
    voice,
    userMessage:
      opts.kind === "chat"
        ? [opts.message || (opts.imageBase64 ? "Enviei a foto de uma refeição." : ""), photoNote].filter(Boolean).join("\n")
        : BRIEFING_PROMPT,
  });

  const { data: msg, error: msgErr } = await sb
    .from("holiday_messages")
    .insert({
      role: opts.kind === "chat" ? "assistant" : "briefing",
      content: r.reply,
      problems,
      briefing_date: opts.kind === "briefing" ? snapshot.today : null,
    })
    .select("id, role, content, created_at, problems")
    .single();
  if (msgErr || !msg) throw new Error(msgErr?.message || "nao gravou a mensagem");

  const actions: HolidayAction[] = [];

  if (photoAction) {
    const { data: row } = await sb
      .from("holiday_actions")
      .insert({
        message_id: msg.id,
        type: "register_meal",
        params: photoAction.params,
        risk: "low",
        status: photoAction.ok ? "executed" : "failed",
        summary: photoAction.summary,
        result: photoAction.result,
        decided_at: new Date().toISOString(),
      })
      .select(SELECT_ACTION)
      .single();
    if (row) actions.push(row as HolidayAction);
  }

  // Acoes que falharam nas ultimas 24h ou ja estao a espera — nao repetir.
  const dayAgo = Date.now() - 24 * 3600000;
  const blocked = new Set(
    recentActions
      .filter((a) => a.status === "proposed" || (a.status === "failed" && new Date(a.created_at).getTime() > dayAgo))
      .map((a) => actionKey(a.type, a.params || {}))
  );
  const ctx = {
    memoryIds: new Set(memory.longTerm.map((x) => x.id)),
    memoryContents: memory.longTerm.map((x) => x.content),
  };

  for (const p of r.actions) {
    const v = validateProposal(p, snapshot, ctx);
    if (!v.ok) continue; // proposta invalida (id inventado, duplicada, etc.) — descartada
    // A foto ja registou a refeicao — nao registar outra vez a mesma.
    if (photoAction?.ok && v.type === "register_meal") continue;
    const key = actionKey(v.type, v.params);
    if (blocked.has(key)) continue;
    blocked.add(key);

    const risk = ACTIONS[v.type].risk;
    // No briefing so corre sozinho o que mexe na memoria/notas do proprio Holiday.
    const selfOnly = ["remember", "forget", "save_task_note"].includes(v.type);
    const autoRun = risk === "low" && (opts.kind === "chat" || selfOnly);
    const exec = autoRun ? await executeAction(sb, v.type as ActionType, v.params, snapshot.today) : null;

    const { data: row } = await sb
      .from("holiday_actions")
      .insert({
        message_id: msg.id,
        type: v.type,
        params: v.params,
        risk,
        status: exec ? (exec.ok ? "executed" : "failed") : "proposed",
        reason: p.reason || null,
        summary: v.summary,
        result: exec?.result ?? null,
        decided_at: exec ? new Date().toISOString() : null,
      })
      .select(SELECT_ACTION)
      .single();
    if (row) actions.push(row as HolidayAction);
  }

  // Problemas depois das acoes (ex: a refeicao registada tira o alerta).
  const after = actions.some((a) => a.status === "executed") && !voice
    ? groupProblems(detectSignals(await buildSnapshot(sb)))
    : problems;

  return { message: msg as HolidayMessage, actions, problems: after, userMessage };
}

// Aprovar/rejeitar um cartao de acao proposto.
export async function decideAction(
  sb: SupabaseClient,
  id: string,
  decision: "approve" | "reject"
): Promise<HolidayAction> {
  // Reserva o cartao (decided_at) antes de executar — dois cliques seguidos
  // nao executam a acao duas vezes.
  const { data: a, error } = await sb
    .from("holiday_actions")
    .update({ decided_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "proposed")
    .is("decided_at", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!a) throw new Error("acao nao encontrada ou ja decidida");

  let patch: Record<string, any>;
  if (decision === "reject") {
    patch = { status: "rejected" };
  } else {
    const snapshot = await buildSnapshot(sb);
    // Revalida: a tarefa pode ter sido concluida entretanto.
    const v = validateProposal({ type: a.type, params: a.params }, snapshot);
    const exec = v.ok
      ? await executeAction(sb, v.type, v.params, snapshot.today)
      : { ok: false, result: `ja nao e valida: ${v.error}` };
    patch = { status: exec.ok ? "executed" : "failed", result: exec.result };
  }

  const { data: updated, error: upErr } = await sb
    .from("holiday_actions")
    .update(patch)
    .eq("id", id)
    .select("id, type, summary, risk, status, reason, result, message_id, created_at")
    .single();
  if (upErr || !updated) throw new Error(upErr?.message || "acao ja decidida");
  return updated as HolidayAction;
}
