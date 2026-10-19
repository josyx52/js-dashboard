"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { PILLARS } from "@/lib/types";
import { compressImageToBase64 } from "@/lib/image";
import { IconCamera, IconMic, IconPlay, IconSpeaker, IconStop } from "@/components/icons";
import { Badge, Button, ColorDot, SectionLabel, StatusDot, useToast } from "@/components/ui";
import { speak, stopSpeaking } from "@/lib/speech";
import { Conversation, conversationSupported, type ConvState } from "@/lib/conversation";

type Severity = "alta" | "media" | "baixa";

interface Signal {
  id: string;
  severity: Severity;
  title: string;
  detail?: string;
}
interface Problem {
  area: string;
  severity: Severity;
  signals: Signal[];
}
interface Message {
  id: string;
  role: "user" | "assistant" | "briefing";
  content: string;
  created_at: string;
}
interface Action {
  id: string;
  type: string;
  summary: string | null;
  risk: "low" | "high";
  status: "proposed" | "executed" | "rejected" | "failed";
  reason: string | null;
  result: string | null;
  message_id: string | null;
}
interface MemoryItem {
  id: string;
  kind: "fato" | "preferencia" | "objetivo" | "padrao";
  area: string | null;
  content: string;
  importance: number;
}
interface Delegated {
  id: string;
  title: string;
  due: string | null;
  list: string | null;
  note: string | null;
}

// Uma so fonte para as cores dos pilares (lib/types).
const AREA: Record<string, { label: string; color: string }> = {
  ...Object.fromEntries(PILLARS.map((p) => [p.key, { label: p.label, color: p.color }])),
  sistema: { label: "Sistema", color: "rgb(var(--fg-3))" },
};
const SEV_TONE: Record<Severity, "danger" | "warning" | "neutral"> = { alta: "danger", media: "warning", baixa: "neutral" };
const SEV_LABEL: Record<Severity, string> = { alta: "Alta", media: "Média", baixa: "Baixa" };
const KIND_LABEL: Record<MemoryItem["kind"], string> = { fato: "Facto", preferencia: "Preferência", objetivo: "Objetivo", padrao: "Padrão" };

// Marca do Holiday: um quadrado com gradiente da marca e a inicial.
function Avatar({ size = 28 }: { size?: number }) {
  return (
    <div
      className="flex-none rounded-lg flex items-center justify-center font-semibold text-white bg-gradient-to-br from-accent to-violet"
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden
    >
      H
    </div>
  );
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function HolidayChat() {
  const toast = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [memories, setMemories] = useState<MemoryItem[]>([]);
  const [delegated, setDelegated] = useState<Delegated[]>([]);
  const [panel, setPanel] = useState<string | null>(null); // area | "memoria" | "delegadas"
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState<string | null>(null);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [voiceOn, setVoiceOn] = useState(false);
  const [conv, setConv] = useState<ConvState>("off");
  const [canTalk, setCanTalk] = useState(false);
  const [muted, setMuted] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const convRef = useRef<Conversation | null>(null);
  const sendRef = useRef<(o: { text?: string; voice?: boolean }) => Promise<string | null>>(async () => null);

  async function load() {
    try {
      const d = await api<{ messages: Message[]; actions: Action[]; problems: Problem[]; memories: MemoryItem[]; delegated: Delegated[] }>(
        "/api/holiday"
      );
      setMessages(d.messages);
      setActions(d.actions);
      setProblems(d.problems);
      setMemories(d.memories);
      setDelegated(d.delegated);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
    setCanTalk(conversationSupported());
    try {
      setVoiceOn(localStorage.getItem("holiday_voice") === "1");
    } catch {}
    // As vozes carregam de forma assincrona em alguns browsers.
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => convRef.current?.stop();
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages, actions, thinking]);

  function toggleVoice() {
    const v = !voiceOn;
    setVoiceOn(v);
    if (!v && !convRef.current) stopSpeaking();
    try {
      localStorage.setItem("holiday_voice", v ? "1" : "0");
    } catch {}
  }

  // Envia uma mensagem; devolve a resposta (usada pelo modo conversa para a falar).
  async function send(opts: { text?: string; imageBase64?: string; voice?: boolean } = {}): Promise<string | null> {
    const text = (opts.text ?? draft).trim();
    if (!text && !opts.imageBase64) return null;
    if (thinking && !opts.voice) return null;
    if (opts.text === undefined) setDraft("");
    setError(null);
    setThinking(opts.imageBase64 ? "a analisar a foto e a pensar…" : "a pensar: snapshot → regras → memória → raciocínio…");
    const tempId = "tmp-" + Date.now();
    setMessages((p) => [
      ...p,
      { id: tempId, role: "user", content: [opts.imageBase64 ? "📷" : "", text].filter(Boolean).join(" "), created_at: new Date().toISOString() },
    ]);
    try {
      const call = () =>
        api<{ message: Message | null; actions: Action[]; problems: Problem[]; userMessage?: Message; ignored?: boolean }>("/api/holiday", {
          body: { message: text, imageBase64: opts.imageBase64, voice: !!opts.voice },
        });
      // Falha de rede (ligacao movel instavel): tenta outra vez uma vez.
      const d = await call().catch(async (e) => {
        if (!/fetch|network|load failed|HTTP 5/i.test(String(e?.message))) throw e;
        await new Promise((r) => setTimeout(r, 1200));
        return call();
      });
      if (d.ignored || !d.message) {
        // Nao era para o Holiday (conversa de fundo): some do chat, sem resposta.
        setMessages((p) => p.filter((m) => m.id !== tempId));
        return null;
      }
      const reply = d.message;
      setMessages((p) => [...p.map((m) => (m.id === tempId && d.userMessage ? d.userMessage : m)), reply]);
      setActions((p) => [...p, ...d.actions]);
      setProblems(d.problems);
      if (d.actions.some((a) => a.status === "executed" && ["remember", "forget", "set_owner", "save_task_note"].includes(a.type))) {
        load(); // memoria / delegadas mudaram
      }
      if (voiceOn && !opts.voice) speak(reply.content);
      return reply.content;
    } catch (e: any) {
      if (opts.voice) {
        // Em conversa nao mostra erros tecnicos: pede para repetir, como uma pessoa.
        setMessages((p) => p.filter((m) => m.id !== tempId));
        return /limite/i.test(e.message)
          ? "Dá-me só uns segundos, estou com muitos pedidos. Repete daqui a pouco?"
          : "Desculpa, a ligação falhou. Podes repetir?";
      }
      toast.error("O Holiday não respondeu", e.message);
      return null;
    } finally {
      setThinking(null);
    }
  }
  sendRef.current = send;

  function toggleMute() {
    const m = !muted;
    setMuted(m);
    convRef.current?.setMuted(m);
  }

  function toggleConversation() {
    if (convRef.current) {
      convRef.current.stop();
      convRef.current = null;
      setMuted(false);
      return;
    }
    setError(null);
    const c = new Conversation({
      onState: (st) => {
        setConv(st);
        if (st === "off") convRef.current = null;
      },
      onUtterance: (text) => sendRef.current({ text, voice: true }),
      onError: (msg) => toast.error("Conversa por voz", msg),
    });
    convRef.current = c;
    c.start();
  }

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (fileRef.current) fileRef.current.value = "";
    if (!file) return;
    try {
      const base64 = await compressImageToBase64(file);
      const text = draft.trim();
      setDraft("");
      await send({ text, imageBase64: base64 });
    } catch (err: any) {
      toast.error("Não consegui ler a foto", String(err?.message || err));
    }
  }

  async function briefing() {
    setThinking("a preparar o briefing…");
    setError(null);
    try {
      const d = await api<{ skipped?: string; message?: Message }>("/api/holiday/briefing?force=1", { method: "POST" });
      if (d.skipped) toast.info("Briefing", d.skipped);
      await load();
      if (voiceOn && d.message) speak(d.message.content);
    } catch (e: any) {
      toast.error("Falhou o briefing", e.message);
    } finally {
      setThinking(null);
    }
  }

  async function decide(a: Action, decision: "approve" | "reject") {
    setDeciding(a.id);
    try {
      const d = await api<{ action: Action }>(`/api/holiday/actions/${a.id}`, { body: { decision } });
      setActions((p) => p.map((x) => (x.id === a.id ? d.action : x)));
    } catch (e: any) {
      toast.error("Não foi possível decidir", e.message);
      await load();
    } finally {
      setDeciding(null);
    }
  }

  async function forget(m: MemoryItem) {
    try {
      await api(`/api/holiday/memories/${m.id}`, { method: "DELETE" });
      setMemories((p) => p.filter((x) => x.id !== m.id));
    } catch (e: any) {
      toast.error("Não foi possível esquecer", e.message);
    }
  }
  const todayKey = new Date().toLocaleDateString("en-CA");
  const hasBriefingToday = messages.some(
    (m) => m.role === "briefing" && new Date(m.created_at).toLocaleDateString("en-CA") === todayKey
  );
  const talking = conv !== "off";
  const busy = !!thinking && !talking;
  const CONV_LABEL: Record<ConvState, string> = {
    off: "",
    starting: "A ligar o microfone…",
    listening: "A ouvir — fala quando quiseres",
    hearing: "Estou a ouvir-te…",
    thinking: "A pensar…",
    speaking: "A falar — podes interromper",
  };

  // Agrupa mensagens por dia para os separadores.
  const dayLabel = (iso: string) => {
    const d = new Date(iso).toLocaleDateString("en-CA");
    const y = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    if (d === todayKey) return "Hoje";
    if (d === y) return "Ontem";
    return new Date(iso).toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" });
  };
  const micMuted = talking && muted && conv !== "speaking" && conv !== "thinking";
  const status = talking ? (micMuted ? "Microfone silenciado" : CONV_LABEL[conv]) : thinking ? "A pensar…" : "Online";
  const statusTone: "success" | "warning" | "danger" = micMuted ? "danger" : thinking || conv === "thinking" ? "warning" : "success";
  const statusPulse = !micMuted && (conv === "hearing" || conv === "speaking" || conv === "thinking" || (!!thinking && !talking));
  const SUGGESTIONS = [
    "O que tenho para hoje?",
    "Analisa a minha semana e diz-me o que está a falhar",
    "Que tarefas posso delegar-te?",
    "Lembra-me todos os dias às 21h de registar o jantar",
  ];
  const totalSignals = problems.reduce((a, p) => a + p.signals.length, 0);

  function autoGrow(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 160) + "px";
  }
  useEffect(() => autoGrow(taRef.current), [draft]);

  const contextPanel = (
    <div className="flex flex-col gap-6">
      <section>
        <SectionLabel right={<span className="tabular">{totalSignals} sinais</span>}>Agora</SectionLabel>
        {loaded && problems.length === 0 && (
          <div className="flex items-center gap-2 text-[12.5px] text-success">
            <StatusDot tone="success" /> Tudo em ordem.
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          {problems.map((p) => {
            const a = AREA[p.area] || AREA.sistema;
            const open = panel === p.area;
            return (
              <div key={p.area} className={cn("rounded-lg transition-colors", open && "bg-line/[0.04]")}>
                <button
                  onClick={() => setPanel(open ? null : p.area)}
                  aria-expanded={open}
                  className="w-full flex items-center gap-2.5 px-2 h-9 rounded-lg hover:bg-line/[0.04] text-left transition-colors"
                >
                  <ColorDot color={a.color} />
                  <span className="flex-1 text-[13px] font-medium text-fg">{a.label}</span>
                  <Badge tone={SEV_TONE[p.severity]}>{SEV_LABEL[p.severity]}</Badge>
                  <span className="text-[12px] text-fg-3 tabular w-4 text-right">{p.signals.length}</span>
                </button>
                {open && (
                  <ul className="flex flex-col gap-2 pl-[30px] pr-3 pb-3 pt-1">
                    {p.signals.map((sg) => (
                      <li key={sg.id} className="text-[12.5px] text-fg-2 leading-snug">
                        {sg.title}
                        {sg.detail && <div className="text-fg-3 mt-0.5">{sg.detail}</div>}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <SectionLabel right={<span className="tabular">{delegated.length}</span>}>Delegadas ao Holiday</SectionLabel>
        {delegated.length === 0 && (
          <p className="text-[12.5px] text-fg-3 leading-relaxed">Nada delegado. Experimenta “fica tu com a tabela de preços”.</p>
        )}
        <div className="flex flex-col gap-2">
          {delegated.map((t) => (
            <div key={t.id} className="rounded-lg border border-line/[0.07] bg-surface-2 px-3 py-2.5">
              <div className="flex items-start gap-2">
                <span className="flex-1 text-[12.5px] font-medium text-fg leading-snug">{t.title}</span>
                <Badge tone={t.note ? "success" : "warning"}>{t.note ? "Em curso" : "Por começar"}</Badge>
              </div>
              {t.note && <p className="text-[12px] text-fg-3 mt-1.5 whitespace-pre-wrap line-clamp-2">{t.note.split("\n").slice(-1)[0]}</p>}
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionLabel right={<span className="tabular">{memories.length}</span>}>Memória</SectionLabel>
        {memories.length === 0 && (
          <p className="text-[12.5px] text-fg-3 leading-relaxed">Ainda vazia. O Holiday aprende com as conversas e com os padrões do teu histórico.</p>
        )}
        <ul className="flex flex-col">
          {memories.map((m) => (
            <li key={m.id} className="group flex items-start gap-2 py-2 border-b border-line/[0.05] last:border-b-0">
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-medium text-info">{KIND_LABEL[m.kind]}</div>
                <div className="text-[12.5px] text-fg-2 leading-snug mt-0.5">{m.content}</div>
              </div>
              <button
                onClick={() => forget(m)}
                title="Esquecer"
                aria-label={`Esquecer: ${m.content}`}
                className="w-6 h-6 flex-none rounded-md flex items-center justify-center text-fg-3 hover:text-danger hover:bg-danger/10 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
              >
                <svg viewBox="0 0 24 24" className="w-3.5 h-3.5">
                  <path d="M6 6 L18 18 M18 6 L6 18" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );

  let lastDay = "";

  return (
    <div className="flex-1 min-h-0 flex gap-4">
      {/* Coluna do chat */}
      <div className="flex-1 min-w-0 flex flex-col md:border md:border-line/[0.07] md:bg-surface md:rounded-card overflow-hidden">
        {/* Cabecalho */}
        <div className="flex items-center gap-3 px-4 sm:px-5 h-[60px] border-b border-line/[0.07] flex-none">
          <Avatar size={32} />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-semibold text-fg leading-tight">Holiday</div>
            <div className="flex items-center gap-1.5 text-[12px] text-fg-3 mt-0.5 min-w-0">
              <StatusDot tone={statusTone} pulse={statusPulse} />
              <span className="truncate">{status}</span>
            </div>
          </div>
          {!hasBriefingToday && loaded && (
            <Button size="sm" variant="ghost" onClick={briefing} disabled={busy}>
              Briefing
            </Button>
          )}
          <Button
            size="sm"
            variant={voiceOn ? "secondary" : "ghost"}
            onClick={toggleVoice}
            title="Ler as respostas em voz alta"
            aria-pressed={voiceOn}
            icon={<IconSpeaker className="w-4 h-4" muted={!voiceOn} />}
          >
            <span className="hidden sm:inline">{voiceOn ? "Voz ligada" : "Voz"}</span>
          </Button>
          <span className="lg:hidden">
            <Button size="sm" variant={panel === "mobile" ? "secondary" : "ghost"} onClick={() => setPanel(panel === "mobile" ? null : "mobile")} aria-expanded={panel === "mobile"}>
              Contexto
              {totalSignals > 0 && <span className="tabular text-fg-3">{totalSignals}</span>}
            </Button>
          </span>
        </div>

        {/* Contexto no telemovel */}
        {panel === "mobile" && (
          <div className="lg:hidden max-h-[45vh] overflow-y-auto p-4 border-b border-line/[0.07] bg-surface-2/50 animate-fade-up">{contextPanel}</div>
        )}

        {/* Mensagens */}
        <div ref={boxRef} className="flex-1 overflow-y-auto px-4 sm:px-6 pt-6 pb-2">
          <div className="max-w-[760px] mx-auto flex flex-col gap-5">
            {loaded && messages.length === 0 && (
              <div className="flex flex-col items-center text-center py-12 px-3 gap-3">
                <Avatar size={48} />
                <h2 className="text-[18px] font-semibold text-fg mt-1">Olá, sou o Holiday.</h2>
                <p className="text-[13.5px] text-fg-2 max-w-[460px] leading-relaxed">
                  Vejo as tuas tarefas, rotina, refeições e peso, comparo com o teu histórico e procuro a causa do que está a falhar. Fala
                  comigo por texto, voz ou com a foto de um prato.
                </p>
              </div>
            )}
            {!loaded &&
              [0, 1, 2].map((i) => (
                <div key={i} className={cn("flex gap-3", i % 2 === 1 && "justify-end")}>
                  {!(i % 2) && <div className="w-7 h-7 rounded-lg bg-line/[0.05] animate-pulse" />}
                  <div className={cn("h-14 rounded-2xl bg-line/[0.05] animate-pulse", i % 2 ? "w-1/3" : "w-2/3")} />
                </div>
              ))}

            {messages.map((m) => {
              const mine = m.role === "user";
              const msgActions = actions.filter((a) => a.message_id === m.id);
              const day = dayLabel(m.created_at);
              const sep = day !== lastDay;
              lastDay = day;
              const tag = m.role === "briefing" ? ((m as any).automation_name ? `Automação · ${(m as any).automation_name}` : "Briefing") : null;
              return (
                <div key={m.id} className="contents">
                  {sep && (
                    <div className="flex items-center gap-3 my-1" role="separator">
                      <span className="flex-1 h-px bg-line/[0.06]" />
                      <span className="text-[11.5px] font-medium text-fg-3 first-letter:uppercase">{day}</span>
                      <span className="flex-1 h-px bg-line/[0.06]" />
                    </div>
                  )}
                  <div className={cn("group flex gap-3 animate-fade-up", mine ? "justify-end" : "justify-start")}>
                    {!mine && (
                      <div className="mt-0.5">
                        <Avatar />
                      </div>
                    )}
                    <div className={cn("flex flex-col gap-2 min-w-0", mine ? "items-end max-w-[82%] sm:max-w-[75%]" : "items-start flex-1")}>
                      {tag && <Badge tone="warning">{tag}</Badge>}
                      <div
                        className={cn(
                          "text-[14px] leading-[1.6] break-words",
                          mine
                            ? "bg-surface-3 text-fg px-3.5 py-2.5 rounded-2xl rounded-br-md"
                            : tag
                            ? "text-fg border border-warning/20 bg-warning/[0.04] rounded-xl px-3.5 py-2.5"
                            : "text-fg pt-1"
                        )}
                      >
                        {m.content.startsWith("📷") ? (
                          <span className="inline-flex items-center gap-1.5">
                            <IconCamera className="w-4 h-4 flex-none text-fg-2" />
                            {m.content.slice(2).trim() || "Foto"}
                          </span>
                        ) : (
                          renderText(m.content)
                        )}
                      </div>

                      {msgActions.map((a) => {
                        const proposed = a.status === "proposed";
                        const meta = {
                          executed: { tone: "success" as const, label: "Feito" },
                          failed: { tone: "danger" as const, label: "Falhou" },
                          rejected: { tone: "neutral" as const, label: "Rejeitada" },
                          proposed: { tone: "violet" as const, label: "Precisa de ti" },
                        }[a.status];
                        return (
                          <div
                            key={a.id}
                            className={cn(
                              "w-full max-w-[540px] rounded-xl border px-3.5 py-3 flex flex-col gap-2",
                              proposed ? "border-violet/30 bg-violet/[0.06]" : "border-line/[0.07] bg-surface-2/60"
                            )}
                          >
                            <div className="flex items-start gap-2.5">
                              <span
                                className={cn(
                                  "text-[13px] font-medium flex-1 leading-snug",
                                  a.status === "rejected" ? "line-through text-fg-3" : "text-fg"
                                )}
                              >
                                {a.summary || a.type}
                              </span>
                              <Badge tone={meta.tone} dot>
                                {meta.label}
                              </Badge>
                            </div>
                            {proposed && a.reason && <p className="text-[12.5px] text-fg-2 leading-snug">{a.reason}</p>}
                            {a.result && !proposed && <p className="text-[12px] text-fg-3 whitespace-pre-wrap break-words leading-snug">{a.result}</p>}
                            {proposed && (
                              <div className="flex gap-2 pt-0.5">
                                <Button size="sm" variant="success" onClick={() => decide(a, "approve")} loading={deciding === a.id}>
                                  Aprovar
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => decide(a, "reject")} disabled={deciding === a.id}>
                                  Rejeitar
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}

                      <div className="flex items-center gap-3 text-[11.5px] text-fg-3 h-5">
                        <span className="tabular">{time(m.created_at)}</span>
                        {!mine && (
                          <button
                            onClick={() => speak(m.content)}
                            title="Ouvir"
                            className="inline-flex items-center gap-1 hover:text-fg-2 md:opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition"
                          >
                            <IconPlay className="w-2.5 h-2.5" />
                            Ouvir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {thinking && !talking && (
              <div className="flex gap-3 items-start animate-fade-up">
                <Avatar />
                <div className="flex items-center gap-2 pt-1.5">
                  <span className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <span key={i} className="w-1.5 h-1.5 rounded-full bg-fg-3 animate-pulse" style={{ animationDelay: `${i * 0.2}s` }} />
                    ))}
                  </span>
                  <span className="text-[12.5px] text-fg-3">{thinking}</span>
                </div>
              </div>
            )}
            {error && (
              <div className="flex items-center justify-center gap-3 text-[12.5px] text-danger">
                Não foi possível carregar a conversa: {error}
                <Button size="sm" variant="ghost" onClick={load}>
                  Tentar de novo
                </Button>
              </div>
            )}

            {loaded && !thinking && messages.length < 4 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-1">
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send({ text: q })}
                    className="text-left text-[13px] text-fg-2 rounded-xl border border-line/[0.08] bg-surface-2/60 px-3.5 py-2.5 hover:border-line/20 hover:text-fg hover:bg-surface-2 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Compositor (com a barra da conversa por voz por cima) */}
        <div className="flex-none px-3 sm:px-5 pt-2 pb-3 sm:pb-4">
          <div className="max-w-[760px] mx-auto flex flex-col gap-2">
            {talking && (
              <div
                className={cn(
                  "flex items-center gap-2.5 rounded-xl border px-3 h-11 animate-fade-up",
                  micMuted ? "border-danger/25 bg-danger/[0.06]" : "border-line/[0.08] bg-surface-2"
                )}
                aria-live="polite"
              >
                <StatusDot tone={statusTone} pulse={statusPulse} />
                <span className="flex-1 min-w-0 truncate text-[13px] text-fg-2">{status}</span>
                <Button
                  size="sm"
                  variant={muted ? "danger" : "ghost"}
                  onClick={toggleMute}
                  aria-pressed={muted}
                  title={muted ? "Ligar o microfone" : "Silenciar o microfone"}
                  icon={<IconMic className="w-4 h-4" muted={muted} />}
                >
                  <span className="hidden sm:inline">{muted ? "Ligar mic" : "Silenciar"}</span>
                </Button>
                <Button size="sm" variant="secondary" onClick={toggleConversation}>
                  Terminar
                </Button>
              </div>
            )}
            <div className="flex items-end gap-1 p-1.5 rounded-2xl bg-surface-2 border border-line/10 focus-within:border-accent/50 focus-within:ring-2 focus-within:ring-accent/10 transition">
              <label
                title="Foto de uma refeição"
                className={cn(
                  "w-9 h-9 flex-none rounded-lg flex items-center justify-center text-fg-3 transition-colors",
                  busy ? "opacity-50" : "cursor-pointer hover:text-fg hover:bg-line/[0.06]"
                )}
              >
                <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} disabled={busy} className="hidden" />
                <IconCamera className="w-[18px] h-[18px]" />
              </label>
              <textarea
                ref={taRef}
                rows={1}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    send();
                  }
                }}
                aria-label="Mensagem para o Holiday"
                placeholder={talking ? "Em conversa por voz — também podes escrever" : "Escreve ao Holiday…"}
                className="flex-1 min-w-0 resize-none bg-transparent outline-none text-[14px] leading-[1.5] text-fg placeholder:text-fg-3 py-2 px-1 max-h-40"
              />
              {canTalk && (
                <button
                  onClick={toggleConversation}
                  title={talking ? "Terminar conversa" : "Conversar por voz"}
                  aria-pressed={talking}
                  className={cn(
                    "w-9 h-9 flex-none rounded-lg flex items-center justify-center transition-colors",
                    talking ? "bg-danger/15 text-danger hover:bg-danger/20" : "text-fg-3 hover:text-fg hover:bg-line/[0.06]"
                  )}
                >
                  {talking ? <IconStop className="w-4 h-4" /> : <IconMic className="w-[18px] h-[18px]" />}
                </button>
              )}
              <button
                onClick={() => send()}
                disabled={busy || !draft.trim()}
                title="Enviar"
                aria-label="Enviar"
                className={cn(
                  "w-9 h-9 flex-none rounded-lg flex items-center justify-center transition-colors",
                  draft.trim() ? "bg-accent text-white hover:bg-accent/90" : "bg-line/[0.06] text-fg-3"
                )}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4">
                  <path d="M12 19 V5 M6 11 L12 5 L18 11" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <p className="hidden sm:block text-center text-[11px] text-fg-3">Enter para enviar · Shift+Enter para nova linha</p>
          </div>
        </div>
      </div>

      {/* Painel de contexto (computador) */}
      <aside className="hidden lg:block w-[300px] flex-none overflow-y-auto rounded-card border border-line/[0.07] bg-surface p-5">{contextPanel}</aside>
    </div>
  );
}

// Markdown leve: **negrito** e listas ("- " / "• " / "1. ").
function renderText(text: string) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];
  let list: string[] = [];
  const inline = (t: string, k: number) =>
    t.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={`${k}-${i}`} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      ) : (
        <span key={`${k}-${i}`}>{part}</span>
      )
    );
  const flush = (k: number) => {
    if (!list.length) return;
    out.push(
      <ul key={`ul${k}`} className="my-1 pl-5 list-disc marker:text-fg-3">
        {list.map((li, i) => (
          <li key={i} className="my-0.5">
            {inline(li, i)}
          </li>
        ))}
      </ul>
    );
    list = [];
  };
  lines.forEach((l, i) => {
    const m = /^\s*(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l);
    if (m) {
      list.push(m[1]);
      return;
    }
    flush(i);
    if (l.trim()) out.push(<div key={i}>{inline(l, i)}</div>);
    else if (i > 0 && i < lines.length - 1) out.push(<div key={i} className="h-2" />);
  });
  flush(lines.length);
  return out;
}
