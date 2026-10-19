"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { compressImageToBase64 } from "@/lib/image";
import { IconCamera, IconMic, IconPlay, IconSpeaker, IconStop } from "@/components/icons";
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

const AREA: Record<string, { label: string; color: string }> = {
  deus: { label: "Deus", color: "#E8B93F" },
  saude: { label: "Saúde", color: "#F54E00" },
  familia: { label: "Família", color: "#8B7CF6" },
  estudo: { label: "Estudo", color: "#36CFC9" },
  negocio: { label: "Negócio", color: "#EF5DA8" },
  trabalho: { label: "Trabalho", color: "#4F8FF7" },
  sistema: { label: "Sistema", color: "rgba(244,244,242,0.6)" },
};
const SEV_COLOR: Record<Severity, string> = { alta: "#FF5F5F", media: "#E8B93F", baixa: "rgba(244,244,242,0.45)" };
const KIND_LABEL: Record<MemoryItem["kind"], string> = { fato: "facto", preferencia: "preferência", objetivo: "objetivo", padrao: "padrão" };

const mono = (w: number, size: number) => `${w} ${size}px 'JetBrains Mono',monospace`;
const chip = (color: string, active = false): React.CSSProperties => ({
  display: "flex", alignItems: "center", gap: 6, font: mono(600, 10.5), color,
  background: active ? `${color}22` : "transparent", border: `1px solid ${color}55`,
  borderRadius: 3, padding: "3px 8px", cursor: "pointer", whiteSpace: "nowrap",
});

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function HolidayChat() {
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
      setError(e.message);
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
      onError: (msg) => setError(msg),
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
      setError("Foto: " + (err?.message || err));
    }
  }

  async function briefing() {
    setThinking("a preparar o briefing…");
    setError(null);
    try {
      const d = await api<{ skipped?: string; message?: Message }>("/api/holiday/briefing?force=1", { method: "POST" });
      if (d.skipped) setError("Briefing: " + d.skipped);
      await load();
      if (voiceOn && d.message) speak(d.message.content);
    } catch (e: any) {
      setError(e.message);
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
      setError(e.message);
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
      setError(e.message);
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
    starting: "a ligar o microfone…",
    listening: "a ouvir — fala quando quiseres",
    hearing: "estou a ouvir-te…",
    thinking: "a pensar…",
    speaking: "a falar — podes interromper",
  };

  // Agrupa mensagens por dia para os separadores.
  const dayLabel = (iso: string) => {
    const d = new Date(iso).toLocaleDateString("en-CA");
    const y = new Date(Date.now() - 86400000).toLocaleDateString("en-CA");
    if (d === todayKey) return "Hoje";
    if (d === y) return "Ontem";
    return new Date(iso).toLocaleDateString("pt-PT", { weekday: "long", day: "2-digit", month: "long" });
  };
  const status = talking
    ? muted && conv !== "speaking" && conv !== "thinking"
      ? "microfone silenciado"
      : CONV_LABEL[conv]
    : thinking
    ? "a pensar…"
    : "online · pensa como o Jarvis";
  const statusColor = talking ? (conv === "hearing" ? "#F54E00" : conv === "speaking" ? "#8B7CF6" : "#3DDC84") : thinking ? "#E8B93F" : "#3DDC84";
  const SUGGESTIONS = [
    "O que tenho para hoje?",
    "Analisa a minha semana e diz-me o que está a falhar",
    "Que tarefas posso delegar-te?",
    "Lembra-me todos os dias às 21h de registar o jantar",
  ];
  const totalSignals = problems.reduce((a, p) => a + p.signals.length, 0);

  const contextPanel = (
    <div className="flex flex-col gap-5">
      <section>
        <div className="flex items-center justify-between mb-2.5">
          <span style={{ font: mono(700, 10), letterSpacing: "0.08em", color: "rgba(244,244,242,0.45)" }}>AGORA</span>
          <span style={{ font: mono(600, 10), color: "rgba(244,244,242,0.35)" }}>{totalSignals} sinais</span>
        </div>
        {loaded && problems.length === 0 && <div style={{ font: "500 12px Inter,sans-serif", color: "#3DDC84" }}>Tudo em ordem.</div>}
        <div className="flex flex-col gap-2">
          {problems.map((p) => {
            const a = AREA[p.area] || AREA.sistema;
            const open = panel === p.area;
            return (
              <div key={p.area} style={{ borderRadius: 6, background: open ? "rgba(255,255,255,0.035)" : "transparent" }}>
                <button
                  onClick={() => setPanel(open ? null : p.area)}
                  className="w-full flex items-center gap-2 hover:bg-white/[0.03] transition-colors"
                  style={{ padding: "7px 8px", borderRadius: 6, background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 2, background: a.color, flexShrink: 0 }} />
                  <span style={{ flex: 1, font: "600 12.5px Inter,sans-serif", color: "#F4F4F2" }}>{a.label}</span>
                  <span style={{ font: mono(700, 9.5), color: SEV_COLOR[p.severity] }}>{p.severity.toUpperCase()}</span>
                  <span style={{ font: mono(600, 10.5), color: "rgba(244,244,242,0.4)", width: 14, textAlign: "right" }}>{p.signals.length}</span>
                </button>
                {open && (
                  <div className="flex flex-col gap-1.5" style={{ padding: "2px 10px 10px 24px" }}>
                    {p.signals.map((sg) => (
                      <div key={sg.id} style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.72)", lineHeight: 1.45 }}>
                        {sg.title}
                        {sg.detail && <div style={{ color: "rgba(244,244,242,0.38)" }}>{sg.detail}</div>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <span style={{ font: mono(700, 10), letterSpacing: "0.08em", color: "rgba(244,244,242,0.45)" }}>DELEGADAS AO HOLIDAY</span>
          <span style={{ font: mono(600, 10), color: "rgba(244,244,242,0.35)" }}>{delegated.length}</span>
        </div>
        {delegated.length === 0 && (
          <div style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.4)", lineHeight: 1.5 }}>
            Nada delegado. Diz “fica tu com a tabela de preços”.
          </div>
        )}
        <div className="flex flex-col gap-2">
          {delegated.map((t) => (
            <div key={t.id} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(255,255,255,0.03)", boxShadow: `inset 2px 0 0 ${t.note ? "#3DDC84" : "#E8B93F"}` }}>
              <div style={{ font: "600 12px Inter,sans-serif", color: "#F4F4F2" }}>{t.title}</div>
              <div style={{ font: mono(600, 9.5), color: t.note ? "#3DDC84" : "#E8B93F", marginTop: 3 }}>{t.note ? "EM CURSO" : "POR COMEÇAR"}</div>
              {t.note && (
                <div style={{ font: "500 11px Inter,sans-serif", color: "rgba(244,244,242,0.45)", whiteSpace: "pre-wrap", marginTop: 3 }}>
                  {t.note.split("\n").slice(-1)[0]}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-center justify-between mb-2.5">
          <span style={{ font: mono(700, 10), letterSpacing: "0.08em", color: "rgba(244,244,242,0.45)" }}>MEMÓRIA</span>
          <span style={{ font: mono(600, 10), color: "rgba(244,244,242,0.35)" }}>{memories.length}</span>
        </div>
        {memories.length === 0 && (
          <div style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.4)", lineHeight: 1.5 }}>
            Ainda vazia. O Holiday aprende com as conversas e com os padrões do teu histórico.
          </div>
        )}
        <div className="flex flex-col gap-1">
          {memories.map((m) => (
            <div key={m.id} className="group flex items-start gap-2" style={{ padding: "6px 4px" }}>
              <span style={{ font: mono(700, 9), color: "#36CFC9", flexShrink: 0, paddingTop: 2, width: 64 }}>{KIND_LABEL[m.kind].toUpperCase()}</span>
              <span style={{ flex: 1, font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.8)", lineHeight: 1.4 }}>{m.content}</span>
              <button
                onClick={() => forget(m)}
                title="Esquecer"
                className="opacity-40 group-hover:opacity-100 transition-opacity"
                style={{ background: "transparent", border: "none", color: "rgba(244,244,242,0.6)", cursor: "pointer", font: mono(700, 11) }}
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      </section>
    </div>
  );

  let lastDay = "";

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", gap: 14 }}>
      {/* Coluna do chat */}
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 10, overflow: "hidden" }}>
        {/* Cabecalho */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.07)" }}>
          <div style={{ position: "relative", width: 38, height: 38, flexShrink: 0 }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: "linear-gradient(135deg,#F54E00 0%,#8B7CF6 100%)", display: "flex", alignItems: "center", justifyContent: "center", font: mono(800, 15), color: "#0B0C10" }}>H</div>
            <span
              className={talking || thinking ? "animate-pulse" : ""}
              style={{ position: "absolute", right: -2, bottom: -2, width: 11, height: 11, borderRadius: "50%", background: statusColor, boxShadow: "0 0 0 2px #14161B" }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ font: "700 15px Inter,sans-serif", color: "#F4F4F2" }}>Holiday</div>
            <div style={{ font: mono(500, 11), color: "rgba(244,244,242,0.5)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{status}</div>
          </div>
          <button onClick={toggleVoice} title="Ler as respostas em voz alta" style={chip(voiceOn ? "#3DDC84" : "rgba(244,244,242,0.55)", voiceOn)}>
            <IconSpeaker className="w-3.5 h-3.5" muted={!voiceOn} />
            <span className="hidden sm:inline">VOZ</span>
          </button>
          {!hasBriefingToday && loaded && (
            <button onClick={briefing} disabled={busy} style={{ ...chip("#E8B93F"), opacity: busy ? 0.5 : 1 }}>
              BRIEFING
            </button>
          )}
          <span className="lg:hidden">
            <button onClick={() => setPanel(panel === "mobile" ? null : "mobile")} style={chip("rgba(244,244,242,0.7)", panel === "mobile")}>
              CONTEXTO{totalSignals ? ` · ${totalSignals}` : ""}
            </button>
          </span>
        </div>

        {/* Contexto no telemovel */}
        {panel === "mobile" && (
          <div className="lg:hidden" style={{ maxHeight: "45vh", overflowY: "auto", padding: 16, borderBottom: "1px solid rgba(255,255,255,0.07)", background: "#121419" }}>
            {contextPanel}
          </div>
        )}

        {/* Mensagens */}
        <div ref={boxRef} style={{ flex: 1, overflowY: "auto", padding: "18px 18px 8px" }}>
          <div style={{ maxWidth: 780, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
            {loaded && messages.length === 0 && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", padding: "40px 10px", gap: 14 }}>
                <div style={{ width: 54, height: 54, borderRadius: 14, background: "linear-gradient(135deg,#F54E00 0%,#8B7CF6 100%)", display: "flex", alignItems: "center", justifyContent: "center", font: mono(800, 22), color: "#0B0C10" }}>H</div>
                <div style={{ font: "700 18px Inter,sans-serif" }}>Olá, sou o Holiday.</div>
                <div style={{ font: "500 13px Inter,sans-serif", color: "rgba(244,244,242,0.5)", maxWidth: 460, lineHeight: 1.55 }}>
                  Vejo as tuas tarefas, rotina, refeições e peso, comparo com o teu histórico e procuro a causa do que está a falhar.
                  Fala comigo por texto, voz ou com a foto de um prato.
                </div>
              </div>
            )}

            {messages.map((m) => {
              const mine = m.role === "user";
              const msgActions = actions.filter((a) => a.message_id === m.id);
              const day = dayLabel(m.created_at);
              const sep = day !== lastDay;
              lastDay = day;
              const tag = m.role === "briefing" ? ((m as any).automation_name ? `AUTOMAÇÃO · ${(m as any).automation_name}` : "BRIEFING") : null;
              return (
                <div key={m.id} style={{ display: "contents" }}>
                  {sep && (
                    <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "6px 0" }}>
                      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                      <span style={{ font: mono(600, 10), color: "rgba(244,244,242,0.35)", textTransform: "uppercase" }}>{day}</span>
                      <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)" }} />
                    </div>
                  )}
                  <div style={{ display: "flex", gap: 10, justifyContent: mine ? "flex-end" : "flex-start" }}>
                    {!mine && (
                      <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: "linear-gradient(135deg,#F54E00 0%,#8B7CF6 100%)", display: "flex", alignItems: "center", justifyContent: "center", font: mono(800, 11), color: "#0B0C10", marginTop: 2 }}>H</div>
                    )}
                    <div style={{ maxWidth: mine ? "78%" : "calc(100% - 38px)", display: "flex", flexDirection: "column", gap: 6, alignItems: mine ? "flex-end" : "flex-start" }}>
                      {tag && <span style={{ font: mono(700, 9.5), letterSpacing: "0.06em", color: "#E8B93F" }}>{tag}</span>}
                      <div
                        style={{
                          padding: mine ? "10px 14px" : "11px 15px",
                          borderRadius: mine ? "14px 14px 4px 14px" : "4px 14px 14px 14px",
                          font: "500 13.5px Inter,sans-serif",
                          lineHeight: 1.55,
                          background: mine ? "#F54E00" : tag ? "rgba(232,185,63,0.06)" : "#1B1D23",
                          color: mine ? "#0B0C10" : "#ECECEA",
                          border: mine ? "none" : tag ? "1px solid rgba(232,185,63,0.25)" : "1px solid rgba(255,255,255,0.06)",
                        }}
                      >
                        {m.content.startsWith("📷") ? (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                            <IconCamera className="w-4 h-4 flex-none" />
                            {m.content.slice(2).trim() || "foto"}
                          </span>
                        ) : (
                          renderText(m.content)
                        )}
                      </div>

                      {msgActions.map((a) => (
                        <div key={a.id} style={{ width: "100%", maxWidth: 520, border: `1px solid ${a.status === "proposed" ? "rgba(139,124,246,0.45)" : "rgba(255,255,255,0.07)"}`, background: a.status === "proposed" ? "rgba(139,124,246,0.07)" : "rgba(255,255,255,0.02)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                            <span style={{ width: 18, height: 18, borderRadius: 5, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", font: mono(800, 10), color: "#0B0C10", background: a.status === "executed" ? "#3DDC84" : a.status === "failed" ? "#FF5F5F" : a.status === "rejected" ? "rgba(244,244,242,0.3)" : "#8B7CF6" }}>
                              {a.status === "executed" ? "✓" : a.status === "failed" ? "!" : a.status === "rejected" ? "–" : "?"}
                            </span>
                            <span style={{ flex: 1, font: "600 12.5px Inter,sans-serif", textDecoration: a.status === "rejected" ? "line-through" : undefined, color: a.status === "rejected" ? "rgba(244,244,242,0.4)" : "#F4F4F2" }}>
                              {a.summary || a.type}
                            </span>
                            <span style={{ font: mono(700, 9), color: "rgba(244,244,242,0.4)" }}>
                              {a.status === "executed" ? "FEITO" : a.status === "failed" ? "FALHOU" : a.status === "rejected" ? "REJEITADA" : "PRECISA DE TI"}
                            </span>
                          </div>
                          {a.status === "proposed" && a.reason && <span style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.55)", paddingLeft: 26 }}>{a.reason}</span>}
                          {a.result && a.status !== "proposed" && (
                            <span style={{ font: mono(500, 10.5), color: "rgba(244,244,242,0.45)", paddingLeft: 26, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{a.result}</span>
                          )}
                          {a.status === "proposed" && (
                            <div style={{ display: "flex", gap: 8, paddingLeft: 26 }}>
                              <button
                                onClick={() => decide(a, "approve")}
                                disabled={deciding === a.id}
                                style={{ padding: "6px 14px", background: "#8B7CF6", border: "none", borderRadius: 6, color: "#0B0C10", font: mono(700, 10.5), cursor: "pointer", opacity: deciding === a.id ? 0.5 : 1 }}
                              >
                                {deciding === a.id ? "…" : "APROVAR"}
                              </button>
                              <button
                                onClick={() => decide(a, "reject")}
                                disabled={deciding === a.id}
                                style={{ padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, color: "rgba(244,244,242,0.7)", font: mono(700, 10.5), cursor: "pointer" }}
                              >
                                REJEITAR
                              </button>
                            </div>
                          )}
                        </div>
                      ))}

                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ font: mono(500, 10), color: "rgba(244,244,242,0.28)" }}>{time(m.created_at)}</span>
                        {!mine && (
                          <button
                            onClick={() => speak(m.content)}
                            title="Ouvir"
                            className="hover:text-white/70 transition-colors"
                            style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", padding: 0, cursor: "pointer", font: mono(600, 10), color: "rgba(244,244,242,0.3)" }}
                          >
                            <IconPlay className="w-2.5 h-2.5" />
                            ouvir
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}

            {thinking && !talking && (
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg,#F54E00 0%,#8B7CF6 100%)", display: "flex", alignItems: "center", justifyContent: "center", font: mono(800, 11), color: "#0B0C10" }}>H</div>
                <div className="flex gap-1 items-center" style={{ padding: "10px 14px", borderRadius: "4px 14px 14px 14px", background: "#1B1D23", border: "1px solid rgba(255,255,255,0.06)" }}>
                  {[0, 1, 2].map((i) => (
                    <span key={i} className="animate-pulse" style={{ width: 6, height: 6, borderRadius: "50%", background: "rgba(244,244,242,0.5)", animationDelay: `${i * 0.2}s` }} />
                  ))}
                  <span style={{ font: mono(500, 11), color: "rgba(244,244,242,0.45)", marginLeft: 8 }}>{thinking}</span>
                </div>
              </div>
            )}
            {error && <div style={{ font: mono(500, 11.5), color: "#FF5F5F", textAlign: "center" }}>{error}</div>}

            {loaded && !thinking && messages.length < 4 && (
              <div className="flex flex-wrap gap-2 justify-center" style={{ marginTop: 4 }}>
                {SUGGESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => send({ text: q })}
                    className="hover:border-accent hover:text-white transition-colors"
                    style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.7)", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 999, padding: "7px 13px", cursor: "pointer" }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Barra da conversa por voz */}
        {talking && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 18px", borderTop: "1px solid rgba(255,255,255,0.07)", background: "rgba(61,220,132,0.04)" }}>
            <span className={conv === "hearing" || conv === "speaking" ? "animate-pulse" : ""} style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: muted ? "#FF5F5F" : statusColor }} />
            <span style={{ flex: 1, font: mono(600, 11), color: "rgba(244,244,242,0.7)" }}>{status}</span>
            <button
              onClick={toggleMute}
              title={muted ? "Ligar o microfone" : "Silenciar o microfone"}
              style={{ display: "flex", alignItems: "center", gap: 6, font: mono(700, 10), color: muted ? "#FF5F5F" : "rgba(244,244,242,0.6)", background: muted ? "rgba(255,95,95,0.1)" : "transparent", border: `1px solid ${muted ? "rgba(255,95,95,0.5)" : "rgba(255,255,255,0.14)"}`, borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}
            >
              <IconMic className="w-3.5 h-3.5" muted={muted} />
              {muted ? "LIGAR MIC" : "SILENCIAR"}
            </button>
            <button onClick={toggleConversation} style={{ font: mono(700, 10), color: "rgba(244,244,242,0.6)", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "4px 9px", cursor: "pointer" }}>
              TERMINAR
            </button>
          </div>
        )}

        {/* Compositor */}
        <div style={{ padding: "10px 14px 14px" }}>
          <div
            className="focus-within:border-accent/60 transition-colors"
            style={{ maxWidth: 780, margin: "0 auto", display: "flex", alignItems: "center", gap: 6, padding: 6, background: "#0E1014", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 12 }}
          >
            <label
              title="Foto de uma refeição"
              className="text-white/55 hover:text-accent transition-colors"
              style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 8, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
            >
              <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} disabled={busy} style={{ display: "none" }} />
              <IconCamera className="w-[18px] h-[18px]" />
            </label>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") send();
              }}
              placeholder={talking ? "em conversa por voz — também podes escrever" : "Escreve ao Holiday…"}
              style={{ flex: 1, minWidth: 0, background: "transparent", border: "none", padding: "8px 4px", color: "#F4F4F2", font: "500 13.5px Inter,sans-serif", outline: "none" }}
            />
            {canTalk && (
              <button
                onClick={toggleConversation}
                title={talking ? "Terminar conversa" : "Conversar por voz"}
                className={talking ? "text-[#FF5F5F]" : "text-white/55 hover:text-accent transition-colors"}
                style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "none", background: talking ? "rgba(255,95,95,0.12)" : "transparent", borderRadius: 8, cursor: "pointer" }}
              >
                {talking ? <IconStop className="w-4 h-4" /> : <IconMic className="w-[18px] h-[18px]" />}
              </button>
            )}
            <button
              onClick={() => send()}
              disabled={busy || !draft.trim()}
              title="Enviar"
              style={{ width: 36, height: 36, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: draft.trim() ? "#F54E00" : "rgba(255,255,255,0.06)", border: "none", borderRadius: 8, color: draft.trim() ? "#0B0C10" : "rgba(244,244,242,0.35)", cursor: "pointer", transition: "background .15s" }}
            >
              <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                <path d="M12 19 V5 M6 11 L12 5 L18 11" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Painel de contexto (computador) */}
      <aside className="hidden lg:block" style={{ width: 300, flexShrink: 0, overflowY: "auto", border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 10, padding: 18 }}>
        {contextPanel}
      </aside>
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
      part.startsWith("**") && part.endsWith("**") ? <strong key={`${k}-${i}`}>{part.slice(2, -2)}</strong> : <span key={`${k}-${i}`}>{part}</span>
    );
  const flush = (k: number) => {
    if (!list.length) return;
    out.push(
      <ul key={`ul${k}`} style={{ margin: "4px 0", paddingLeft: 18, listStyle: "disc" }}>
        {list.map((li, i) => (
          <li key={i} style={{ margin: "2px 0" }}>{inline(li, i)}</li>
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
    else if (i > 0 && i < lines.length - 1) out.push(<div key={i} style={{ height: 6 }} />);
  });
  flush(lines.length);
  return out;
}
