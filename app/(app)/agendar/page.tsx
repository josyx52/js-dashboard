"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { localDateKey } from "@/lib/dates";
import { plainTitle } from "@/lib/text";
import { PILLARS, TaskCache } from "@/lib/types";
import { cn } from "@/lib/cn";
import { Button, Card, ColorDot, EmptyState, Input, Label, Modal, Page, PageHeader, Select, Skeleton, useToast } from "@/components/ui";
import { IconAgendar } from "@/components/icons";

interface CalEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

interface Row {
  key: string;
  time: string;
  label: string;
  color: string;
  title: string;
  kind: "event" | "task";
}

const EVENT_COLOR = "rgb(var(--accent))";

function pillarMeta(key: string | null) {
  const p = PILLARS.find((p) => p.key === key);
  return { label: p ? p.label : "Hábito", color: p ? p.color : "rgb(var(--fg-3))" };
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
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [events, setEvents] = useState<CalEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState(() => localDateKey());

  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startT, setStartT] = useState("");
  const [endT, setEndT] = useState("");
  const [reminder, setReminder] = useState("30");
  const [formError, setFormError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadTasks();
    loadEvents();
  }, []);

  async function loadTasks() {
    try {
      const data = await api<{ tasks: TaskCache[] }>("/api/tasks");
      setTasks(data.tasks);
    } catch (e: any) {
      setError(e.message);
    }
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

  function openForm() {
    setFormError(null);
    if (!date) setDate(selected);
    setShowForm(true);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title || !date || !startT || !endT) {
      setFormError("Preenche todos os campos.");
      return;
    }
    // Hora local do browser -> ISO com fuso correto.
    const start = new Date(`${date}T${startT}:00`);
    const end = new Date(`${date}T${endT}:00`);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      setFormError("Data ou hora inválida.");
      return;
    }
    if (end <= start) {
      setFormError("O fim tem de ser depois do início.");
      return;
    }
    setSending(true);
    setFormError(null);
    try {
      await api("/api/schedule", {
        body: {
          summary: title,
          start: start.toISOString(),
          end: end.toISOString(),
          reminder_minutes: parseInt(reminder, 10),
        },
      });
      toast.success("Evento agendado", `${title} · lembrete ${reminder === "1440" ? "1 dia" : reminder + " min"} antes`);
      setSelected(date);
      setTitle(""); setDate(""); setStartT(""); setEndT("");
      setShowForm(false);
      await loadEvents();
    } catch (e: any) {
      setFormError(e.message);
    } finally {
      setSending(false);
    }
  }

  const days = weekDays();
  const todayIso = localDateKey();
  const loading = tasks === null && events === null && !error;

  function rowsForDate(iso: string): Row[] {
    const taskRows = (tasks || [])
      .filter((t) => t.due === iso)
      .map((t) => {
        const meta = pillarMeta(t.pillar);
        return { key: "t-" + t.id, time: "", label: meta.label, color: meta.color, title: plainTitle(t.content), kind: "task" as const };
      });
    const eventRows = (events || [])
      .filter((e) => localDateKey(new Date(e.start)) === iso)
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((e) => ({
        key: "e-" + e.id,
        time: new Date(e.start).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }),
        label: "Evento",
        color: EVENT_COLOR,
        title: e.summary,
        kind: "event" as const,
      }));
    return [...eventRows, ...taskRows];
  }

  const selDate = new Date(selected + "T12:00:00");
  const selLabel =
    selected === todayIso
      ? "Hoje"
      : selDate.toLocaleDateString("pt-PT", { weekday: "long" }).replace(/^\w/, (c) => c.toUpperCase());
  const rows = rowsForDate(selected);

  return (
    <Page>
      <PageHeader
        title="Agenda"
        description="Eventos do Google Calendar e tarefas com data, dia a dia."
        actions={
          <Button variant="primary" onClick={openForm}>
            Novo evento
          </Button>
        }
      />

      {error && (
        <Card className="border-danger/30 px-4 py-3 text-[13px] text-danger">Não foi possível carregar a agenda: {error}</Card>
      )}

      <div className="grid grid-cols-7 gap-1.5 sm:gap-2" role="tablist" aria-label="Dias da semana">
        {days.map((d) => {
          const iso = localDateKey(d);
          const isToday = iso === todayIso;
          const active = iso === selected;
          const n = loading ? 0 : rowsForDate(iso).length;
          return (
            <button
              key={iso}
              role="tab"
              aria-selected={active}
              onClick={() => setSelected(iso)}
              className={cn(
                "rounded-card border py-2.5 sm:py-3 flex flex-col items-center gap-0.5 transition-colors",
                active ? "bg-surface-2 border-line/20" : "bg-surface border-line/[0.07] hover:border-line/15"
              )}
            >
              <span className={cn("text-[10.5px] sm:text-[11px] font-medium uppercase tracking-[0.04em]", isToday ? "text-accent" : "text-fg-3")}>
                {d.toLocaleDateString("pt-PT", { weekday: "short" }).slice(0, 3)}
              </span>
              <span className={cn("text-[17px] sm:text-[20px] font-semibold tabular leading-tight", isToday ? "text-accent" : "text-fg")}>{d.getDate()}</span>
              <span className={cn("h-1.5 w-1.5 rounded-full", n ? "bg-fg-2" : "bg-transparent")} aria-label={n ? `${n} itens` : undefined} />
            </button>
          );
        })}
      </div>

      <Card className="overflow-hidden">
        <div className="flex items-baseline gap-2 px-5 pt-4 pb-3 border-b border-line/[0.06]">
          <h3 className="text-[13.5px] font-semibold">{selLabel}</h3>
          <span className="text-[12.5px] text-fg-3">{selDate.toLocaleDateString("pt-PT", { day: "numeric", month: "long" })}</span>
          <span className="ml-auto text-[12px] text-fg-3 tabular">{loading ? "" : `${rows.length} ${rows.length === 1 ? "item" : "itens"}`}</span>
        </div>
        {loading ? (
          <div className="p-5 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<IconAgendar className="w-5 h-5" />}
            title="Nada agendado"
            description="Sem eventos nem tarefas com data para este dia."
            action={
              <Button size="sm" onClick={openForm}>
                Agendar evento
              </Button>
            }
          />
        ) : (
          <ul>
            {rows.map((r) => (
              <li key={r.key} className="flex items-center gap-3 px-5 h-12 border-b border-line/[0.05] last:border-b-0 hover:bg-line/[0.025]">
                <span className="w-12 flex-none text-[12.5px] tabular font-medium text-fg-2">{r.time || "—"}</span>
                <span className="flex-1 min-w-0 truncate text-[13.5px]">{r.title}</span>
                <span className="inline-flex items-center gap-1.5 text-[12px] text-fg-3 flex-none">
                  <ColorDot color={r.color} />
                  {r.label}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Modal
        open={showForm}
        onClose={() => !sending && setShowForm(false)}
        title="Novo evento"
        description="Cria o evento no Google Calendar com um lembrete."
        footer={
          <>
            <Button variant="ghost" onClick={() => setShowForm(false)} disabled={sending}>
              Cancelar
            </Button>
            <Button variant="primary" type="submit" form="schedule-form" loading={sending}>
              Agendar
            </Button>
          </>
        }
      >
        <form id="schedule-form" onSubmit={submit} className="flex flex-col gap-4">
          <div>
            <Label>Título</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: Consulta, reunião, treino" />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Label>Data</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Início</Label>
              <Input type="time" value={startT} onChange={(e) => setStartT(e.target.value)} />
            </div>
            <div>
              <Label>Fim</Label>
              <Input type="time" value={endT} onChange={(e) => setEndT(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Lembrete</Label>
            <Select value={reminder} onChange={(e) => setReminder(e.target.value)}>
              <option value="5">5 minutos antes</option>
              <option value="10">10 minutos antes</option>
              <option value="30">30 minutos antes</option>
              <option value="60">1 hora antes</option>
              <option value="1440">1 dia antes</option>
            </Select>
          </div>
          {formError && (
            <p role="alert" className="text-[12.5px] text-danger">
              {formError}
            </p>
          )}
        </form>
      </Modal>
    </Page>
  );
}
