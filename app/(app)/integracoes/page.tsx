"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Integration, IntegrationTool } from "@/lib/types";
import { IconPlug, IconFlask } from "@/components/icons";

export default function IntegracoesPage() {
  const [items, setItems] = useState<Integration[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false);

  const [togglingId, setTogglingId] = useState<string | null>(null);

  const [labFor, setLabFor] = useState<Integration | null>(null);
  const [labTools, setLabTools] = useState<IntegrationTool[] | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const { data, error } = await supabase
      .from("integrations")
      .select("id, name, description, connected, capabilities, created_at")
      .order("created_at", { ascending: false });
    if (error) setError(error.message);
    else setItems(data as Integration[]);
  }

  async function createIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, api_key: apiKey }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.validation_note) setError(data.validation_note); // aviso, nao bloqueia
      setName("");
      setApiKey("");
      setShowForm(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(item: Integration) {
    setTogglingId(item.id);
    try {
      const res = await fetch("/api/integrations/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id, connect: !item.connected }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTogglingId(null);
    }
  }

  async function openLab(item: Integration) {
    setLabFor(item);
    setLabTools(null);
    const { data } = await supabase
      .from("integration_tools")
      .select("*")
      .eq("integration_id", item.id);
    setLabTools((data as IntegrationTool[]) || []);
  }

  if (labFor) {
    return (
      <div className="p-4 sm:p-[28px_36px] max-w-[720px] flex flex-col gap-4">
        <button
          onClick={() => setLabFor(null)}
          className="self-start px-3.5 py-1.5 bg-transparent border border-border rounded text-[11px] font-mono font-semibold text-muted hover:text-lab hover:border-lab/50 transition-colors"
        >
          ← VOLTAR
        </button>
        <div className="flex items-center gap-2.5">
          <IconFlask className="w-5 h-5" color="#8B7CF6" />
          <h2 className="text-xl font-bold m-0">Laboratório · {labFor.name}</h2>
        </div>
        <p className="text-[12px] text-muted m-0">
          Tools que a IA gerou automaticamente para o agente atuar sobre esta integração.
        </p>
        <div className="flex flex-col gap-2.5">
          {labTools === null && <div className="text-faint text-[13px]">a carregar…</div>}
          {labTools && labTools.length === 0 && (
            <div className="text-faint text-[13px]">
              Ainda sem tools — liga a integração para as gerar automaticamente.
            </div>
          )}
          {labTools?.map((t) => (
            <div key={t.id} className="border border-lab/20 bg-lab/[0.05] rounded-md px-4.5 py-4">
              <div className="font-mono font-bold text-[13px] text-white">{t.name}</div>
              <div className="text-[12px] text-white/50 mt-1 leading-relaxed">{t.description}</div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-[28px_36px] max-w-[720px] flex flex-col gap-3.5">
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setShowForm((s) => !s)}
          className="px-4 py-2 bg-accent border-none rounded text-bg font-mono font-bold text-[11px]"
        >
          + NOVA INTEGRAÇÃO
        </button>
      </div>

      {error && <div className="text-red-400 text-[12px]">{error}</div>}

      {showForm && (
        <form
          onSubmit={createIntegration}
          className="border border-accent/30 bg-accent/[0.06] rounded-md px-5 py-4.5 flex flex-col gap-2.5"
        >
          <div className="font-mono font-semibold text-[11px] tracking-wide text-accent">
            NOVA INTEGRAÇÃO
          </div>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nome do serviço (ex: Notion)"
            className="bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] outline-none focus:border-accent"
          />
          <input
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="API key"
            type="password"
            className="bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent"
          />
          <button
            type="submit"
            disabled={creating}
            className="p-2.5 bg-accent border-none rounded text-bg font-mono font-bold text-[12px] disabled:opacity-50"
          >
            {creating ? "a criar…" : "CRIAR INTEGRAÇÃO"}
          </button>
        </form>
      )}

      {items === null && <div className="text-faint text-[13px]">a carregar…</div>}
      {items && items.length === 0 && (
        <div className="text-faint text-[13px]">Nenhuma integração ainda — cria a primeira acima.</div>
      )}

      {items?.map((it) => (
        <div
          key={it.id}
          className="border border-border bg-surface rounded-md px-4 py-4 sm:px-5 sm:py-4.5 flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4"
        >
          <div
            className="w-2 h-2 rounded-full flex-none"
            style={{ background: it.connected ? "#3DDC84" : "rgba(255,255,255,0.25)" }}
          />
          <div className="flex-1 min-w-[140px]">
            <div className="font-bold text-[14px]">{it.name}</div>
            <div className="text-[12px] text-muted mt-0.5">{it.description || "sem descrição"}</div>
          </div>
          <span
            className="font-mono font-semibold text-[10px] flex-none order-3 sm:order-none"
            style={{ color: it.connected ? "#3DDC84" : "rgba(244,244,242,0.4)" }}
          >
            {it.connected ? "CONECTADO" : "NÃO CONECTADO"}
          </span>
          <div className="flex items-center gap-2 flex-none order-4 sm:order-none ml-auto sm:ml-0">
            <button
              onClick={() => toggle(it)}
              disabled={togglingId === it.id}
              className="px-3.5 py-1.5 rounded text-[11px] font-mono font-semibold border transition-colors disabled:opacity-50 whitespace-nowrap"
              style={
                it.connected
                  ? { borderColor: "rgba(255,255,255,0.14)", color: "rgba(244,244,242,0.6)" }
                  : { borderColor: "#F54E00", color: "#F54E00" }
              }
            >
              {togglingId === it.id ? "…" : it.connected ? "DESCONECTAR" : "CONECTAR"}
            </button>
            <button
              onClick={() => openLab(it)}
              title="Abrir laboratório"
              className="w-[34px] h-[34px] flex-none flex items-center justify-center bg-transparent border border-lab/40 rounded-md hover:border-lab transition-colors"
            >
              <IconFlask className="w-[15px] h-[15px]" color="#8B7CF6" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
