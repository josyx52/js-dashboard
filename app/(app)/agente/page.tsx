"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TaskCache, Integration } from "@/lib/types";

type Mode = "chat" | "calculadora" | "gtd";

interface Msg {
  role: "user" | "assistant";
  content: string;
  time: string;
}

const CAT_COLORS: Record<string, string> = {
  Deus: "#E8B93F", Saúde: "#F54E00", Família: "#8B7CF6",
  Estudo: "#36CFC9", Negócio: "#EF5DA8", Trabalho: "#4F8FF7",
};
function chipStyle(cat: string): React.CSSProperties {
  const c = CAT_COLORS[cat] || "rgba(244,244,242,0.4)";
  return { font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.03em", color: c, background: `${c}1a`, border: `1px solid ${c}40`, padding: "3px 8px", borderRadius: 3, flexShrink: 0 };
}
function nowTime() {
  return new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
}

export default function AgentePage() {
  const [mode, setMode] = useState<Mode>("chat");
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Olá. Sobre o que precisas de ajuda?", time: nowTime() },
  ]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [photoResult, setPhotoResult] = useState<{ label: string; kcal: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages, photoResult]);

  async function send() {
    const text = draft.trim();
    if (!text || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: text, time: nowTime() }]);
    setDraft("");
    setLoading(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      setMessages((p) => [...p, { role: "assistant", content: data.reply || data.error || "(erro)", time: nowTime() }]);
    } catch (e: any) {
      setMessages((p) => [...p, { role: "assistant", content: "Erro: " + e.message, time: nowTime() }]);
    } finally {
      setLoading(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setPhotoResult(null);
    try {
      const base64: string = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });
      const res = await fetch("/api/nutrition/photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: base64 }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setPhotoResult({ label: data.log.label, kcal: data.log.kcal });
    } catch (e: any) {
      setMessages((p) => [...p, { role: "assistant", content: "Erro na foto: " + e.message, time: nowTime() }]);
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const tabStyle = (active: boolean, color: string): React.CSSProperties => ({
    padding: "8px 14px", border: "none", borderBottom: `2px solid ${active ? color : "transparent"}`,
    borderRadius: 0, font: "700 10px 'JetBrains Mono',monospace", letterSpacing: "0.04em", cursor: "pointer",
    background: "transparent", color: active ? color : "rgba(244,244,242,0.4)",
  });

  return (
    <div className="flex flex-col h-screen box-border p-4 sm:p-[28px_36px]">
      <div style={{ display: "flex", gap: 6, paddingBottom: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <button onClick={() => setMode("chat")} style={tabStyle(mode === "chat", "#F4F4F2")}>CHAT</button>
        <button onClick={() => setMode("calculadora")} style={tabStyle(mode === "calculadora", "#F54E00")}>CALCULADORA</button>
        <button onClick={() => setMode("gtd")} style={tabStyle(mode === "gtd", "#8B7CF6")}>GTD</button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column", border: "1px solid rgba(255,255,255,0.08)", borderTop: "none", background: "#14161B", borderRadius: "0 0 6px 6px", overflow: "hidden" }}>
        <div ref={boxRef} style={{ flex: 1, padding: 18, display: "flex", flexDirection: "column", gap: 14, overflowY: "auto" }}>
          {mode === "calculadora" && photoResult && (
            <div style={{ alignSelf: "flex-start", maxWidth: "78%" }}>
              <div style={{ border: "1px solid rgba(245,78,0,0.3)", background: "rgba(245,78,0,0.06)", borderRadius: 8, padding: "12px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
                <span style={{ font: "600 12px Inter,sans-serif" }}>{photoResult.label}</span>
                <span style={{ font: "700 13px 'JetBrains Mono',monospace", color: "#F54E00" }}>{photoResult.kcal} kcal</span>
              </div>
            </div>
          )}
          {mode === "calculadora" && analyzing && (
            <div style={{ font: "500 12px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>a analisar…</div>
          )}

          {mode === "gtd" && <GtdFlow />}

          {mode === "chat" && messages.map((m, i) => (
            <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "70%" }}>
              <div style={{
                padding: "11px 14px", borderRadius: 6, font: "500 13px Inter,sans-serif", lineHeight: 1.45,
                background: m.role === "user" ? "#F54E00" : "#1C1E24", color: m.role === "user" ? "#0B0C10" : "#F4F4F2",
                border: m.role === "user" ? "1px solid transparent" : "1px solid rgba(255,255,255,0.08)",
              }}>
                {m.content}
              </div>
              <span style={{ font: "500 10px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.3)", marginTop: 4, display: "block" }}>{m.time}</span>
            </div>
          ))}
          {mode === "chat" && loading && (
            <div style={{ alignSelf: "flex-start", font: "500 12px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>a processar…</div>
          )}
        </div>

        {mode !== "gtd" && (
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
            {mode === "calculadora" && (
              <label style={{ width: 38, height: 38, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, cursor: "pointer" }}>
                <input ref={fileRef} type="file" accept="image/*" onChange={onFile} style={{ display: "none" }} />
                <svg viewBox="0 0 24 24" style={{ width: 16, height: 16 }}>
                  <line x1={12} y1={15} x2={12} y2={4} stroke="#F54E00" strokeWidth={1.8} strokeLinecap="round" />
                  <polyline points="7,9 12,4 17,9" fill="none" stroke="#F54E00" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                  <line x1={5} y1={19} x2={19} y2={19} stroke="#F54E00" strokeWidth={1.8} strokeLinecap="round" />
                </svg>
              </label>
            )}
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") send(); }}
              placeholder="Pergunte ao agente…"
              style={{ flex: 1, background: "#0B0C10", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "10px 12px", color: "#F4F4F2", font: "500 13px Inter,sans-serif", outline: "none" }}
            />
            <button
              onClick={send}
              disabled={loading}
              style={{ padding: "10px 18px", background: "#F54E00", border: "none", borderRadius: 4, color: "#0B0C10", font: "700 12px 'JetBrains Mono',monospace", cursor: "pointer", opacity: loading ? 0.5 : 1 }}
            >
              ENVIAR
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function GtdFlow() {
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [delegated, setDelegated] = useState<{ title: string; status: string; note?: string | null }[]>([]);
  const [delegating, setDelegating] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: t } = await supabase.from("tasks_cache").select("*").eq("status", "open").eq("delegable", true);
    setTasks((t as TaskCache[]) || []);
    const { data: i } = await supabase.from("integrations").select("id, name, description, connected, capabilities, created_at");
    setIntegrations((i as Integration[]) || []);
  }

  async function delegate(task: TaskCache, integrationId: string) {
    setDelegating(task.id);
    try {
      const res = await fetch("/api/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: task.id, integration_id: integrationId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setDelegated((p) => [
        ...p,
        {
          title: task.content,
          status: data.executed ? "AGENDADO" : "EM ANÁLISE (SIMULADO)",
          note: data.execution_note,
        },
      ]);
      await load();
    } catch (e: any) {
      window.alert("Erro: " + e.message);
    } finally {
      setDelegating(null);
    }
  }

  const boxBase: React.CSSProperties = { borderRadius: 3, padding: "3px 8px", textAlign: "center", boxSizing: "border-box" };

  return (
    <div style={{ alignSelf: "center", width: "100%", maxWidth: 820, margin: "0 auto" }}>
      <div style={{ border: "1px solid rgba(139,124,246,0.3)", background: "rgba(139,124,246,0.06)", borderRadius: 8, padding: 22, display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.05em", color: "#8B7CF6" }}>FLUXO GTD</div>

        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, font: "600 11px 'JetBrains Mono',monospace" }}>
          <div style={{ border: "1px dashed rgba(244,244,242,0.4)", borderRadius: 14, padding: "7px 20px", color: "rgba(244,244,242,0.7)" }}>&quot;STUFF&quot;</div>
          <div style={{ width: 1, height: 12, background: "rgba(244,244,242,0.25)" }} />
          <div style={{ border: "1px solid rgba(244,244,242,0.3)", borderRadius: 5, padding: "7px 20px", color: "#F4F4F2" }}>IN BOX</div>
          <div style={{ width: 1, height: 12, background: "rgba(244,244,242,0.25)" }} />
          <div style={{ border: "1px solid #F54E00", borderRadius: 5, padding: "8px 16px", color: "#F54E00", textAlign: "center", fontWeight: 700 }}>É ACIONÁVEL?</div>

          <div style={{ display: "flex", width: "100%", gap: 10, marginTop: 2 }}>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, borderRight: "1px solid rgba(244,244,242,0.15)", paddingRight: 8 }}>
              <span style={{ color: "rgba(244,244,242,0.35)", fontSize: 9 }}>NÃO</span>
              <div style={{ ...boxBase, border: "1px solid rgba(255,95,95,0.3)", color: "#FF5F5F", width: "100%" }}>Eliminar</div>
              <div style={{ ...boxBase, border: "1px solid rgba(244,244,242,0.2)", color: "rgba(244,244,242,0.6)", width: "100%" }}>Algum dia</div>
              <div style={{ ...boxBase, border: "1px solid rgba(244,244,242,0.2)", color: "rgba(244,244,242,0.6)", width: "100%" }}>Referência</div>
            </div>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              <span style={{ color: "rgba(244,244,242,0.35)", fontSize: 9 }}>SIM</span>
              <div style={{ color: "rgba(244,244,242,0.3)" }}>↓</div>
              <div style={{ border: "1px solid #8B7CF6", borderRadius: 4, padding: "5px 10px", color: "#8B7CF6", textAlign: "center", width: "100%", boxSizing: "border-box" }}>DELEGAR?</div>
              <div style={{ display: "flex", gap: 8, width: "100%" }}>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ color: "rgba(244,244,242,0.35)", fontSize: 9 }}>SIM</span>
                  <div style={{ ...boxBase, border: "1px solid rgba(139,124,246,0.4)", background: "rgba(139,124,246,0.08)", color: "#8B7CF6", width: "100%" }}>Ao agente</div>
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
                  <span style={{ color: "rgba(244,244,242,0.35)", fontSize: 9 }}>NÃO</span>
                  <div style={{ color: "rgba(244,244,242,0.3)" }}>↓</div>
                  <div style={{ border: "1px solid #36CFC9", borderRadius: 4, padding: "4px 8px", color: "#36CFC9", textAlign: "center", width: "100%", boxSizing: "border-box" }}>&lt;2 MIN?</div>
                  <div style={{ display: "flex", gap: 6, width: "100%" }}>
                    <div style={{ flex: 1, border: "1px solid rgba(245,78,0,0.4)", background: "rgba(245,78,0,0.08)", borderRadius: 3, padding: "3px 4px", color: "#F54E00", textAlign: "center" }}>Fazer agora</div>
                    <div style={{ flex: 1, border: "1px solid rgba(54,207,201,0.4)", background: "rgba(54,207,201,0.08)", borderRadius: 3, padding: "3px 4px", color: "#36CFC9", textAlign: "center" }}>Agendar</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.05em", color: "rgba(244,244,242,0.4)" }}>
            INTEGRAÇÕES CONTROLAM O QUE PODE SER DELEGADO
          </div>
          <a href="/integracoes" style={{ flexShrink: 0, padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 4, color: "rgba(244,244,242,0.7)", font: "700 10px 'JetBrains Mono',monospace", cursor: "pointer", textDecoration: "none" }}>
            GERIR INTEGRAÇÕES →
          </a>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 14 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.05em", color: "rgba(244,244,242,0.4)" }}>DELEGÁVEL</div>
            <p style={{ margin: 0, font: "500 10px Inter,sans-serif", color: "rgba(244,244,242,0.3)", lineHeight: 1.4 }}>
              Só tarefas administrativas — hábitos e estudo pessoal não entram aqui.
            </p>
            {(!tasks || tasks.length === 0) && (
              <div style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.3)" }}>nenhuma tarefa delegável</div>
            )}
            {tasks?.map((t) => {
              const connectedIntegrations = (integrations || []).filter((i) => i.connected);
              return (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#0B0C10", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, padding: "9px 12px" }}>
                  <span style={{ flex: 1, font: "500 13px Inter,sans-serif", minWidth: 0 }}>{t.content}</span>
                  {connectedIntegrations.length === 0 ? (
                    <span style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 10px", background: "transparent", border: "1px dashed rgba(244,244,242,0.2)", borderRadius: 3, color: "rgba(244,244,242,0.35)", font: "700 9px 'JetBrains Mono',monospace" }}>
                      REQUER INTEGRAÇÃO
                    </span>
                  ) : (
                    connectedIntegrations.map((i) => (
                      <button
                        key={i.id}
                        onClick={() => delegate(t, i.id)}
                        disabled={delegating === t.id}
                        style={{ flexShrink: 0, whiteSpace: "nowrap", padding: "6px 10px", background: "transparent", border: "1px solid rgba(139,124,246,0.4)", borderRadius: 3, color: "#8B7CF6", font: "700 9px 'JetBrains Mono',monospace", cursor: "pointer", opacity: delegating === t.id ? 0.5 : 1 }}
                      >
                        {delegating === t.id ? "…" : `DELEGAR (${i.name.toUpperCase()})`}
                      </button>
                    ))
                  )}
                </div>
              );
            })}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.05em", color: "rgba(244,244,242,0.4)" }}>DELEGADO AO AGENTE</div>
            {delegated.length === 0 && (
              <div style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.3)" }}>nada delegado ainda</div>
            )}
            {delegated.map((d, i) => (
              <div key={i} style={{ display: "flex", flexDirection: "column", gap: 4, background: "#0B0C10", border: "1px solid rgba(139,124,246,0.15)", borderRadius: 4, padding: "9px 12px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <span style={{ font: "500 13px Inter,sans-serif", minWidth: 0 }}>{d.title}</span>
                  <span style={{ font: "600 9px 'JetBrains Mono',monospace", color: "#8B7CF6", background: "rgba(139,124,246,0.12)", padding: "2px 6px", borderRadius: 3, flexShrink: 0, whiteSpace: "nowrap" }}>
                    {d.status}
                  </span>
                </div>
                {d.note && (
                  <span style={{ font: "500 11px Inter,sans-serif", color: "rgba(244,244,242,0.4)" }}>{d.note}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
