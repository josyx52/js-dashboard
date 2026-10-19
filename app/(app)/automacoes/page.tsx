"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { addDays, localDateKey } from "@/lib/dates";

type Kind = "lembrete" | "analise" | "trabalho";
type Filter = "todas" | Kind | "sistema";

interface Automation {
  id: string;
  name: string;
  kind: Kind;
  prompt: string;
  days: number[];
  time: string;
  active: boolean;
  created_by: "eu" | "holiday";
  last_run_at: string | null;
}
interface Run {
  status: "ok" | "falhou" | "perdida";
  result: string | null;
  ran_at: string;
}
interface Occ {
  automation_id: string;
  date: string;
  at: string;
  run: Run | null;
}
interface SystemAuto {
  name: string;
  detail: string;
  time: string;
}

const KIND: Record<Kind | "sistema", { label: string; color: string }> = {
  lembrete: { label: "Lembrete", color: "#36CFC9" },
  analise: { label: "Análise", color: "#8B7CF6" },
  trabalho: { label: "Trabalho", color: "#F54E00" },
  sistema: { label: "Sistema", color: "rgba(244,244,242,0.55)" },
};
const DAY_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // semana a comecar a segunda
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);

const mono = (w: number, size: number) => `${w} ${size}px 'JetBrains Mono',monospace`;
const card: React.CSSProperties = { border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6 };

function mondayOf(date: string): string {
  const wd = new Date(date + "T12:00:00Z").getUTCDay();
  return addDays(date, wd === 0 ? -6 : 1 - wd);
}
function fmtDay(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-PT", { day: "2-digit", month: "short" });
}
function daysText(days: number[]) {
  if (days.length === 7) return "todos os dias";
  if (days.join() === "1,2,3,4,5") return "dias úteis";
  if (days.join() === "0,6") return "fim de semana";
  return DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_SHORT[d].toLowerCase()).join(", ");
}

const EMPTY = { id: "", name: "", kind: "lembrete" as Kind, prompt: "", days: [1, 2, 3, 4, 5], time: "09:00" };

export default function AutomacoesPage() {
  const today = localDateKey();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [autos, setAutos] = useState<Automation[]>([]);
  const [occ, setOcc] = useState<Occ[]>([]);
  const [system, setSystem] = useState<SystemAuto[]>([]);
  const [filter, setFilter] = useState<Filter>("todas");
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Occ | null>(null);

  async function load() {
    try {
      const d = await api<{ automations: Automation[]; occurrences: Occ[]; system: SystemAuto[] }>(
        `/api/automations?from=${weekStart}&to=${addDays(weekStart, 6)}`
      );
      setAutos(d.automations);
      setOcc(d.occurrences);
      setSystem(d.system);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [weekStart]);

  const byId = useMemo(() => new Map(autos.map((a) => [a.id, a])), [autos]);
  const q = query.trim().toLowerCase();
  const matches = (name: string, kind: Kind | "sistema") =>
    (filter === "todas" || filter === kind) && (!q || name.toLowerCase().includes(q));

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const nowIso = new Date().toISOString();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const body = { name: editing.name, kind: editing.kind, prompt: editing.prompt, days: editing.days, time: editing.time };
      if (editing.id) await api(`/api/automations/${editing.id}`, { method: "PATCH", body });
      else await api("/api/automations", { body });
      setEditing(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: Automation) {
    setBusyId(a.id);
    try {
      await api(`/api/automations/${a.id}`, { method: "PATCH", body: { active: !a.active } });
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: Automation) {
    if (!window.confirm(`Apagar a automação "${a.name}"?`)) return;
    setBusyId(a.id);
    try {
      await api(`/api/automations/${a.id}`, { method: "DELETE" });
      setSelected(null);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(a: Automation) {
    setBusyId(a.id);
    setNotice(null);
    try {
      await api(`/api/automations/${a.id}/run`, { method: "POST" });
      setNotice(`"${a.name}" correu agora — o resultado está no chat do Holiday.`);
      await load();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const status = (o: Occ, a: Automation) => {
    if (o.run?.status === "ok") return { label: "FEITA", color: "#3DDC84" };
    if (o.run?.status === "falhou") return { label: "FALHOU", color: "#FF5F5F" };
    if (o.run?.status === "perdida") return { label: "PERDIDA", color: "rgba(244,244,242,0.4)" };
    if (!a.active) return { label: "PAUSADA", color: "rgba(244,244,242,0.35)" };
    return o.at < nowIso ? { label: "A CORRER", color: "#E8B93F" } : { label: "AGENDADA", color: "rgba(244,244,242,0.45)" };
  };

  const chip = (active: boolean, color: string): React.CSSProperties => ({
    font: mono(600, 10.5), color: active ? "#0B0C10" : color, background: active ? color : "transparent",
    border: `1px solid ${active ? color : "rgba(255,255,255,0.12)"}`, borderRadius: 3, padding: "5px 10px", cursor: "pointer", whiteSpace: "nowrap",
  });

  return (
    <div className="p-4 sm:p-[28px_36px] flex flex-col gap-5">
      {/* Cabecalho */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div style={{ font: mono(600, 10.5), letterSpacing: "0.08em", color: "rgba(244,244,242,0.4)" }}>HOLIDAY</div>
          <h1 style={{ font: "700 22px Inter,sans-serif", marginTop: 2 }}>Automações</h1>
          <p style={{ font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.5)", marginTop: 4 }}>
            O que o Holiday faz sozinho, dia a dia. Também podes pedir-lhe no chat: “lembra-me todas as noites às 21h de registar o jantar”.
          </p>
        </div>
        <button
          onClick={() => setEditing({ ...EMPTY })}
          style={{ padding: "9px 16px", background: "#F54E00", border: "none", borderRadius: 4, color: "#0B0C10", font: mono(700, 11), cursor: "pointer" }}
        >
          + NOVA AUTOMAÇÃO
        </button>
      </div>

      {error && <div className="bg-red-500/10 text-red-400 border border-red-500/30 rounded px-4 py-2 font-mono text-[11.5px]">{error}</div>}
      {notice && <div className="bg-white/[0.04] border border-white/[0.08] rounded px-4 py-2 font-mono text-[11.5px] text-white/60">{notice}</div>}

      {/* Barra de filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 mr-2">
          <button onClick={() => setWeekStart(addDays(weekStart, -7))} style={chip(false, "rgba(244,244,242,0.7)")} aria-label="Semana anterior">‹</button>
          <span style={{ font: mono(600, 11.5), color: "#F4F4F2", padding: "0 8px", minWidth: 128, textAlign: "center" }}>
            {fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 6))}
          </span>
          <button onClick={() => setWeekStart(addDays(weekStart, 7))} style={chip(false, "rgba(244,244,242,0.7)")} aria-label="Semana seguinte">›</button>
          {weekStart !== mondayOf(today) && (
            <button onClick={() => setWeekStart(mondayOf(today))} style={{ ...chip(false, "#F54E00"), marginLeft: 4 }}>HOJE</button>
          )}
        </div>
        {(["todas", "lembrete", "analise", "trabalho", "sistema"] as Filter[]).map((f) => (
          <button key={f} onClick={() => setFilter(f)} style={chip(filter === f, f === "todas" ? "#F4F4F2" : KIND[f].color)}>
            {f === "todas" ? "Todas" : KIND[f].label}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Filtrar por nome…"
          className="ml-auto w-full sm:w-[220px] bg-bg border border-white/10 rounded px-3 py-[7px] text-[12px] font-mono outline-none focus:border-accent"
        />
      </div>

      {/* Sistema: sempre a correr */}
      {matches("Sistema", "sistema") && (filter === "sistema" || filter === "todas") && (
        <div style={{ ...card, padding: "12px 16px" }} className="flex flex-wrap gap-x-6 gap-y-2 items-center">
          <span style={{ font: mono(600, 10), letterSpacing: "0.06em", color: "rgba(244,244,242,0.4)" }}>SEMPRE ATIVAS</span>
          {system
            .filter((s) => !q || s.name.toLowerCase().includes(q))
            .map((s) => (
              <span key={s.name} style={{ font: "500 12px Inter,sans-serif", color: "rgba(244,244,242,0.75)" }}>
                <span style={{ font: mono(700, 10.5), color: KIND.sistema.color, marginRight: 6 }}>{s.time}</span>
                {s.name}
                <span style={{ color: "rgba(244,244,242,0.35)" }}> · {s.detail}</span>
              </span>
            ))}
        </div>
      )}

      {/* Agenda da semana */}
      <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
        {week.map((date) => {
          const isToday = date === today;
          const items = occ
            .filter((o) => o.date === date)
            .map((o) => ({ o, a: byId.get(o.automation_id)! }))
            .filter(({ a }) => a && matches(a.name, a.kind));
          const briefing = matches("Briefing do dia", "sistema") && (filter === "todas" || filter === "sistema");
          return (
            <div key={date} style={{ ...card, borderColor: isToday ? "rgba(245,78,0,0.45)" : "rgba(255,255,255,0.08)", minHeight: 120 }} className="flex flex-col">
              <div style={{ padding: "10px 12px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ font: mono(700, 11), color: isToday ? "#F54E00" : "rgba(244,244,242,0.6)" }}>{DAY_SHORT[new Date(date + "T12:00:00Z").getUTCDay()]}</span>
                <span style={{ font: mono(500, 11), color: "rgba(244,244,242,0.35)" }}>{date.slice(8, 10)}</span>
                {isToday && <span style={{ marginLeft: "auto", font: mono(700, 9), color: "#F54E00" }}>HOJE</span>}
              </div>
              <div className="flex flex-col gap-1.5 p-2">
                {briefing && (
                  <div style={{ padding: "7px 8px", borderRadius: 4, background: "rgba(255,255,255,0.025)", boxShadow: `inset 2px 0 0 ${KIND.sistema.color}` }}>
                    <div style={{ font: mono(700, 10.5), color: "rgba(244,244,242,0.55)" }}>07:00</div>
                    <div style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.6)" }}>Briefing do dia</div>
                  </div>
                )}
                {items.map(({ o, a }) => {
                  const st = status(o, a);
                  const time = new Date(o.at).toLocaleTimeString("pt-PT", { timeZone: "Europe/Lisbon", hour: "2-digit", minute: "2-digit" });
                  return (
                    <button
                      key={o.automation_id + o.at}
                      onClick={() => setSelected(o)}
                      className="text-left hover:bg-white/[0.05] transition-colors"
                      style={{ padding: "7px 8px", borderRadius: 4, background: "rgba(255,255,255,0.03)", border: "none", boxShadow: `inset 2px 0 0 ${KIND[a.kind].color}`, opacity: a.active || o.run ? 1 : 0.5, cursor: "pointer" }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ font: mono(700, 10.5), color: "#F4F4F2" }}>{time}</span>
                        <span style={{ marginLeft: "auto", font: mono(700, 8.5), color: st.color }}>{st.label}</span>
                      </div>
                      <div style={{ font: "600 11.5px Inter,sans-serif", color: "#F4F4F2", marginTop: 2, lineHeight: 1.3 }}>{a.name}</div>
                      <div style={{ font: mono(500, 9.5), color: KIND[a.kind].color, marginTop: 2 }}>{KIND[a.kind].label.toUpperCase()}</div>
                    </button>
                  );
                })}
                {items.length === 0 && !briefing && (
                  <div style={{ font: "500 11px Inter,sans-serif", color: "rgba(244,244,242,0.25)", padding: "6px 4px" }}>—</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Detalhe da ocorrencia */}
      {selected && byId.get(selected.automation_id) && (() => {
        const a = byId.get(selected.automation_id)!;
        return (
          <div style={{ ...card, padding: 16, borderColor: `${KIND[a.kind].color}55` }} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span style={{ font: mono(700, 10), color: KIND[a.kind].color }}>{KIND[a.kind].label.toUpperCase()}</span>
              <span style={{ font: "700 14px Inter,sans-serif" }}>{a.name}</span>
              <span style={{ font: mono(500, 11), color: "rgba(244,244,242,0.45)" }}>
                {new Date(selected.at).toLocaleString("pt-PT", { timeZone: "Europe/Lisbon", weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
              </span>
              <button onClick={() => setSelected(null)} style={{ marginLeft: "auto", background: "transparent", border: "none", color: "rgba(244,244,242,0.4)", cursor: "pointer", font: mono(700, 12) }}>✕</button>
            </div>
            <div style={{ font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.75)", whiteSpace: "pre-wrap" }}>{a.prompt}</div>
            {selected.run && (
              <div style={{ font: mono(500, 11), color: "rgba(244,244,242,0.5)" }}>
                Resultado ({selected.run.status}): {selected.run.result || "—"}
              </div>
            )}
          </div>
        );
      })()}

      {/* Gestao */}
      <div style={card}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.08)", font: "700 13px Inter,sans-serif" }}>
          Todas as automações <span style={{ font: mono(500, 11), color: "rgba(244,244,242,0.35)" }}>{autos.length}</span>
        </div>
        {autos.length === 0 && (
          <div style={{ padding: "16px", font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.4)" }}>
            Ainda não há automações. Cria uma aqui ou pede ao Holiday no chat.
          </div>
        )}
        {autos
          .filter((a) => matches(a.name, a.kind))
          .map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2" style={{ padding: "12px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", opacity: a.active ? 1 : 0.55 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: KIND[a.kind].color, flexShrink: 0 }} />
              <div className="flex-1 min-w-[180px]">
                <div style={{ font: "600 13px Inter,sans-serif" }}>
                  {a.name}
                  {a.created_by === "holiday" && <span style={{ font: mono(600, 9.5), color: "#8B7CF6", marginLeft: 8 }}>CRIADA PELO HOLIDAY</span>}
                </div>
                <div style={{ font: mono(500, 11), color: "rgba(244,244,242,0.45)", marginTop: 2 }}>
                  {KIND[a.kind].label} · {daysText(a.days)} às {a.time}
                </div>
              </div>
              <div className="flex gap-1.5">
                {[
                  { label: a.active ? "PAUSAR" : "RETOMAR", on: () => toggle(a) },
                  { label: "CORRER JÁ", on: () => runNow(a) },
                  { label: "EDITAR", on: () => setEditing({ id: a.id, name: a.name, kind: a.kind, prompt: a.prompt, days: a.days, time: a.time }) },
                  { label: "APAGAR", on: () => remove(a) },
                ].map((b) => (
                  <button
                    key={b.label}
                    onClick={b.on}
                    disabled={busyId === a.id}
                    className="hover:border-accent hover:text-accent transition-colors"
                    style={{ font: mono(700, 9.5), color: "rgba(244,244,242,0.6)", background: "transparent", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 3, padding: "5px 8px", cursor: "pointer", opacity: busyId === a.id ? 0.5 : 1 }}
                  >
                    {busyId === a.id && b.label === "CORRER JÁ" ? "…" : b.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
      </div>

      {/* Formulario */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.6)" }} onClick={() => setEditing(null)}>
          <form onSubmit={save} onClick={(e) => e.stopPropagation()} style={{ ...card, background: "#16181D", width: "100%", maxWidth: 480, padding: 20 }} className="flex flex-col gap-3">
            <div style={{ font: "700 15px Inter,sans-serif" }}>{editing.id ? "Editar automação" : "Nova automação"}</div>
            <input
              value={editing.name}
              onChange={(e) => setEditing({ ...editing, name: e.target.value })}
              placeholder="Nome (ex: Registar o jantar)"
              className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] outline-none focus:border-accent"
            />
            <div className="flex gap-1.5">
              {(["lembrete", "analise", "trabalho"] as Kind[]).map((k) => (
                <button key={k} type="button" onClick={() => setEditing({ ...editing, kind: k })} style={chip(editing.kind === k, KIND[k].color)}>
                  {KIND[k].label}
                </button>
              ))}
            </div>
            <span style={{ font: "500 11.5px Inter,sans-serif", color: "rgba(244,244,242,0.45)" }}>
              {editing.kind === "lembrete"
                ? "O Holiday publica esta mensagem no chat à hora marcada."
                : editing.kind === "analise"
                ? "O Holiday analisa o teu estado (tarefas, nutrição, histórico) e responde no chat."
                : "O Holiday trabalha nisto sozinho e deixa o resultado no chat (o que mexer no Todoist/calendário pede aprovação)."}
            </span>
            <textarea
              value={editing.prompt}
              onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
              rows={3}
              placeholder={editing.kind === "lembrete" ? "Mensagem (ex: Já registaste o jantar?)" : "O que o Holiday deve fazer (ex: revê a semana e diz-me as 3 prioridades)"}
              className="bg-bg border border-white/10 rounded px-3 py-2 text-[13px] outline-none focus:border-accent resize-none"
            />
            <div className="flex flex-wrap gap-1.5">
              {DAY_ORDER.map((d) => {
                const on = editing.days.includes(d);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setEditing({ ...editing, days: on ? editing.days.filter((x) => x !== d) : [...editing.days, d] })}
                    style={{ ...chip(on, "#F4F4F2"), padding: "5px 8px" }}
                  >
                    {DAY_SHORT[d]}
                  </button>
                );
              })}
              <select
                value={editing.time}
                onChange={(e) => setEditing({ ...editing, time: e.target.value })}
                className="ml-auto bg-bg border border-white/10 rounded px-2 py-1 text-[12px] font-mono outline-none focus:border-accent"
              >
                {TIMES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-1">
              <button type="button" onClick={() => setEditing(null)} style={{ ...chip(false, "rgba(244,244,242,0.7)"), padding: "8px 14px" }}>CANCELAR</button>
              <button type="submit" disabled={saving || !editing.name.trim() || !editing.prompt.trim() || editing.days.length === 0} style={{ padding: "8px 16px", background: "#F54E00", border: "none", borderRadius: 4, color: "#0B0C10", font: mono(700, 11), cursor: "pointer", opacity: saving ? 0.5 : 1 }}>
                {saving ? "…" : "GUARDAR"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
