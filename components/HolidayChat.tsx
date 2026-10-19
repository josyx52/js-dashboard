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
      const d = await api<{ message: Message; actions: Action[]; problems: Problem[]; userMessage?: Message }>("/api/holiday", {
        body: { message: text, imageBase64: opts.imageBase64, voice: !!opts.voice },
      });
      setMessages((p) => [...p.map((m) => (m.id === tempId && d.userMessage ? d.userMessage : m)), d.message]);
      setActions((p) => [...p, ...d.actions]);
      setProblems(d.problems);
      if (d.actions.some((a) => a.status === "executed" && ["remember", "forget", "set_owner", "save_task_note"].includes(a.type))) {
        load(); // memoria / delegadas mudaram
      }
      if (voiceOn && !opts.voice) speak(d.message.content);
      return d.message.content;
    } catch (e: any) {
      setError(e.message);
      return opts.voice ? "Desculpa, falhou aqui do meu lado. Podes repetir?" : null;
    } finally {
      setThinking(null);
    }
  }
  sendRef.current = send;

  function toggleConversation() {
    if (convRef.current) {
      convRef.current.stop();
      convRef.current = null;
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

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, overflow: "hidden" }}>
      {/* Cabecalho: problemas atuais (regras), memoria, delegadas, voz, briefing */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: mono(800, 12), color: "#F4F4F2", marginRight: 4 }}>HOLIDAY</span>
          {loaded && problems.length === 0 && <span style={{ font: mono(500, 11), color: "#3DDC84" }}>tudo em ordem</span>}
          {problems.map((p) => {
            const a = AREA[p.area] || AREA.sistema;
            return (
              <button key={p.area} onClick={() => setPanel(panel === p.area ? null : p.area)} style={chip(a.color, panel === p.area)}>
                <span style={{ width: 6, height: 6, borderRadius: 1, background: SEV_COLOR[p.severity] }} />
                {a.label} · {p.signals.length}
              </button>
            );
          })}
          <span style={{ flex: 1 }} />
          <button onClick={() => setPanel(panel === "delegadas" ? null : "delegadas")} style={chip("#8B7CF6", panel === "delegadas")}>
            DELEGADAS · {delegated.length}
          </button>
          <button onClick={() => setPanel(panel === "memoria" ? null : "memoria")} style={chip("#36CFC9", panel === "memoria")}>
            MEMÓRIA · {memories.length}
          </button>
          <button onClick={toggleVoice} title="Ler as respostas em voz alta" style={chip(voiceOn ? "#3DDC84" : "rgba(244,244,242,0.5)", voiceOn)}>
            <IconSpeaker className="w-3.5 h-3.5" muted={!voiceOn} />
            VOZ
          </button>
          {!hasBriefingToday && loaded && (
            <button onClick={briefing} disabled={busy} style={{ ...chip("#E8B93F"), opacity: busy ? 0.5 : 1 }}>
              BRIEFING
            </button>
          )}
        </div>

        {panel && AREA[panel] &&
          problems
            .filter((p) => p.area === panel)
            .flatMap((p) => p.signals)
            .map((s) => (
              <div key={s.id} style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.75)", display: "flex", gap: 8 }}>
                <span style={{ color: SEV_COLOR[s.severity], font: mono(700, 10), flexShrink: 0, paddingTop: 2 }}>{s.severity.toUpperCase()}</span>
                <span>
                  {s.title}
                  {s.detail && <span style={{ color: "rgba(244,244,242,0.4)" }}> — {s.detail}</span>}
                </span>
              </div>
            ))}

        {panel === "delegadas" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {delegated.length === 0 && (
              <span style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.45)" }}>
                Nenhuma tarefa delegada. Diz, por exemplo: “Holiday, fica tu com a tabela de preços”.
              </span>
            )}
            {delegated.map((t) => (
              <div key={t.id} style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.8)" }}>
                <span style={{ font: mono(700, 10), color: t.note ? "#3DDC84" : "#E8B93F", marginRight: 8 }}>{t.note ? "EM CURSO" : "POR COMEÇAR"}</span>
                {t.title}
                {t.note && (
                  <div style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.45)", whiteSpace: "pre-wrap", marginTop: 2, paddingLeft: 2 }}>
                    {t.note.split("\n").slice(-2).join("\n")}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {panel === "memoria" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {memories.length === 0 && (
              <span style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.45)" }}>
                Ainda não guardei nada de longo prazo. Vou aprendendo com as conversas e com os padrões do teu histórico.
              </span>
            )}
            {memories.map((m) => (
              <div key={m.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.8)" }}>
                <span style={{ font: mono(700, 10), color: "#36CFC9", flexShrink: 0, paddingTop: 2, width: 78 }}>{KIND_LABEL[m.kind].toUpperCase()}</span>
                <span style={{ flex: 1 }}>{m.content}</span>
                <button onClick={() => forget(m)} title="Esquecer" style={{ background: "transparent", border: "none", color: "rgba(244,244,242,0.35)", cursor: "pointer", font: mono(700, 12) }}>
                  ✕
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div ref={boxRef} style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        {loaded && messages.length === 0 && (
          <div style={{ font: "500 13px Inter,sans-serif", color: "rgba(244,244,242,0.45)", lineHeight: 1.55 }}>
            Olá, sou o Holiday. Penso como o Jarvis: vejo as tuas tarefas, rotina, refeições e peso, comparo com o teu
            histórico, lembro-me do que me dizes e procuro a causa do que está a falhar. Podes escrever, falar comigo
            pelo microfone ou mandar a foto de um prato. Diz-me que tarefas ficam contigo e quais queres que eu faça.
          </div>
        )}

        {messages.map((m) => {
          const mine = m.role === "user";
          const msgActions = actions.filter((a) => a.message_id === m.id);
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: mine ? "75%" : "88%", display: "flex", flexDirection: "column", gap: 6 }}>
              {m.role === "briefing" && (
                <span style={{ font: mono(700, 10), letterSpacing: "0.06em", color: "#E8B93F" }}>
                  BRIEFING · {new Date(m.created_at).toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" })}
                </span>
              )}
              <div
                style={{
                  padding: "11px 14px", borderRadius: 6, font: "500 13px Inter,sans-serif", lineHeight: 1.5, whiteSpace: "pre-wrap",
                  background: mine ? "#F54E00" : "#1C1E24", color: mine ? "#0B0C10" : "#F4F4F2",
                  border: mine ? "1px solid transparent" : m.role === "briefing" ? "1px solid rgba(232,185,63,0.3)" : "1px solid rgba(255,255,255,0.08)",
                }}
              >
                {m.content.startsWith("📷") ? (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <IconCamera className="w-4 h-4 flex-none" />
                    {m.content.slice(2).trim() || "foto"}
                  </span>
                ) : (
                  m.content
                )}
              </div>
              {!mine && (
                <button
                  onClick={() => speak(m.content)}
                  title="Ouvir"
                  style={{ alignSelf: "flex-start", display: "flex", alignItems: "center", gap: 4, background: "transparent", border: "none", padding: 0, cursor: "pointer", font: mono(600, 10), color: "rgba(244,244,242,0.3)" }}
                >
                  <IconPlay className="w-2.5 h-2.5" />
                  ouvir
                </button>
              )}

              {msgActions.map((a) => (
                <div key={a.id} style={{ border: `1px solid ${a.status === "proposed" ? "rgba(139,124,246,0.4)" : "rgba(255,255,255,0.08)"}`, background: a.status === "proposed" ? "rgba(139,124,246,0.06)" : "#16181D", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ font: mono(700, 10), flexShrink: 0, color: a.status === "executed" ? "#3DDC84" : a.status === "failed" ? "#FF5F5F" : a.status === "rejected" ? "rgba(244,244,242,0.35)" : "#8B7CF6" }}>
                      {a.status === "executed" ? "✓ FEITO" : a.status === "failed" ? "✕ FALHOU" : a.status === "rejected" ? "REJEITADA" : "PARA APROVAR"}
                    </span>
                    <span style={{ flex: 1, font: "600 12.5px Inter,sans-serif", textDecoration: a.status === "rejected" ? "line-through" : undefined, color: a.status === "rejected" ? "rgba(244,244,242,0.4)" : "#F4F4F2" }}>
                      {a.summary || a.type}
                    </span>
                  </div>
                  {a.status === "proposed" && a.reason && (
                    <span style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.5)" }}>{a.reason}</span>
                  )}
                  {a.result && a.status !== "proposed" && <span style={{ font: mono(500, 10.5), color: "rgba(244,244,242,0.45)" }}>{a.result}</span>}
                  {a.status === "proposed" && (
                    <div style={{ display: "flex", gap: 8 }}>
                      <button
                        onClick={() => decide(a, "approve")}
                        disabled={deciding === a.id}
                        style={{ padding: "6px 14px", background: "#8B7CF6", border: "none", borderRadius: 4, color: "#0B0C10", font: mono(700, 10.5), cursor: "pointer", opacity: deciding === a.id ? 0.5 : 1 }}
                      >
                        {deciding === a.id ? "…" : "APROVAR"}
                      </button>
                      <button
                        onClick={() => decide(a, "reject")}
                        disabled={deciding === a.id}
                        style={{ padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 4, color: "rgba(244,244,242,0.7)", font: mono(700, 10.5), cursor: "pointer" }}
                      >
                        REJEITAR
                      </button>
                    </div>
                  )}
                </div>
              ))}

              <span style={{ font: mono(500, 10), color: "rgba(244,244,242,0.3)", alignSelf: mine ? "flex-end" : "flex-start" }}>{time(m.created_at)}</span>
            </div>
          );
        })}

        {thinking && !talking && <div style={{ alignSelf: "flex-start", font: mono(500, 12), color: "rgba(244,244,242,0.4)" }}>{thinking}</div>}
        {error && <div style={{ font: mono(500, 11.5), color: "#FF5F5F" }}>{error}</div>}
      </div>

      {talking && (
        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 14px", borderTop: "1px solid rgba(255,255,255,0.08)", background: "rgba(61,220,132,0.05)" }}>
          <span
            className={conv === "hearing" || conv === "speaking" ? "animate-pulse" : ""}
            style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: conv === "hearing" ? "#F54E00" : conv === "speaking" ? "#8B7CF6" : conv === "thinking" ? "#E8B93F" : "#3DDC84" }}
          />
          <span style={{ flex: 1, font: mono(600, 11), color: "rgba(244,244,242,0.7)" }}>{CONV_LABEL[conv]}</span>
          <button onClick={toggleConversation} style={{ font: mono(700, 10), color: "rgba(244,244,242,0.5)", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 3, padding: "3px 8px", cursor: "pointer" }}>
            TERMINAR
          </button>
        </div>
      )}
      <div style={{ display: "flex", alignItems: "center", gap: 8, padding: 12, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <label
          title="Foto de uma refeição"
          className="text-white/60 hover:text-accent hover:border-accent transition-colors"
          style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, cursor: busy ? "default" : "pointer", opacity: busy ? 0.5 : 1 }}
        >
          <input ref={fileRef} type="file" accept="image/*" onChange={onPhoto} disabled={busy} style={{ display: "none" }} />
          <IconCamera className="w-[18px] h-[18px]" />
        </label>
        {canTalk && (
          <button
            onClick={toggleConversation}
            title={talking ? "Terminar conversa" : "Conversar por voz"}
            className={talking ? "text-[#FF5F5F]" : "text-white/60 hover:text-accent transition-colors"}
            style={{ width: 40, height: 40, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", border: talking ? "1px solid #FF5F5F" : "1px solid rgba(255,255,255,0.14)", background: talking ? "rgba(255,95,95,0.12)" : "transparent", borderRadius: 6, cursor: "pointer" }}
          >
            {talking ? <IconStop className="w-4 h-4" /> : <IconMic className="w-[18px] h-[18px]" />}
          </button>
        )}
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder={talking ? "em conversa por voz — também podes escrever" : "Fala com o Holiday…"}
          style={{ flex: 1, minWidth: 0, background: "#0B0C10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "10px 12px", color: "#F4F4F2", font: "500 13px Inter,sans-serif", outline: "none" }}
        />
        <button
          onClick={() => send()}
          disabled={busy || !draft.trim()}
          style={{ padding: "10px 16px", background: "#F54E00", border: "none", borderRadius: 4, color: "#0B0C10", font: mono(700, 12), cursor: "pointer", opacity: busy || !draft.trim() ? 0.5 : 1 }}
        >
          ENVIAR
        </button>
      </div>
    </div>
  );
}
