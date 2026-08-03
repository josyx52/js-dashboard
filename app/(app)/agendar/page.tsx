"use client";
import { useEffect, useState } from "react";

interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

function fmtTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" }) +
      " " + d.toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return iso;
  }
}

export default function AgendarPage() {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startT, setStartT] = useState("");
  const [endT, setEndT] = useState("");
  const [reminder, setReminder] = useState("30");
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const [upcoming, setUpcoming] = useState<CalEvent[] | null>(null);
  const [upErr, setUpErr] = useState<string | null>(null);
  const [cancelingId, setCancelingId] = useState<string | null>(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setUpErr(null);
    try {
      const res = await fetch("/api/schedule");
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setUpcoming(data.events || []);
    } catch (e: any) {
      setUpErr(e.message);
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
      setTitle("");
      setDate("");
      setStartT("");
      setEndT("");
      await load();
    } catch (e: any) {
      setMsg({ type: "err", text: e.message });
    } finally {
      setSending(false);
    }
  }

  async function cancel(id: string) {
    setCancelingId(id);
    try {
      const res = await fetch("/api/schedule", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: id }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      await load();
    } catch (e: any) {
      window.alert("Não consegui cancelar: " + e.message);
    } finally {
      setCancelingId(null);
    }
  }

  return (
    <div className="p-[28px_36px] max-w-[640px] flex flex-col gap-4">
      <form onSubmit={submit} className="border border-white/[0.08] bg-surface rounded-md p-5 flex flex-col gap-2.5">
        <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
          NOVO AGENDAMENTO
        </div>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Título"
          className="bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] outline-none focus:border-accent"
        />
        <div className="flex gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="flex-1 bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent"
          />
          <input
            type="time"
            value={startT}
            onChange={(e) => setStartT(e.target.value)}
            className="flex-1 bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent"
          />
          <input
            type="time"
            value={endT}
            onChange={(e) => setEndT(e.target.value)}
            className="flex-1 bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] font-mono outline-none focus:border-accent"
          />
        </div>
        <select
          value={reminder}
          onChange={(e) => setReminder(e.target.value)}
          className="bg-bg border border-white/10 rounded px-3 py-2.5 text-[13px] outline-none"
        >
          <option value="5">5 minutos antes</option>
          <option value="10">10 minutos antes</option>
          <option value="30">30 minutos antes</option>
          <option value="60">1 hora antes</option>
          <option value="1440">1 dia antes</option>
        </select>
        {msg && (
          <div
            className="px-3.5 py-2 rounded text-[12.5px] font-mono"
            style={
              msg.type === "ok"
                ? { background: "rgba(61,220,132,0.1)", color: "#3DDC84" }
                : { background: "rgba(255,95,95,0.1)", color: "#FF5F5F" }
            }
          >
            {msg.text}
          </div>
        )}
        <button
          type="submit"
          disabled={sending}
          className="px-4 py-2.5 bg-accent border-none rounded text-bg font-mono font-bold text-[12px] disabled:opacity-50"
        >
          {sending ? "a agendar…" : "AGENDAR"}
        </button>
      </form>

      <div className="border border-white/[0.08] bg-surface rounded-md overflow-hidden">
        <div className="px-[18px] py-[14px] border-b border-white/[0.08] font-sans font-bold text-[13px]">
          Próximos 14 dias
        </div>
        <div className="flex flex-col">
          {upErr && <div className="px-[18px] py-4 text-[12.5px] text-red-400 font-mono">{upErr}</div>}
          {upcoming === null && !upErr && (
            <div className="px-[18px] py-4 text-[12.5px] text-white/35 font-sans">a carregar…</div>
          )}
          {upcoming && upcoming.length === 0 && (
            <div className="px-[18px] py-4 text-[12.5px] text-white/35 font-sans">nada agendado</div>
          )}
          {upcoming?.map((ev) => (
            <div
              key={ev.id}
              className="flex items-center gap-3 px-[18px] py-[13px] border-b border-white/[0.05] last:border-none"
            >
              <span className="font-mono font-medium text-[11px] text-white/40 flex-none w-[110px]">
                {fmtTime(ev.start)}
              </span>
              <span className="flex-1 min-w-0 font-sans font-medium text-[13px] truncate">{ev.summary}</span>
              <button
                onClick={() => cancel(ev.id)}
                disabled={cancelingId === ev.id}
                className="font-mono text-[10px] px-2.5 py-1 rounded border border-white/[0.14] text-white/50 hover:border-red-400/50 hover:text-red-400 transition-colors disabled:opacity-50"
              >
                {cancelingId === ev.id ? "…" : "CANCELAR"}
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
