"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Integration } from "@/lib/types";
import VoicePicker from "@/components/VoicePicker";

interface Service {
  key: string;
  name: string;
  purpose: string;
  configured: boolean;
  ok: boolean;
  detail: string;
  ms: number | null;
  setup: string;
}
interface NotionPage {
  id: string;
  title: string;
  url: string;
}
type Item = Integration & { config?: { parent_id?: string; parent_title?: string } };

const mono = (w: number, size: number) => `${w} ${size}px 'JetBrains Mono',monospace`;
const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6 };
const btn = (color = "rgba(244,244,242,0.7)"): React.CSSProperties => ({
  font: mono(700, 10), color, background: "transparent", border: `1px solid ${color === "rgba(244,244,242,0.7)" ? "rgba(255,255,255,0.14)" : color}`,
  borderRadius: 3, padding: "6px 10px", cursor: "pointer", whiteSpace: "nowrap",
});

function statusOf(s: Service) {
  if (!s.configured) return { label: "NÃO CONFIGURADO", color: "rgba(244,244,242,0.4)" };
  return s.ok ? { label: "LIGADO", color: "#3DDC84" } : { label: "COM ERRO", color: "#FF5F5F" };
}

export default function IntegracoesPage() {
  const [services, setServices] = useState<Service[] | null>(null);
  const [testing, setTesting] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [notionQ, setNotionQ] = useState("");
  const [notionResults, setNotionResults] = useState<NotionPage[] | null>(null);
  const [searching, setSearching] = useState(false);

  async function test() {
    setTesting(true);
    try {
      const d = await api<{ services: Service[] }>("/api/integrations/status");
      setServices(d.services);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setTesting(false);
    }
  }

  async function load() {
    try {
      const d = await api<{ integrations: Item[] }>("/api/integrations");
      setItems(d.integrations);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
    test();
  }, []);

  const notion = items?.find((i) => i.name.trim().toLowerCase() === "notion") || null;
  const others = (items || []).filter((i) => i !== notion);

  async function createIntegration(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const data = await api<{ validation_note?: string }>("/api/integrations", { body: { name, api_key: apiKey } });
      if (data.validation_note) setError(data.validation_note);
      setName("");
      setApiKey("");
      setShowForm(false);
      await load();
      await test();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggle(it: Item) {
    setBusyId(it.id);
    try {
      await api("/api/integrations/toggle", { body: { id: it.id, connect: !it.connected } });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(it: Item) {
    if (!window.confirm(`Apagar a integração "${it.name}"? A chave guardada é removida da app.`)) return;
    setBusyId(it.id);
    try {
      await api(`/api/integrations/${it.id}`, { method: "DELETE" });
      await load();
      await test();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  async function searchNotion(e: React.FormEvent) {
    e.preventDefault();
    setSearching(true);
    setError(null);
    try {
      const d = await api<{ results: NotionPage[] }>(`/api/integrations/notion/search?q=${encodeURIComponent(notionQ)}`);
      setNotionResults(d.results);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSearching(false);
    }
  }

  async function setDestination(p: NotionPage) {
    if (!notion) return;
    setBusyId(notion.id);
    try {
      await api(`/api/integrations/${notion.id}`, { method: "PATCH", body: { config: { parent_id: p.id.replace(/-/g, ""), parent_title: p.title } } });
      setNotionResults(null);
      setNotionQ("");
      await load();
      await test();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusyId(null);
    }
  }

  const okCount = services?.filter((s) => s.ok).length ?? 0;

  return (
    <div className="p-4 sm:p-[28px_36px] flex flex-col gap-5 max-w-[1100px]">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div style={{ font: mono(600, 10.5), letterSpacing: "0.08em", color: "rgba(244,244,242,0.4)" }}>SISTEMA</div>
          <h1 style={{ font: "700 22px Inter,sans-serif", marginTop: 2 }}>Integrações</h1>
          <p style={{ font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.5)", marginTop: 4 }}>
            {services ? `${okCount} de ${services.length} serviços a funcionar` : "a testar os serviços…"} · cada teste é feito ao vivo.
          </p>
        </div>
        <button onClick={test} disabled={testing} style={{ ...btn("#F54E00"), padding: "9px 14px", opacity: testing ? 0.5 : 1 }}>
          {testing ? "A TESTAR…" : "TESTAR TUDO"}
        </button>
      </div>

      {error && <div className="bg-red-500/10 text-red-400 border border-red-500/30 rounded px-4 py-2 font-mono text-[11.5px]">{error}</div>}

      {/* Servicos */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {(services || []).map((s) => {
          const st = statusOf(s);
          return (
            <div key={s.key} style={{ ...card, padding: "14px 16px", borderColor: s.configured && !s.ok ? "rgba(255,95,95,0.35)" : "rgba(255,255,255,0.08)" }} className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: st.color, flexShrink: 0 }} />
                <span style={{ font: "700 14px Inter,sans-serif" }}>{s.name}</span>
                <span style={{ marginLeft: "auto", font: mono(700, 9.5), color: st.color }}>{st.label}</span>
              </div>
              <div style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.55)" }}>{s.purpose}</div>
              <div style={{ font: mono(500, 11), color: s.configured && !s.ok ? "#FF8A8A" : "rgba(244,244,242,0.75)" }}>
                {s.detail}
                {s.ms !== null && <span style={{ color: "rgba(244,244,242,0.3)" }}> · {s.ms} ms</span>}
              </div>
              {(!s.configured || !s.ok) && (
                <div style={{ font: mono(500, 10), color: "rgba(244,244,242,0.35)" }}>configura em: {s.setup}</div>
              )}
            </div>
          );
        })}
        {!services &&
          Array.from({ length: 8 }).map((_, i) => (
            <div key={i} style={{ ...card, height: 96 }} className="animate-pulse" />
          ))}
      </div>

      {/* Notion */}
      <div style={{ ...card, padding: 18 }} className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <span style={{ font: "700 15px Inter,sans-serif" }}>Notion</span>
          <span style={{ font: mono(600, 10), color: "rgba(244,244,242,0.45)" }}>o Holiday pesquisa e cria páginas</span>
          {notion && (
            <div className="ml-auto flex gap-1.5">
              <button onClick={() => toggle(notion)} disabled={busyId === notion.id} style={btn(notion.connected ? "rgba(244,244,242,0.7)" : "#F54E00")}>
                {notion.connected ? "DESLIGAR" : "LIGAR"}
              </button>
              <button onClick={() => remove(notion)} disabled={busyId === notion.id} style={btn()}>APAGAR</button>
            </div>
          )}
        </div>
        {!notion && (
          <div style={{ font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.6)", lineHeight: 1.6 }}>
            1. Em <b>notion.so/my-integrations</b> cria uma integração interna e copia a chave (começa por <code>ntn_</code>).<br />
            2. No Notion, abre as páginas que o Holiday pode usar → <b>⋯ → Ligações → adiciona a integração</b>.<br />
            3. Cria abaixo uma integração com o nome <b>Notion</b> e cola a chave.
          </div>
        )}
        {notion && (
          <>
            <div style={{ font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.7)" }}>
              Páginas novas do Holiday vão para:{" "}
              <b style={{ color: notion.config?.parent_title ? "#F4F4F2" : "#E8B93F" }}>{notion.config?.parent_title || "ainda não escolhida"}</b>
            </div>
            <form onSubmit={searchNotion} className="flex gap-2">
              <input
                value={notionQ}
                onChange={(e) => setNotionQ(e.target.value)}
                placeholder="Procurar a página de destino no Notion…"
                className="flex-1 min-w-0 bg-bg border border-white/10 rounded px-3 py-2 text-[12.5px] outline-none focus:border-accent"
              />
              <button type="submit" disabled={searching} style={btn("#F54E00")}>{searching ? "…" : "PROCURAR"}</button>
            </form>
            {notionResults && (
              <div className="flex flex-col">
                {notionResults.length === 0 && (
                  <span style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.45)" }}>
                    Nada encontrado. Confirma que a página está partilhada com a integração.
                  </span>
                )}
                {notionResults.map((p) => (
                  <div key={p.id} className="flex items-center gap-3" style={{ padding: "8px 0", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
                    <span style={{ flex: 1, font: "500 12.5px Inter,sans-serif" }}>{p.title}</span>
                    <a href={p.url} target="_blank" rel="noreferrer" style={{ font: mono(600, 10), color: "rgba(244,244,242,0.4)" }}>ABRIR</a>
                    <button onClick={() => setDestination(p)} style={btn("#3DDC84")}>USAR COMO DESTINO</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <VoicePicker />

      {/* Outras */}
      <div style={card}>
        <div className="flex items-center gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ font: "700 13px Inter,sans-serif" }}>Chaves guardadas</span>
          <span style={{ font: mono(500, 10.5), color: "rgba(244,244,242,0.4)" }}>cifradas no Supabase Vault</span>
          <button onClick={() => setShowForm((s) => !s)} style={{ ...btn("#F54E00"), marginLeft: "auto" }}>+ NOVA</button>
        </div>
        {showForm && (
          <form onSubmit={createIntegration} className="flex flex-wrap gap-2" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Serviço (ex: Notion)"
              className="flex-[1_1_160px] bg-bg border border-white/10 rounded px-3 py-2 text-[12.5px] outline-none focus:border-accent" />
            <input value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="Chave da API" type="password"
              className="flex-[2_1_220px] bg-bg border border-white/10 rounded px-3 py-2 text-[12.5px] font-mono outline-none focus:border-accent" />
            <button type="submit" disabled={creating || !name.trim()} style={{ padding: "8px 14px", background: "#F54E00", border: "none", borderRadius: 4, color: "#0B0C10", font: mono(700, 11), cursor: "pointer", opacity: creating ? 0.5 : 1 }}>
              {creating ? "…" : "GUARDAR"}
            </button>
          </form>
        )}
        {items && items.length === 0 && (
          <div style={{ padding: 16, font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.4)" }}>Nenhuma chave guardada.</div>
        )}
        {[...(notion ? [notion] : []), ...others].map((it) => (
          <div key={it.id} className="flex flex-wrap items-center gap-3" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: it.connected ? "#3DDC84" : "rgba(255,255,255,0.25)" }} />
            <div className="flex-1 min-w-[160px]">
              <div style={{ font: "600 13px Inter,sans-serif" }}>{it.name}</div>
              <div style={{ font: mono(500, 10.5), color: "rgba(244,244,242,0.4)" }}>
                {it === notion ? "usada pelo Holiday" : "guardada — o Holiday ainda não sabe usar este serviço"}
              </div>
            </div>
            <button onClick={() => toggle(it)} disabled={busyId === it.id} style={btn(it.connected ? "rgba(244,244,242,0.7)" : "#F54E00")}>
              {it.connected ? "DESLIGAR" : "LIGAR"}
            </button>
            <button onClick={() => remove(it)} disabled={busyId === it.id} style={btn()}>APAGAR</button>
          </div>
        ))}
      </div>
    </div>
  );
}
