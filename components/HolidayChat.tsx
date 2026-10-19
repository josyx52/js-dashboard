"use client";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

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

const mono = (w: number, size: number) => `${w} ${size}px 'JetBrains Mono',monospace`;

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function HolidayChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [actions, setActions] = useState<Action[]>([]);
  const [problems, setProblems] = useState<Problem[]>([]);
  const [openArea, setOpenArea] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [thinking, setThinking] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const d = await api<{ messages: Message[]; actions: Action[]; problems: Problem[] }>("/api/holiday");
      setMessages(d.messages);
      setActions(d.actions);
      setProblems(d.problems);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages, actions, thinking]);

  async function send() {
    const text = draft.trim();
    if (!text || thinking) return;
    setDraft("");
    setError(null);
    setThinking(true);
    const tempId = "tmp-" + Date.now();
    setMessages((p) => [...p, { id: tempId, role: "user", content: text, created_at: new Date().toISOString() }]);
    try {
      const d = await api<{ message: Message; actions: Action[]; problems: Problem[] }>("/api/holiday", {
        body: { message: text },
      });
      setMessages((p) => [...p, d.message]);
      setActions((p) => [...p, ...d.actions]);
      setProblems(d.problems);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setThinking(false);
    }
  }

  async function briefing() {
    setThinking(true);
    setError(null);
    try {
      const d = await api<{ skipped?: string }>("/api/holiday/briefing?force=1", { method: "POST" });
      if (d.skipped) setError("Briefing: " + d.skipped);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setThinking(false);
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

  const todayKey = new Date().toLocaleDateString("en-CA");
  const hasBriefingToday = messages.some(
    (m) => m.role === "briefing" && new Date(m.created_at).toLocaleDateString("en-CA") === todayKey
  );

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", background: "#14161B", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
      {/* Problemas atuais (regras, sem IA) */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ font: mono(600, 10), letterSpacing: "0.06em", color: "rgba(244,244,242,0.4)" }}>AGORA</span>
          {loaded && problems.length === 0 && (
            <span style={{ font: mono(500, 11), color: "#3DDC84" }}>tudo em ordem</span>
          )}
          {problems.map((p) => {
            const a = AREA[p.area] || AREA.sistema;
            const active = openArea === p.area;
            return (
              <button
                key={p.area}
                onClick={() => setOpenArea(active ? null : p.area)}
                style={{ display: "flex", alignItems: "center", gap: 6, font: mono(600, 10.5), color: a.color, background: active ? `${a.color}22` : "transparent", border: `1px solid ${a.color}55`, borderRadius: 3, padding: "3px 8px", cursor: "pointer" }}
              >
                <span style={{ width: 6, height: 6, borderRadius: 1, background: SEV_COLOR[p.severity] }} />
                {a.label} · {p.signals.length}
              </button>
            );
          })}
          {!hasBriefingToday && loaded && (
            <button
              onClick={briefing}
              disabled={thinking}
              style={{ marginLeft: "auto", font: mono(700, 10), letterSpacing: "0.04em", color: "#F4F4F2", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 3, padding: "4px 10px", cursor: "pointer", opacity: thinking ? 0.5 : 1 }}
            >
              BRIEFING DE HOJE
            </button>
          )}
        </div>
        {openArea &&
          problems
            .filter((p) => p.area === openArea)
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
      </div>

      <div ref={boxRef} style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
        {loaded && messages.length === 0 && (
          <div style={{ font: "500 13px Inter,sans-serif", color: "rgba(244,244,242,0.45)", lineHeight: 1.5 }}>
            Olá, sou o Holiday. Vejo as tuas tarefas, rotina, refeições e peso, e penso como o Jarvis: deteto o que
            está a falhar, procuro a causa e proponho o que fazer. Registos simples (refeições, peso) faço logo; o que
            mexe no Todoist ou no calendário fica à espera da tua aprovação.
          </div>
        )}

        {messages.map((m) => {
          const mine = m.role === "user";
          const msgActions = actions.filter((a) => a.message_id === m.id);
          return (
            <div key={m.id} style={{ alignSelf: mine ? "flex-end" : "flex-start", maxWidth: mine ? "70%" : "85%", display: "flex", flexDirection: "column", gap: 6 }}>
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
                {m.content}
              </div>

              {msgActions.map((a) => (
                <div key={a.id} style={{ border: `1px solid ${a.status === "proposed" ? "rgba(139,124,246,0.4)" : "rgba(255,255,255,0.08)"}`, background: a.status === "proposed" ? "rgba(139,124,246,0.06)" : "#16181D", borderRadius: 6, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ font: mono(700, 10), color: a.status === "executed" ? "#3DDC84" : a.status === "failed" ? "#FF5F5F" : a.status === "rejected" ? "rgba(244,244,242,0.35)" : "#8B7CF6" }}>
                      {a.status === "executed" ? "✓ FEITO" : a.status === "failed" ? "✕ FALHOU" : a.status === "rejected" ? "REJEITADA" : "PARA APROVAR"}
                    </span>
                    <span style={{ flex: 1, font: "600 12.5px Inter,sans-serif", textDecoration: a.status === "rejected" ? "line-through" : undefined, color: a.status === "rejected" ? "rgba(244,244,242,0.4)" : "#F4F4F2" }}>
                      {a.summary || a.type}
                    </span>
                  </div>
                  {a.status === "proposed" && a.reason && (
                    <span style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.5)" }}>{a.reason}</span>
                  )}
                  {a.result && a.status !== "proposed" && (
                    <span style={{ font: mono(500, 10.5), color: "rgba(244,244,242,0.45)" }}>{a.result}</span>
                  )}
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

        {thinking && (
          <div style={{ alignSelf: "flex-start", font: mono(500, 12), color: "rgba(244,244,242,0.4)" }}>
            a pensar: snapshot → regras → raciocínio…
          </div>
        )}
        {error && <div style={{ font: mono(500, 11.5), color: "#FF5F5F" }}>{error}</div>}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") send();
          }}
          placeholder="Fala com o Holiday…"
          style={{ flex: 1, minWidth: 0, background: "#0B0C10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "10px 12px", color: "#F4F4F2", font: "500 13px Inter,sans-serif", outline: "none" }}
        />
        <button
          onClick={send}
          disabled={thinking || !draft.trim()}
          style={{ padding: "10px 18px", background: "#F54E00", border: "none", borderRadius: 4, color: "#0B0C10", font: mono(700, 12), cursor: "pointer", opacity: thinking || !draft.trim() ? 0.5 : 1 }}
        >
          ENVIAR
        </button>
      </div>
    </div>
  );
}
