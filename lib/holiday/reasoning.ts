import { ACTIONS, type Proposal } from "./actions";
import type { Problem } from "./engines";
import type { Snapshot } from "./snapshot";

// Etapa 4 do ciclo (ReasoningEngine do Jarvis): a IA recebe o snapshot, os
// problemas ja detetados pelas regras e o historico, e devolve JSON com
// analise causal, resposta e acoes propostas. Com circuit breaker: 3 falhas
// seguidas desligam a IA durante 30s; nesse tempo responde-se so com as regras.

const MODEL = "openai/gpt-oss-120b";
const COOLDOWN_MS = 30_000;
const MAX_FAILURES = 3;

let failures = 0;
let disabledUntil = 0;

export interface Reasoning {
  analysis: string;
  reply: string;
  actions: Proposal[];
}

export interface HistoryItem {
  role: "user" | "assistant" | "briefing";
  content: string;
}

export interface PastAction {
  type: string;
  summary: string | null;
  status: string;
  result: string | null;
}

const AREA_LABEL: Record<string, string> = {
  deus: "Deus",
  saude: "Saúde",
  familia: "Família",
  estudo: "Estudo",
  negocio: "Negócio",
  trabalho: "Trabalho",
  sistema: "Sistema",
};

const SYSTEM = `Es o Holiday, o agente pessoal do Sistema JS do Josuel, organizado em 6 pilares
(Deus, Saude, Familia, Estudo, Negocio, Trabalho). Pensas como o Jarvis, em ciclo fechado:
detetar -> correlacionar -> raciocinar -> resolver.

Regras de raciocinio:
- Baseia-te SO no SNAPSHOT e nos PROBLEMAS fornecidos. Nunca inventes tarefas, ids, numeros ou eventos.
- Procura a causa, nao so o sintoma (ex: rotina atrasada ha meses = provavelmente nao esta a ser marcada, nao que falhou todos os dias).
- Prioriza: o que e para hoje e o mais grave primeiro. No maximo 3 pontos.
- Sem dramatizar: factos, curto e direto, em portugues de Portugal. Trata o utilizador por tu.
- Se nao tens dados para responder, diz o que falta.

Regras de acao:
- So podes propor acoes do CATALOGO, com os parametros exatos. Para tarefas usa o "id" exato do snapshot.
- Acoes de risco "low" sao executadas logo; as de risco "high" ficam a espera de aprovacao do utilizador.
  Diz na resposta o que fizeste e o que deixaste para aprovar.
- Propoe acoes so quando o utilizador pede ou quando claramente ajudam. Nunca mais de 3 por resposta.
- Se uma acao falhou antes (ver ACOES RECENTES), nao a repitas igual: muda de estrategia ou explica o bloqueio.
- Se o utilizador disser o que comeu/treinou/pesou, regista com register_meal/log_weight (estima as kcal se ele nao disser e di-lo).

Responde APENAS com JSON valido neste formato:
{"analysis": "raciocinio causal curto (para log interno)", "reply": "resposta ao utilizador", "actions": [{"type": "...", "params": {...}, "reason": "porque"}]}`;

function compactSnapshot(s: Snapshot) {
  const tasks = s.tasks
    .filter((t) => t.bucket !== "future")
    .slice(0, 60)
    .map((t) => ({
      id: t.id,
      t: t.title,
      due: t.due,
      pilar: t.pillar,
      estado: t.bucket,
      rec: t.recurring || undefined,
      fonte: t.source,
    }));
  return {
    agora: `${s.today} ${String(s.hour).padStart(2, "0")}h (Lisboa)`,
    tarefas: tasks,
    tarefas_futuras: s.tasks.filter((t) => t.bucket === "future").length,
    refeicoes_hoje: s.meals,
    peso: s.body,
    perfil: s.profile,
    passos_hoje: s.steps,
    ultimo_sync: s.lastSyncAt,
  };
}

export function problemsText(problems: Problem[]): string {
  if (problems.length === 0) return "(nenhum)";
  return problems
    .map(
      (p) =>
        `[${AREA_LABEL[p.area]} · ${p.severity}] ` +
        p.signals.map((s) => s.title + (s.detail ? ` — ${s.detail}` : "")).join(" | ")
    )
    .join("\n");
}

// Resposta sem IA (circuit breaker aberto ou erro): so os problemas das regras.
export function fallbackReply(problems: Problem[], why: string): Reasoning {
  const top = problems.slice(0, 3).map((p) => `• ${AREA_LABEL[p.area]}: ${p.signals[0].title}`);
  return {
    analysis: `fallback: ${why}`,
    reply:
      `Não consegui raciocinar agora (${why}). O que as regras detetam:\n` +
      (top.length ? top.join("\n") : "• nada de relevante neste momento."),
    actions: [],
  };
}

export async function reason(input: {
  snapshot: Snapshot;
  problems: Problem[];
  history: HistoryItem[];
  recentActions: PastAction[];
  userMessage: string;
}): Promise<Reasoning> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return fallbackReply(input.problems, "GROQ_API_KEY não configurado");
  if (Date.now() < disabledUntil) return fallbackReply(input.problems, "IA em pausa após falhas seguidas");

  const catalog = Object.entries(ACTIONS)
    .map(([type, spec]) => `- ${type} (risco ${spec.risk}): ${spec.params}`)
    .join("\n");
  const recent = input.recentActions.length
    ? input.recentActions.map((a) => `- ${a.summary || a.type}: ${a.status}${a.result ? ` (${a.result})` : ""}`).join("\n")
    : "(nenhuma)";

  const context =
    `SNAPSHOT:\n${JSON.stringify(compactSnapshot(input.snapshot))}\n\n` +
    `PROBLEMAS (detetados por regras):\n${problemsText(input.problems)}\n\n` +
    `CATALOGO DE ACOES:\n${catalog}\n\n` +
    `ACOES RECENTES:\n${recent}`;

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "system", content: context },
    ...input.history.slice(-12).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.content,
    })),
    { role: "user", content: input.userMessage },
  ];

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    });
    const j: any = await r.json();
    if (!r.ok) throw new Error(`Groq HTTP ${r.status}: ${j?.error?.message || ""}`.trim());

    let txt: string = j.choices?.[0]?.message?.content?.trim() || "{}";
    txt = txt.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(txt);
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) throw new Error("resposta sem 'reply'");

    failures = 0;
    return {
      analysis: String(parsed.analysis || ""),
      reply: parsed.reply.trim(),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 3) : [],
    };
  } catch (e: any) {
    failures += 1;
    if (failures >= MAX_FAILURES) {
      disabledUntil = Date.now() + COOLDOWN_MS;
      failures = 0;
    }
    return fallbackReply(input.problems, e?.message || String(e));
  }
}
