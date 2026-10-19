import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSnapshot } from "./snapshot";
import { detectSignals, groupProblems, type Problem } from "./engines";
import { reason, type HistoryItem, type PastAction } from "./reasoning";
import { ACTIONS, READ_ACTIONS, actionKey, executeAction, validateProposal, type ActionType } from "./actions";
import { notionToken } from "@/lib/connectors";
import { loadMemory, recordDaily } from "./memory";
import { analyzeMealPhoto, insertPhotoMeal } from "@/lib/nutrition";
import { KIND_LABEL, type Automation } from "./automations";

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
  opts:
    | { kind: "chat"; message: string; imageBase64?: string; voice?: boolean }
    | { kind: "briefing" }
    | { kind: "automation"; automation: Automation }
): Promise<{ message: HolidayMessage; actions: HolidayAction[]; problems: Problem[]; userMessage?: HolidayMessage; ignored?: boolean }> {
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
    sb.from("holiday_actions").select("id, type, params, summary, status, result, created_at, decided_at").order("created_at", { ascending: false }).limit(15),
    loadMemory(sb, snapshot, signals),
  ]);
  const history = ((hist || []) as HistoryItem[]).reverse();
  const recentActions = (recent || []) as (PastAction & {
    id: string;
    params: Record<string, any>;
    created_at: string;
    decided_at: string | null;
  })[];
  // Cartoes ainda por decidir (ultimas 2h) — o Holiday ve-os e pode aprova-los por voz.
  const pending = recentActions.filter(
    (a) => a.status === "proposed" && !a.decided_at && Date.now() - new Date(a.created_at).getTime() < 2 * 3600000
  );

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

  const notion = await notionToken(sb).catch(() => ({ token: null, integrationId: null, config: {} as any }));
  const { data: notionRow } = notion.integrationId
    ? await sb.from("integrations").select("connected").eq("id", notion.integrationId).maybeSingle()
    : { data: null };
  const notionCtx = {
    connected: !!notion.token && !!notionRow?.connected,
    parentId: notion.config?.parent_id || null,
    parentTitle: notion.config?.parent_title || null,
  };
  const integrationsText = notionCtx.connected
    ? `Notion ligado${notionCtx.parentTitle ? ` — paginas novas vao para “${notionCtx.parentTitle}”` : " — sem pagina de destino definida (so pesquisa, ou usa parent_id de um resultado)"}`
    : "Notion nao ligado";

  const reasonInput = {
    snapshot,
    problems,
    history,
    recentActions,
    memory,
    voice,
    userMessage:
      opts.kind === "chat"
        ? [opts.message || (opts.imageBase64 ? "Enviei a foto de uma refeição." : ""), photoNote].filter(Boolean).join("\n")
        : opts.kind === "automation"
        ? `AUTOMACAO AGENDADA (${KIND_LABEL[opts.automation.kind]}) "${opts.automation.name}": ${opts.automation.prompt}\n` +
          "Faz isto agora e deixa no chat o resultado para o Josuel ler, curto. Se for trabalho numa tarefa, guarda-o com save_task_note."
        : BRIEFING_PROMPT,
    integrations: integrationsText,
  };
  (reasonInput as any).pending = pending.map((a) => `[${a.id}] ${a.summary}`).join("\n");
  let r = await reason(reasonInput);

  // Voz: a frase nao era para o Holiday (TV, outra pessoa) — apaga e fica calado.
  if (r.ignore && opts.kind === "chat" && opts.voice && !opts.imageBase64) {
    if (userMessage) await sb.from("holiday_messages").delete().eq("id", userMessage.id);
    return { message: null, actions: [], problems, userMessage: undefined, ignored: true } as any;
  }

  // Ciclo de ferramentas (1 volta): acoes so de leitura correm ja e o
  // resultado volta ao raciocinio, para a resposta final ja as usar.
  const readCtx = { notion: notionCtx };
  const reads = r.actions
    .filter((p) => READ_ACTIONS.includes(p.type as ActionType))
    .map((p) => validateProposal(p, snapshot, readCtx))
    .filter((v) => v.ok)
    .slice(0, 2) as { ok: true; type: ActionType; params: Record<string, any>; summary: string }[];
  const readLog: { summary: string; ok: boolean; result: string; type: ActionType; params: Record<string, any> }[] = [];
  if (reads.length) {
    for (const v of reads) {
      const exec = await executeAction(sb, v.type, v.params, snapshot.today);
      readLog.push({ summary: v.summary, ok: exec.ok, result: exec.result, type: v.type, params: v.params });
    }
    r = await reason({
      ...reasonInput,
      toolResults: readLog.map((x) => `${x.summary}:\n${x.result}`).join("\n\n"),
    });
  }
  r = { ...r, actions: r.actions.filter((p) => !READ_ACTIONS.includes(p.type as ActionType)) };

  const { data: msg, error: msgErr } = await sb
    .from("holiday_messages")
    .insert({
      role: opts.kind === "chat" ? "assistant" : "briefing",
      content: r.reply,
      problems,
      briefing_date: opts.kind === "briefing" ? snapshot.today : null,
      automation_id: opts.kind === "automation" ? opts.automation.id : null,
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
    automations: memory.automations.map((x) => ({ id: x.id, name: x.name })),
    notion: notionCtx,
  };

  // Regista as leituras feitas (pesquisas no Notion) como acoes executadas.
  for (const x of readLog) {
    const { data: row } = await sb
      .from("holiday_actions")
      .insert({
        message_id: msg.id,
        type: x.type,
        params: x.params,
        risk: "low",
        status: x.ok ? "executed" : "failed",
        summary: x.summary,
        result: x.result.slice(0, 1000),
        decided_at: new Date().toISOString(),
      })
      .select(SELECT_ACTION)
      .single();
    if (row) actions.push(row as HolidayAction);
  }

  // Aprovar/rejeitar por voz ou texto: so com confirmacao explicita na frase.
  const said = opts.kind === "chat" ? opts.message.toLowerCase() : "";
  const confirms = /\b(sim|aprova|aprovo|aprovado|pode|podes|confirmo|confirma|faz isso|avan[çc]a|ok|claro)\b/.test(said);
  const denies = /\b(n[aã]o|cancela|rejeita|deixa estar|esquece)\b/.test(said);
  for (const p of r.actions.filter((x) => x.type === "approve_pending" || x.type === "reject_pending")) {
    const approve = p.type === "approve_pending";
    if (approve ? !confirms || denies : !denies) continue;
    const ids: string[] = Array.isArray(p.params?.action_ids) && p.params.action_ids.length ? p.params.action_ids : pending.map((x) => x.id);
    for (const id of ids.filter((i) => pending.some((x) => x.id === i))) {
      try {
        const done = await decideAction(sb, id, approve ? "approve" : "reject");
        actions.push({ ...done, message_id: msg.id } as HolidayAction);
      } catch {
        // ja decidida noutro sitio
      }
    }
  }
  r = { ...r, actions: r.actions.filter((x) => x.type !== "approve_pending" && x.type !== "reject_pending") };

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
    const selfOnly = ["remember", "forget", "save_task_note", "create_automation", "set_automation"].includes(v.type);
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

  return { message: msg as HolidayMessage, actions, problems: after, userMessage, ignored: false };
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
