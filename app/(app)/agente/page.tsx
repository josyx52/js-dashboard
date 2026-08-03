"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { TaskCache, Integration } from "@/lib/types";

type Mode = "chat" | "calculadora" | "gtd";

interface Msg {
  role: "user" | "assistant";
  content: string;
}

export default function AgentePage() {
  const [mode, setMode] = useState<Mode>("chat");

  return (
    <div className="p-[28px_36px] flex flex-col gap-4 h-screen box-border">
      <div className="flex gap-2 flex-none">
        {(["chat", "calculadora", "gtd"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={
              "px-4 py-2 rounded font-mono font-bold text-[11px] tracking-[0.05em] uppercase border transition-colors " +
              (mode === m
                ? "bg-accent border-accent text-bg"
                : "bg-transparent border-white/[0.14] text-white/60 hover:border-white/30")
            }
          >
            {m}
          </button>
        ))}
      </div>
      {mode === "chat" && <ChatTab />}
      {mode === "calculadora" && <CalculadoraTab />}
      {mode === "gtd" && <GtdTab />}
    </div>
  );
}

function ChatTab() {
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", content: "Olá. Sobre o que precisas de ajuda?" },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight });
  }, [messages]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((p) => [...p, { role: "user", content: text }]);
    setInput("");
    setLoading(true);
    try {
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text, history }),
      });
      const data = await res.json();
      setMessages((p) => [...p, { role: "assistant", content: data.reply || data.error || "(erro)" }]);
    } catch (e: any) {
      setMessages((p) => [...p, { role: "assistant", content: "Erro: " + e.message }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 border border-white/[0.08] bg-surface rounded-md flex flex-col overflow-hidden">
      <div ref={boxRef} className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
        {messages.map((m, i) => (
          <div
            key={i}
            className={"max-w-[75%] px-3.5 py-[11px] rounded-md text-[13px] leading-[1.45] font-medium " + (m.role === "user" ? "self-end" : "self-start")}
            style={
              m.role === "user"
                ? { background: "#F54E00", color: "#0B0C10" }
                : { background: "#1C1E24", color: "#F4F4F2", border: "1px solid rgba(255,255,255,0.08)" }
            }
          >
            {m.content}
          </div>
        ))}
        {loading && <div className="self-start text-white/35 text-[12.5px] font-mono">a processar…</div>}
      </div>
      <form onSubmit={send} className="flex gap-2 p-4 border-t border-white/[0.08]">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Escreve aqui…"
          disabled={loading}
          className="flex-1 bg-bg border border-white/10 rounded px-3.5 py-2.5 text-[13.5px] outline-none focus:border-accent"
        />
        <button
          type="submit"
          disabled={loading}
          className="px-5 py-2.5 bg-accent border-none rounded text-bg font-mono font-bold text-[12px] disabled:opacity-50"
        >
          ENVIAR
        </button>
      </form>
    </div>
  );
}

function CalculadoraTab() {
  const [result, setResult] = useState<{ label: string; kcal: number } | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setAnalyzing(true);
    setError(null);
    setResult(null);
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
      setResult({ label: data.log.label, kcal: data.log.kcal });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <div className="flex-1 border border-white/[0.08] bg-surface rounded-md p-6 flex flex-col gap-4 items-start">
      <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
        CALCULADORA DE CALORIAS
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={onPhoto}
        disabled={analyzing}
        className="text-[12.5px] text-white/60 file:mr-3 file:py-2 file:px-4 file:rounded file:border-0 file:font-mono file:font-bold file:text-[11px] file:bg-accent file:text-bg"
      />
      {analyzing && <div className="font-mono text-[12px] text-white/50">a analisar…</div>}
      {error && <div className="font-mono text-[12px] text-red-400">{error}</div>}
      {result && (
        <div className="border border-accent/30 bg-accent/[0.06] rounded-md px-5 py-4 w-full max-w-sm">
          <div className="font-sans font-bold text-[14px]">{result.label}</div>
          <div className="font-mono font-bold text-[22px] text-accent mt-1">{result.kcal} kcal</div>
        </div>
      )}
    </div>
  );
}

function GtdTab() {
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [integrations, setIntegrations] = useState<Integration[] | null>(null);
  const [delegating, setDelegating] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data: t } = await supabase
      .from("tasks_cache")
      .select("*")
      .eq("status", "open")
      .eq("delegable", true);
    setTasks((t as TaskCache[]) || []);
    const { data: i } = await supabase.from("integrations").select("*").eq("connected", true);
    setIntegrations((i as Integration[]) || []);
  }

  async function delegate(taskId: string, integrationId: string) {
    setDelegating(taskId);
    setMsg(null);
    try {
      const res = await fetch("/api/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId, integration_id: integrationId }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg(`Delegado — tool escolhida: ${data.chosen_tool || "n/a"}`);
    } catch (e: any) {
      setMsg("Erro: " + e.message);
    } finally {
      setDelegating(null);
    }
  }

  const steps = [
    "Stuff (tudo o que entra)",
    "Inbox",
    "É acionável?",
    "Eliminar / Algum dia / Referência — ou Delegar?",
    "Ao agente, ou < 2 min?",
    "Fazer agora / Agendar",
  ];

  return (
    <div className="flex-1 min-h-0 overflow-y-auto flex flex-col gap-5">
      <div className="border border-white/[0.08] bg-surface rounded-md p-5">
        <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40 mb-4">
          FLUXO GTD
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className="border border-white/[0.12] rounded px-3 py-2 text-[12px] font-sans font-medium bg-bg">
                {s}
              </div>
              {i < steps.length - 1 && <span className="text-white/25">→</span>}
            </div>
          ))}
        </div>
      </div>

      {msg && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded px-4 py-2 font-mono text-[11.5px] text-white/60">
          {msg}
        </div>
      )}

      <div className="border border-white/[0.08] bg-surface rounded-md overflow-hidden">
        <div className="px-[18px] py-[14px] border-b border-white/[0.08] font-sans font-bold text-[13px]">
          Tarefas delegáveis
        </div>
        <div className="flex flex-col">
          {(!tasks || tasks.length === 0) && (
            <div className="px-[18px] py-4 text-[12.5px] text-white/35 font-sans">
              nenhuma tarefa delegável (só Negócio/Trabalho contam)
            </div>
          )}
          {tasks?.map((t) => (
            <div key={t.id} className="flex items-center gap-3 px-[18px] py-[13px] border-b border-white/[0.05] last:border-none flex-wrap">
              <span className="flex-1 min-w-[200px] font-sans font-medium text-[13px]">{t.content}</span>
              {integrations && integrations.length === 0 ? (
                <span className="font-mono font-bold text-[10px] px-2.5 py-1 rounded bg-red-500/10 text-red-400">
                  REQUER INTEGRAÇÃO
                </span>
              ) : (
                integrations?.map((i) => (
                  <button
                    key={i.id}
                    onClick={() => delegate(t.id, i.id)}
                    disabled={delegating === t.id}
                    className="font-mono font-bold text-[10px] px-2.5 py-1 rounded border border-accent/40 text-accent hover:bg-accent/10 disabled:opacity-50"
                  >
                    {delegating === t.id ? "…" : `DELEGAR A ${i.name.toUpperCase()}`}
                  </button>
                ))
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
