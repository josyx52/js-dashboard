import { ACTIONS, type Proposal } from "./actions";
import type { Problem } from "./engines";
import type { Snapshot } from "./snapshot";
import type { Memory } from "./memory";

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

export const SYSTEM = `Es o Holiday, o agente pessoal do Sistema JS do Josuel, organizado em 6 pilares
(Deus, Saude, Familia, Estudo, Negocio, Trabalho). Pensas como o Jarvis, em ciclo fechado:
detetar -> correlacionar -> raciocinar -> resolver.

MEMORIA (usa as tres camadas):
- CURTO PRAZO: a conversa recente, o que mudou desde a ultima conversa e as acoes de hoje. Nao repitas o que ja disseste.
- LONGO PRAZO: factos, preferencias, objetivos e padroes que guardaste. Usa-os para personalizar. Se algo
  contradiz uma memoria, confirma com o utilizador e atualiza (forget + remember).
  Guarda com "remember" so o que e duradouro (ex: "treina as tercas e quintas", "objetivo: CySA+ em dezembro").
  Nunca guardes coisas do dia (o que comeu hoje) nem dados sensiveis (passwords, chaves).
- CORRELACAO: linha de base, padroes e ha quantos dias cada problema persiste, calculados sobre o historico.
  Usa-os para encontrar a causa (ex: problema que persiste ha 20 dias = habito, nao acidente). Quando um padrao
  e estavel e util, guarda-o com remember kind="padrao".

GTD (es tu que aplicas o metodo, nao e um ecra):
- Cada tarefa tem dono: "eu" (o Josuel faz), "holiday" (delegada a ti) ou nenhum (por esclarecer).
- Esclarecer: para tarefas sem dono, decide/pergunta quem faz. Tu podes assumir tarefas de pensar/escrever/
  planear/pesquisar com o teu conhecimento (rascunhos, planos, listas, textos, tabelas). Tarefas fisicas,
  presenciais ou que exigem as contas dele ficam com "eu". Usa set_owner (e "list": proxima/agendada/aguardando/algum_dia).
- Tarefas "holiday": e trabalho TEU. Quando o utilizador pede ou num briefing, faz o trabalho na resposta e
  guarda o resultado/proximo passo com save_task_note. Quando estiver mesmo feito, propoe complete_task.
- Tarefas "eu": ajuda a priorizar e a definir a proxima acao concreta; nao as faças por ele.

Regras de raciocinio:
- Baseia-te SO no SNAPSHOT, PROBLEMAS e MEMORIA fornecidos. Nunca inventes tarefas, ids, numeros ou eventos.
- Procura a causa, nao so o sintoma. Prioriza o que e para hoje e o mais grave. No maximo 3 pontos.
- Sem dramatizar: factos, curto e direto, em portugues de Portugal. Trata o utilizador por tu.
- A resposta pode ser lida em voz alta: frases curtas, sem tabelas nem markdown pesado.

Regras de acao:
- So podes propor acoes do CATALOGO, com os parametros exatos e ids exatos.
- Acoes "low" sao executadas logo; as "high" ficam a espera de aprovacao. Diz o que fizeste e o que ficou para aprovar.
- No maximo 5 acoes por resposta. Se uma acao falhou antes (ACOES RECENTES), nao a repitas igual.
- Se o utilizador disser o que comeu/treinou/pesou, regista com register_meal/log_weight (estima as kcal e di-lo).

Responde APENAS com JSON valido neste formato:
{"analysis": "raciocinio causal curto (para log interno)", "reply": "resposta ao utilizador", "actions": [{"type": "...", "params": {...}, "reason": "porque"}]}`;

// Contexto compacto: o plano gratuito da Groq aceita ~8000 tokens/minuto
// (pedido + resposta). Vao em detalhe so as tarefas de hoje, as delegadas e
// as 12 atrasadas mais recentes; o resto vai em contagens por pilar.
const MAX_OVERDUE = 12;

function compactTask(t: Snapshot["tasks"][number]) {
  return {
    id: t.id,
    t: t.title.slice(0, 80),
    due: t.due || undefined,
    p: t.pillar || undefined,
    rec: t.recurring || undefined,
    dono: t.owner || undefined,
    lista: t.list || undefined,
    nota: t.owner === "holiday" && t.note ? t.note.slice(-160) : undefined,
  };
}

export function compactSnapshot(s: Snapshot) {
  const today = s.tasks.filter((t) => t.bucket === "today");
  const overdue = s.tasks
    .filter((t) => t.bucket === "overdue")
    .sort((a, b) => (b.due || "").localeCompare(a.due || ""));
  const holiday = s.tasks.filter((t) => t.owner === "holiday" && t.bucket !== "today");
  const undated = s.tasks.filter((t) => t.bucket === "undated" && t.owner !== "holiday");
  const overdueRest: Record<string, number> = {};
  for (const t of overdue.slice(MAX_OVERDUE)) overdueRest[t.pillar || "?"] = (overdueRest[t.pillar || "?"] || 0) + 1;

  return {
    agora: `${s.today} ${String(s.hour).padStart(2, "0")}h Lisboa`,
    hoje: today.map(compactTask),
    atrasadas: overdue.slice(0, MAX_OVERDUE).map(compactTask),
    atrasadas_restantes_por_pilar: Object.keys(overdueRest).length ? overdueRest : undefined,
    delegadas_ao_holiday: holiday.length ? holiday.map(compactTask) : undefined,
    sem_data: undated.slice(0, 10).map(compactTask),
    futuras: s.tasks.filter((t) => t.bucket === "future").length,
    refeicoes_hoje: s.meals.map((m) => `${m.type === "out" ? "treino " : ""}${m.label} ${m.kcal}kcal`),
    peso: s.body ? `${s.body.weight_kg}kg em ${s.body.date}` : null,
    perfil: s.profile,
    passos: s.steps,
    ultimo_sync: s.lastSyncAt,
  };
}

export function problemsText(problems: Problem[]): string {
  if (problems.length === 0) return "(nenhum)";
  return problems
    .map(
      (p) =>
        `[${AREA_LABEL[p.area]} · ${p.severity}] ` +
        p.signals.map((s) => s.title + (s.detail ? ` — ${s.detail.slice(0, 120)}` : "")).join(" | ")
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
  memory: Memory;
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

  const m = input.memory;
  const longTerm = m.longTerm.length
    ? m.longTerm.map((x) => `- [${x.id}] (${x.kind}${x.area ? ", " + x.area : ""}, imp ${x.importance}) ${x.content}`).join("\n")
    : "(vazia)";
  const persist = Object.entries(m.correlation.persistence)
    .filter(([, d]) => d > 1)
    .map(([id, d]) => `${id}: ha ${d} dias seguidos`)
    .join("; ");
  const correlation =
    `historico: ${m.correlation.days} dias · linha de base: ${JSON.stringify(m.correlation.baseline)}\n` +
    (m.correlation.insights.length ? m.correlation.insights.map((i) => `- ${i}`).join("\n") + "\n" : "") +
    `persistencia: ${persist || "(nada persiste)"}`;
  const shortTerm =
    `${m.shortTerm.sinceLastTalk || "primeira conversa"}\n` +
    (m.shortTerm.todayActions.length
      ? "acoes de hoje: " + m.shortTerm.todayActions.map((a) => `${a.summary} [${a.status}]`).join("; ")
      : "acoes de hoje: nenhuma");

  const context =
    `SNAPSHOT:\n${JSON.stringify(compactSnapshot(input.snapshot))}\n\n` +
    `PROBLEMAS (detetados por regras):\n${problemsText(input.problems)}\n\n` +
    `MEMORIA CURTO PRAZO:\n${shortTerm}\n\n` +
    `MEMORIA LONGO PRAZO:\n${longTerm}\n\n` +
    `CORRELACAO:\n${correlation}\n\n` +
    `CATALOGO DE ACOES:\n${catalog}\n\n` +
    `ACOES RECENTES:\n${recent}`;

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "system", content: context },
    ...input.history.slice(-8).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.content.slice(0, 600),
    })),
    { role: "user", content: input.userMessage },
  ];

  const call = () =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: MODEL,
        messages,
        temperature: 0.2,
        reasoning_effort: "low",
        max_completion_tokens: 1200,
        response_format: { type: "json_object" },
      }),
    });

  try {
    let r = await call();
    // Limite por minuto: a Groq diz quanto esperar — espera (ate 12s) e tenta uma vez.
    if (r.status === 429) {
      const wait = Math.min(12, Number(r.headers.get("retry-after")) || 6);
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await call();
    }
    const j: any = await r.json();
    if (r.status === 429) throw new Error("limite de pedidos da Groq por minuto — tenta daqui a pouco");
    if (!r.ok) throw new Error(`Groq HTTP ${r.status}: ${String(j?.error?.message || "").slice(0, 160)}`.trim());

    let txt: string = j.choices?.[0]?.message?.content?.trim() || "{}";
    txt = txt.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(txt);
    if (typeof parsed.reply !== "string" || !parsed.reply.trim()) throw new Error("resposta sem 'reply'");

    failures = 0;
    return {
      analysis: String(parsed.analysis || ""),
      reply: parsed.reply.trim(),
      actions: Array.isArray(parsed.actions) ? parsed.actions.slice(0, 5) : [],
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
