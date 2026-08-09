"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PILLARS, TaskCache } from "@/lib/types";

interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

function pillarMeta(key: string | null) {
  const p = PILLARS.find((p) => p.key === key);
  return { label: p ? p.label : "Hábito", color: p ? p.color : "rgba(244,244,242,0.4)" };
}

function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

function weekDays() {
  const today = new Date();
  const day = today.getDay(); // 0=Dom
  const monday = new Date(today);
  monday.setDate(today.getDate() - ((day + 6) % 7));
  const out: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    out.push(d);
  }
  return out;
}

export default function AgendarPage() {
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startT, setStartT] = useState("");
  const [endT, setEndT] = useState("");
  const [reminder, setReminder] = useState("30");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadTasks();
    loadEvents();
  }, []);

  async function loadTasks() {
    const { data, error } = await supabase.from("tasks_cache").select("*").eq("status", "open");
    if (error) setError(error.message);
    else setTasks(data as TaskCache[]);
  }

  async function loadEvents() {
    try {
      const res = await fetch("/api/schedule");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setEvents(data.events || []);
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date || !startT || !endT) {
      setMsg({ type: "err", text: "preenche todos os campos" });
      return;
    }
    setSending(true);
    setMsg(null);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: title,
          start: `${date}T${startT}:00+01:00`,
          end: `${date}T${endT}:00+01:00`,
          reminder_minutes: parseInt(reminder, 10),
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setMsg({ type: "ok", text: `Agendado — lembrete ${reminder} min antes.` });
      setTitle(""); setDate(""); setStartT(""); setEndT("");
      await loadEvents();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSending(false);
    }
  }

  const days = weekDays();
  const today = new Date();
  const todayIso = isoDate(today);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const tomorrowIso = isoDate(tomorrow);

  function rowsForDate(iso: string) {
    const taskRows = (tasks || [])
      .filter((t) => t.due === iso)
      .map((t) => {
        const meta = pillarMeta(t.pillar);
        return { key: "t-" + t.id, time: "", label: meta.label, color: meta.color, title: t.content };
      });
    const eventRows = (events || [])
      .filter((e) => e.start.slice(0, 10) === iso)
      .map((e) => ({
        key: "e-" + e.id,
        time: new Date(e.start).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        label: "Evento", color: "#F54E00", title: e.summary,
      }));
    return [...eventRows, ...taskRows];
  }

  const DayGroup = (p: { label: string; iso: string }) => {
    const rows = rowsForDate(p.iso);
    return (
      <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, marginBottom: 16, overflow: "hidden" }}>
        <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)", font: "600 12px 'JetBrains Mono',monospace", letterSpacing: "0.04em", color: "rgba(244,244,242,0.5)" }}>
          {p.label} · {p.iso.slice(8, 10)}/{p.iso.slice(5, 7)}
        </div>
        {rows.length === 0 && (
          <div style={{ padding: "14px 18px", font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.3)" }}>nada agendado</div>
        )}
        {rows.map((r) => (
          <div key={r.key} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
            <span style={{ font: "700 12px 'JetBrains Mono',monospace", color: "#F54E00", width: 46, flexShrink: 0 }}>{r.time}</span>
            <span style={{ font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.03em", color: r.color, background: `${r.color}1a`, border: `1px solid ${r.color}40`, padding: "3px 8px", borderRadius: 3, flexShrink: 0 }}>
              {r.label}
            </span>
            <span style={{ flex: 1, font: "500 13px Inter,sans-serif" }}>{r.title}</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="p-[28px_36px] flex flex-col">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        <button
          onClick={() => setShowForm((s) => !s)}
          style={{ padding: "8px 16px", background: "transparent", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 4, color: "rgba(244,244,242,0.7)", font: "700 11px 'JetBrains Mono',monospace", cursor: "pointer" }}
        >
          {showForm ? "FECHAR" : "+ AGENDAR LEMBRETE"}
        </button>
      </div>

      {showForm && (
        <form onSubmit={submit} style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", gap: 10, marginBottom: 16, maxWidth: 560 }}>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título"
            className="bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] outline-none focus:border-accent" />
          <div className="flex gap-2">
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="flex-1 bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent" />
            <input type="time" value={startT} onChange={(e) => setStartT(e.target.value)}
              className="flex-1 bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent" />
            <input type="time" value={endT} onChange={(e) => setEndT(e.target.value)}
              className="flex-1 bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent" />
          </div>
          <select value={reminder} onChange={(e) => setReminder(e.target.value)}
            className="bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] outline-none">
            <option value="5">5 minutos antes</option>
            <option value="10">10 minutos antes</option>
            <option value="30">30 minutos antes</option>
            <option value="60">1 hora antes</option>
            <option value="1440">1 dia antes</option>
          </select>
          {msg && (
            <div className="px-3.5 py-2 rounded text-[12.5px] font-mono" style={msg.type === "ok" ? { background: "rgba(61,220,132,0.1)", color: "#3DDC84" } : { background: "rgba(255,95,95,0.1)", color: "#FF5F5F" }}>
              {msg.text}
            </div>
          )}
          <button type="submit" disabled={sending} className="px-4 py-2.5 bg-accent border-none rounded text-bg font-mono font-bold text-[12px] disabled:opacity-50">
            {sending ? "a agendar…" : "AGENDAR"}
          </button>
        </form>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 20, overflowX: "auto" }} className="lg:grid" >
        {days.map((d) => {
          const iso = isoDate(d);
          const isToday = iso === todayIso;
          return (
            <div
              key={iso}
              style={{
                border: `1px solid ${isToday ? "#F54E00" : "rgba(255,255,255,0.08)"}`,
                background: isToday ? "rgba(245,78,0,0.12)" : "#14161B",
                borderRadius: 6, padding: "14px 8px", textAlign: "center",
                minWidth: 64, flex: "1 0 64px",
              }}
            >
              <div style={{ font: "600 10px 'JetBrains Mono',monospace", color: isToday ? "#F54E00" : "rgba(244,244,242,0.4)", marginBottom: 4 }}>
                {d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3).toUpperCase()}
              </div>
              <div style={{ font: "700 20px 'JetBrains Mono',monospace", color: isToday ? "#F54E00" : "#F4F4F2" }}>
                {String(d.getDate()).padStart(2, "0")}
              </div>
            </div>
          );
        })}
      </div>

      {error && <div className="text-red-400 text-[12px] font-mono mb-3">{error}</div>}

      <DayGroup label="HOJE" iso={todayIso} />
      <DayGroup label="AMANHÃ" iso={tomorrowIso} />
    </div>
  );
}
