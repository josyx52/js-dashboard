import type { SupabaseClient } from "@supabase/supabase-js";
import { buildSnapshot } from "./snapshot";
import { detectSignals, groupProblems, type Problem } from "./engines";
import { reason, type HistoryItem, type PastAction } from "./reasoning";
import { ACTIONS, actionKey, executeAction, validateProposal, type ActionType } from "./actions";

// Orquestrador do ciclo completo do Holiday:
// snapshot -> regras -> problemas -> raciocinio (IA) -> acoes -> memoria.

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
  "Faz o briefing de hoje: o que tenho para hoje, o mais importante e o que esta a falhar " +
  "(causa provavel), em no maximo 5 linhas. Propoe acoes so se forem claramente uteis.";

export async function think(
  sb: SupabaseClient,
  opts: { kind: "chat"; message: string } | { kind: "briefing" }
): Promise<{ message: HolidayMessage; actions: HolidayAction[]; problems: Problem[] }> {
  const snapshot = await buildSnapshot(sb);
  const problems = groupProblems(detectSignals(snapshot));

  const [{ data: hist }, { data: recent }] = await Promise.all([
    sb.from("holiday_messages").select("role, content").order("created_at", { ascending: false }).limit(12),
    sb
      .from("holiday_actions")
      .select("type, params, summary, status, result, created_at")
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  const history = ((hist || []) as HistoryItem[]).reverse();
  const recentActions = (recent || []) as (PastAction & { params: Record<string, any>; created_at: string })[];

  if (opts.kind === "chat") {
    await sb.from("holiday_messages").insert({ role: "user", content: opts.message });
  }

  const r = await reason({
    snapshot,
    problems,
    history,
    recentActions,
    userMessage: opts.kind === "chat" ? opts.message : BRIEFING_PROMPT,
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

  // Acoes que falharam nas ultimas 24h ou ja estao a espera — nao repetir.
  const dayAgo = Date.now() - 24 * 3600000;
  const blocked = new Set(
    recentActions
      .filter((a) => a.status === "proposed" || (a.status === "failed" && new Date(a.created_at).getTime() > dayAgo))
      .map((a) => actionKey(a.type, a.params || {}))
  );

  const actions: HolidayAction[] = [];
  for (const p of r.actions) {
    const v = validateProposal(p, snapshot);
    if (!v.ok) continue; // proposta invalida (id inventado, etc.) — descartada
    const key = actionKey(v.type, v.params);
    if (blocked.has(key)) continue;
    blocked.add(key);

    const risk = ACTIONS[v.type].risk;
    // No briefing nada corre sozinho: o utilizador ainda nao disse nada.
    const autoRun = risk === "low" && opts.kind === "chat";
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
      .select("id, type, summary, risk, status, reason, result, message_id, created_at")
      .single();
    if (row) actions.push(row as HolidayAction);
  }

  return { message: msg as HolidayMessage, actions, problems };
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
