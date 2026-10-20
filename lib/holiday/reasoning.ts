import { ACTIONS, type Proposal } from "./actions";
import type { Problem } from "./engines";
import type { Snapshot } from "./snapshot";
import type { Memory } from "./memory";

// Etapa 4 do ciclo (ReasoningEngine do Jarvis): a IA recebe o snapshot, os
// problemas ja detetados pelas regras e o historico, e devolve JSON com
// analise causal, resposta e acoes propostas. Com circuit breaker: 3 falhas
// seguidas desligam a IA durante 30s; nesse tempo responde-se so com as regras.

const MODEL = "openai/gpt-oss-120b";
// Cada modelo da Groq tem o seu limite por minuto (plano gratuito): quando o
// principal esta no limite, a resposta sai de um destes em vez de esperar.
const FALLBACK_MODELS = ["meta-llama/llama-4-scout-17b-16e-instruct", "llama-3.3-70b-versatile"];
const COOLDOWN_MS = 30_000;
const MAX_FAILURES = 3;

let failures = 0;
let disabledUntil = 0;

export interface Reasoning {
  analysis: string;
  reply: string;
  actions: Proposal[];
  ignore?: boolean; // voz: a frase nao era para o Holiday (TV, outras pessoas, ruido)
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

INTEGRACOES: se o Notion estiver ligado, podes pesquisar (notion_search; o resultado volta-te logo) e criar
paginas com o teu trabalho (notion_create_page, pede aprovacao). Usa-o quando ele pedir algo do Notion ou quando
um trabalho teu (plano, lista, rascunho) fica melhor guardado numa pagina.

LEMBRETES E AGENDA (como o Jarvis): o Josuel usa o Google Calendar. Quando ele pedir para o lembrares de algo
("lembra-me de...", "avisa-me...", "marca/agenda...", "poe na agenda"), cria um evento com schedule_event — o telemovel
dele notifica-o. Lembrete pontual: start = dia/hora pedidos (sem hora: pergunta, ou 09:00 se ele disser so o dia),
reminder_minutes 0. Repetido ("todas as segundas as 9h", "todos os dias as 21h"): o mesmo evento com recurrence
(RRULE). Um pedido explicito destes e executado logo — confirma em 1 frase o que criaste e quando.
NUNCA uses create_automation para lembretes dele, a nao ser que ele peca expressamente "aqui na app/no chat".

AUTOMACOES: trabalho que TU fazes sozinho, agendado (analise = pensas e respondes; trabalho = trabalhas numa
tarefa delegada; lembrete = mensagem no chat, so se ele pedir no chat). Cria com create_automation (days:
0=domingo..6=sabado; time HH:MM em passos de 15 min). Para pausar/retomar usa set_automation. Nao dupliques
automacoes que ja existem.
Como no Jarvis, tambem podem disparar POR EVENTO (trigger "evento"): quando as regras detetam uma situacao
("quando eu nao registar refeicoes", "se o sync parar", "quando houver tarefas atrasadas ha muito"). Eventos:
meals:none, overdue, overdue_old, today, deficit:off, weight:stale, sync:stale, gtd:holiday_backlog, gtd:unclarified, dup.

Regras de raciocinio:
- Baseia-te SO no SNAPSHOT, PROBLEMAS e MEMORIA fornecidos. Nunca inventes tarefas, ids, numeros ou eventos.
- Procura a causa, nao so o sintoma. Prioriza o que e para hoje e o mais grave. No maximo 3 pontos.
- Sem dramatizar: factos, curto e direto, em portugues de Portugal. Trata o utilizador por tu.
- A resposta pode ser lida em voz alta: frases curtas, sem tabelas nem markdown pesado.

Regras de acao:
- So podes propor acoes do CATALOGO, com os parametros exatos e ids exatos.
- Acoes "low" sao executadas logo; as "high" ficam a espera de aprovacao.
- HONESTIDADE: nunca digas que fizeste uma acao "high" (concluir/criar/reagendar tarefa, pagina no Notion) — excepto
  eventos/lembretes que ele te pediu explicitamente nesta mensagem, que sao criados logo.
  Diz que a deixaste para ele aprovar ("deixei para aprovares", "queres que conclua?"). So afirmas como feito o que e "low".
- Se ha acoes A ESPERA DE APROVACAO e ele confirma claramente ("sim", "aprova", "pode", "confirmo"), usa approve_pending;
  se recusa ("nao", "deixa", "cancela"), usa reject_pending. Nunca as aproves sem ele confirmar.
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

// Le a resposta do modelo de forma tolerante: JSON puro, JSON dentro de
// ```json``` ou rodeado de texto; se nao houver JSON valido, o texto e a
// resposta (sem acoes) — melhor responder do que falhar.
export function parseReply(raw: string): Reasoning | null {
  const txt = raw.trim();
  if (!txt) return null;
  const candidates = [txt.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim()];
  const first = txt.indexOf("{");
  const last = txt.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(txt.slice(first, last + 1));
  for (const c of candidates) {
    try {
      const p = JSON.parse(c);
      if (p && p.ignore === true) return { analysis: String(p.analysis || "ignorado"), reply: "", actions: [], ignore: true };
      if (p && typeof p.reply === "string" && p.reply.trim()) {
        return {
          analysis: String(p.analysis || ""),
          reply: p.reply.trim(),
          actions: Array.isArray(p.actions) ? p.actions.slice(0, 5) : [],
        };
      }
    } catch {
      // tenta o proximo candidato
    }
  }
  // Texto livre (sem JSON): usa-o como resposta, se nao parecer JSON partido.
  if (first === -1) return { analysis: "resposta em texto livre", reply: txt, actions: [] };
  const m = /"reply"\s*:\s*"((?:[^"\\]|\\.)*)"/.exec(txt);
  if (m) {
    try {
      return { analysis: "json incompleto", reply: JSON.parse(`"${m[1]}"`), actions: [] };
    } catch {}
  }
  return null;
}

// Resposta sem IA (circuit breaker aberto ou erro): so os problemas das regras.
export function fallbackReply(problems: Problem[], why: string, voice = false): Reasoning {
  if (voice) {
    // Na conversa por voz nada de listas: uma frase curta, como uma pessoa.
    return {
      analysis: `fallback: ${why}`,
      reply: /limite/i.test(why) ? "Dá-me só uns segundos, estou com muitos pedidos. Repete daqui a pouco?" : "Desculpa, falhou-me agora. Podes repetir?",
      actions: [],
    };
  }
  const top = problems.slice(0, 3).map((p) => `• ${AREA_LABEL[p.area]}: ${p.signals[0].title}`);
  return {
    analysis: `fallback: ${why}`,
    // O erro tecnico fica no "analysis" (log); ao utilizador vai uma frase simples.
    reply:
      `${/limite/i.test(why) ? "Estou no limite de pedidos por minuto — tenta daqui a pouco." : "A IA falhou desta vez."} ` +
      `Pelo que as regras veem agora:\n` +
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
  voice?: boolean;
  integrations?: string;
  toolResults?: string;
  pending?: string;
  userMessage: string;
}): Promise<Reasoning> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return fallbackReply(input.problems, "GROQ_API_KEY não configurado");
  if (Date.now() < disabledUntil) return fallbackReply(input.problems, "IA em pausa após falhas seguidas", input.voice);

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
    `INTEGRACOES:\n${input.integrations || "(nenhuma extra)"}\n\n` +
    `A ESPERA DE APROVACAO:\n${input.pending || "(nada)"}\n\n` +
    `AUTOMACOES:\n${
      m.automations.length
        ? m.automations
            .map(
              (a) =>
                `- [${a.id}] ${a.name} (${a.kind}) ${a.trigger === "evento" ? `EVENTO ${a.event} a partir das ${a.time}` : a.time} dias ${a.days.join(",")}${a.active ? "" : " PAUSADA"}`
            )
            .join("\n")
        : "(nenhuma)"
    }\n\n` +
    `CATALOGO DE ACOES:\n${catalog}\n\n` +
    `ACOES RECENTES:\n${recent}`;

  const messages = [
    { role: "system", content: SYSTEM },
    { role: "system", content: context },
    ...input.history.slice(-8).map((h) => ({
      role: h.role === "user" ? "user" : "assistant",
      content: h.content.slice(0, 600),
    })),
    ...(input.voice
      ? [
          {
            role: "system",
            content:
              "MODO CONVERSA POR VOZ — estas a falar com o Josuel em tempo real, como uma pessoa ao telefone.\n" +
              "Como falar:\n" +
              "- Natural e caloroso, portugues de Portugal coloquial (\"claro\", \"olha\", \"ja esta\", \"queres que...?\"). Trata-o por tu.\n" +
              "- 1 a 3 frases curtas. Sem listas, sem simbolos, sem emojis, sem ids, sem markdown. Numeros e horas por extenso quando soa melhor (\"as nove e meia\").\n" +
              "- Responde primeiro ao que ele disse (um cumprimento responde-se com um cumprimento); so depois, se fizer sentido, acrescenta UMA coisa util.\n" +
              "- Cumprimenta pela hora de \"agora\" no contexto: ate as 12h bom dia, das 12h as 20h boa tarde, depois boa noite.\n" +
              "- Um cumprimento ou conversa solta NUNCA leva a acoes. Nunca digas que fizeste algo que so propuseste: acoes de risco alto ficam a espera da aprovacao dele.\n" +
              "- Nao repitas frases que ja disseste na conversa. Se precisares de detalhe, pergunta.\n" +
              "- Acaba muitas vezes com uma pergunta curta, para a conversa continuar.\n" +
              "Transcricao:\n" +
              "- O texto vem de um microfone aberto e pode ter erros: interpreta pelo contexto.\n" +
              "- Se a frase claramente NAO e para ti (dialogo de TV/filme, outra pessoa a falar com alguem, frase sem sentido nenhum),\n" +
              "  responde APENAS {\"ignore\": true} — ficas calado e continuas a ouvir.",
          },
        ]
      : []),
    { role: "user", content: input.userMessage },
    ...(input.toolResults
      ? [
          {
            role: "system",
            content:
              "RESULTADOS das acoes de leitura que pediste (usa-os na resposta; nao voltes a pedir as mesmas):\n" +
              input.toolResults,
          },
        ]
      : []),
  ];

  const call = (model = MODEL) =>
    fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.2,
        // reasoning_effort so existe nos modelos de raciocinio (gpt-oss).
        ...(model.startsWith("openai/gpt-oss") ? { reasoning_effort: "low" } : {}),
        // Sem response_format: o modo JSON estrito da Groq rejeitava respostas
        // (HTTP 400 "Failed to generate JSON"). O JSON e extraido em parseReply.
        max_completion_tokens: 2000,
      }),
    });

  try {
    let r = await call();
    // Limite por minuto do modelo principal: tenta logo os modelos de reserva
    // (limites separados). So no texto, e sem reserva, espera o que a Groq pede.
    for (const fb of FALLBACK_MODELS) {
      if (r.status !== 429) break;
      r = await call(fb);
      if (r.status === 404 || r.status === 400) r = new Response(null, { status: 429 }); // modelo retirado: passa ao seguinte
    }
    if (r.status === 429 && !input.voice) {
      const wait = Math.min(12, Number(r.headers.get("retry-after")) || 6);
      await new Promise((res) => setTimeout(res, wait * 1000));
      r = await call();
    }
    const j: any = await r.json().catch(() => ({}));
    if (r.status === 429) throw new Error("limite de pedidos da Groq por minuto — tenta daqui a pouco");
    if (!r.ok) throw new Error(`Groq HTTP ${r.status}: ${String(j?.error?.message || "").slice(0, 160)}`.trim());

    const parsed = parseReply(j.choices?.[0]?.message?.content || "");
    if (!parsed) throw new Error("resposta vazia do modelo");
    failures = 0;
    return parsed;
  } catch (e: any) {
    failures += 1;
    if (failures >= MAX_FAILURES) {
      disabledUntil = Date.now() + COOLDOWN_MS;
      failures = 0;
    }
    console.error("holiday reasoning:", e?.message || e); // aparece nos logs do Worker
    return fallbackReply(input.problems, e?.message || String(e), input.voice);
  }
}
