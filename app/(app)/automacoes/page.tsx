"use client";
import { useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { cn } from "@/lib/cn";
import { addDays, localDateKey } from "@/lib/dates";
import { IconAutomacao } from "@/components/icons";
import {
  Badge,
  Button,
  Card,
  CardHeader,
  ColorDot,
  EmptyState,
  Input,
  Label,
  Modal,
  Page,
  PageHeader,
  Segmented,
  Select,
  Skeleton,
  Textarea,
  useToast,
} from "@/components/ui";

type Kind = "lembrete" | "analise" | "trabalho";
type Filter = "todas" | Kind | "evento" | "sistema";
type View = "agenda" | "lista";

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
  trigger: "horario" | "evento";
  event: string | null;
  cooldown_hours: number;
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

type Tone = "info" | "violet" | "accent" | "warning" | "neutral";
const KIND: Record<Kind | "sistema" | "evento", { label: string; tone: Tone; color: string }> = {
  evento: { label: "Por evento", tone: "warning", color: "rgb(var(--warning))" },
  lembrete: { label: "Lembrete", tone: "info", color: "rgb(var(--info))" },
  analise: { label: "Análise", tone: "violet", color: "rgb(var(--violet))" },
  trabalho: { label: "Trabalho", tone: "accent", color: "rgb(var(--accent))" },
  sistema: { label: "Sistema", tone: "neutral", color: "rgb(var(--fg-3))" },
};
const DAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // semana a comecar a segunda
const TIMES = Array.from({ length: 96 }, (_, i) => `${String(Math.floor(i / 4)).padStart(2, "0")}:${String((i % 4) * 15).padStart(2, "0")}`);
const TZ = "Europe/Lisbon";

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
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString("pt-PT", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const EMPTY = {
  id: "",
  name: "",
  kind: "lembrete" as Kind,
  prompt: "",
  days: [1, 2, 3, 4, 5],
  time: "09:00",
  trigger: "horario" as "horario" | "evento",
  event: "meals:none",
  cooldown_hours: 24,
};
const COOLDOWNS = [1, 4, 12, 24, 48, 168];
const cooldownText = (h: number) => (h >= 168 ? "1x por semana" : h >= 24 ? `1x a cada ${h / 24} dia${h > 24 ? "s" : ""}` : `1x a cada ${h} h`);

function toForm(a: Automation): typeof EMPTY {
  return {
    id: a.id,
    name: a.name,
    kind: a.kind,
    prompt: a.prompt,
    days: a.days,
    time: a.time,
    trigger: a.trigger || "horario",
    event: a.event || "meals:none",
    cooldown_hours: a.cooldown_hours || 24,
  };
}

export default function AutomacoesPage() {
  const toast = useToast();
  const today = localDateKey();
  const [weekStart, setWeekStart] = useState(mondayOf(today));
  const [autos, setAutos] = useState<Automation[]>([]);
  const [occ, setOcc] = useState<Occ[]>([]);
  const [system, setSystem] = useState<SystemAuto[]>([]);
  const [eventRuns, setEventRuns] = useState<Occ[]>([]);
  const [events, setEvents] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("todas");
  const [view, setView] = useState<View>("agenda");
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<typeof EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Occ | null>(null);
  const [confirmDel, setConfirmDel] = useState<Automation | null>(null);

  async function load() {
    try {
      const d = await api<{ automations: Automation[]; occurrences: Occ[]; system: SystemAuto[]; eventRuns: Occ[]; events: Record<string, string> }>(
        `/api/automations?from=${weekStart}&to=${addDays(weekStart, 6)}`
      );
      setAutos(d.automations);
      setOcc(d.occurrences);
      setSystem(d.system);
      setEventRuns(d.eventRuns || []);
      setEvents(d.events || {});
      setLoadError(null);
    } catch (e: any) {
      setLoadError(e.message);
    } finally {
      setLoaded(true);
    }
  }

  useEffect(() => {
    load();
  }, [weekStart]);

  const byId = useMemo(() => new Map(autos.map((a) => [a.id, a])), [autos]);
  const q = query.trim().toLowerCase();
  const matches = (name: string, kind: Kind | "sistema", isEv = false) =>
    (filter === "todas" || filter === kind || (filter === "evento" && isEv)) && (!q || name.toLowerCase().includes(q));
  const matchA = (a: Automation) => matches(a.name, a.kind, a.trigger === "evento");
  const showSystem = filter === "todas" || filter === "sistema";

  const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const nowIso = new Date().toISOString();
  const eventAutos = autos.filter((a) => a.trigger === "evento" && matchA(a));
  const listed = autos.filter(matchA);

  async function save() {
    if (!editing) return;
    setSaving(true);
    try {
      const body = {
        name: editing.name,
        kind: editing.kind,
        prompt: editing.prompt,
        days: editing.days,
        time: editing.time,
        trigger: editing.trigger,
        event: editing.event,
        cooldown_hours: editing.cooldown_hours,
      };
      if (editing.id) await api(`/api/automations/${editing.id}`, { method: "PATCH", body });
      else await api("/api/automations", { body });
      toast.success(editing.id ? "Automação atualizada" : "Automação criada", editing.name);
      setEditing(null);
      await load();
    } catch (err: any) {
      toast.error("Não foi possível guardar", err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggle(a: Automation) {
    setBusyId(a.id);
    try {
      await api(`/api/automations/${a.id}`, { method: "PATCH", body: { active: !a.active } });
      toast.success(a.active ? "Automação pausada" : "Automação retomada", a.name);
      await load();
    } catch (err: any) {
      toast.error("Não foi possível alterar", err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function remove(a: Automation) {
    setBusyId(a.id);
    try {
      await api(`/api/automations/${a.id}`, { method: "DELETE" });
      setSelected(null);
      setConfirmDel(null);
      toast.success("Automação apagada", a.name);
      await load();
    } catch (err: any) {
      toast.error("Não foi possível apagar", err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function runNow(a: Automation) {
    setBusyId(a.id);
    try {
      await api(`/api/automations/${a.id}/run`, { method: "POST" });
      toast.success(`"${a.name}" correu agora`, "O resultado está no chat do Holiday.");
      await load();
    } catch (err: any) {
      toast.error("Falhou ao correr", err.message);
    } finally {
      setBusyId(null);
    }
  }

  const status = (o: Occ, a: Automation): { label: string; tone: "success" | "danger" | "neutral" | "warning" } => {
    if (o.run?.status === "ok") return { label: "Feita", tone: "success" };
    if (o.run?.status === "falhou") return { label: "Falhou", tone: "danger" };
    if (o.run?.status === "perdida") return { label: "Perdida", tone: "neutral" };
    if (!a.active) return { label: "Pausada", tone: "neutral" };
    return o.at < nowIso ? { label: "A correr", tone: "warning" } : { label: "Agendada", tone: "neutral" };
  };

  const FILTERS: Filter[] = ["todas", "lembrete", "analise", "trabalho", "evento", "sistema"];
  const sel = selected ? byId.get(selected.automation_id) : undefined;
  const selStatus = sel && selected ? status(selected, sel) : null;
  const canSave = !!editing && !!editing.name.trim() && !!editing.prompt.trim() && editing.days.length > 0;

  return (
    <Page wide>
      <PageHeader
        title="Automações"
        description="O que o Holiday faz sozinho, dia a dia. Também podes pedir no chat: “lembra-me todas as noites às 21h de registar o jantar”."
        actions={
          <Button variant="primary" onClick={() => setEditing({ ...EMPTY })}>
            Nova automação
          </Button>
        }
      />

      {loadError && (
        <Card className="border-danger/30 px-4 py-3 flex items-center gap-3">
          <span className="text-[13px] text-danger flex-1">Não foi possível carregar as automações: {loadError}</span>
          <Button size="sm" onClick={load}>
            Tentar de novo
          </Button>
        </Card>
      )}

      {/* Barra de ferramentas */}
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<View>
          value={view}
          onChange={setView}
          options={[
            { value: "agenda", label: "Semana" },
            { value: "lista", label: <>Lista <span className="text-fg-3 tabular">{autos.length}</span></> },
          ]}
        />
        <Segmented<Filter>
          value={filter}
          onChange={setFilter}
          options={FILTERS.map((f) => ({ value: f, label: f === "todas" ? "Todas" : KIND[f].label, color: f === "todas" ? undefined : KIND[f].color }))}
        />
        <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Procurar por nome…" aria-label="Procurar por nome" className="sm:ml-auto sm:w-[240px]" />
      </div>

      {view === "agenda" && (
        <>
          {/* Navegacao da semana */}
          <div className="flex items-center gap-2">
            <Button size="icon" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, -7))} aria-label="Semana anterior">
              <Chevron dir="left" />
            </Button>
            <span className="text-[13.5px] font-semibold tabular min-w-[140px] text-center">
              {fmtDay(weekStart)} – {fmtDay(addDays(weekStart, 6))}
            </span>
            <Button size="icon" variant="ghost" onClick={() => setWeekStart(addDays(weekStart, 7))} aria-label="Semana seguinte">
              <Chevron dir="right" />
            </Button>
            {weekStart !== mondayOf(today) && (
              <Button size="sm" variant="secondary" onClick={() => setWeekStart(mondayOf(today))}>
                Esta semana
              </Button>
            )}
          </div>

          {/* Agenda da semana */}
          <div className="grid grid-cols-1 md:grid-cols-7 gap-2">
            {week.map((date) => {
              const isToday = date === today;
              const items = [...occ, ...eventRuns]
                .filter((o) => o.date === date)
                .sort((x, y) => x.at.localeCompare(y.at))
                .map((o) => ({ o, a: byId.get(o.automation_id)! }))
                .filter(({ a }) => a && matchA(a));
              const briefing = showSystem && matches("Briefing do dia", "sistema");
              return (
                <Card key={date} className={cn("flex flex-col min-h-[140px] overflow-hidden", isToday && "border-accent/40")}>
                  <div className="flex items-baseline gap-1.5 px-3 py-2.5 border-b border-line/[0.06]">
                    <span className={cn("text-[12.5px] font-semibold", isToday ? "text-accent" : "text-fg-2")}>{DAY_SHORT[new Date(date + "T12:00:00Z").getUTCDay()]}</span>
                    <span className="text-[12px] text-fg-3 tabular">{date.slice(8, 10)}</span>
                    {isToday && (
                      <Badge tone="accent" className="ml-auto h-[18px] px-1.5 text-[10.5px]">
                        Hoje
                      </Badge>
                    )}
                  </div>
                  <div className="flex flex-col gap-1.5 p-2">
                    {!loaded && <Skeleton className="h-12" />}
                    {loaded && briefing && (
                      <div className="rounded-lg px-2.5 py-2 bg-line/[0.025] border border-line/[0.05]">
                        <div className="text-[11.5px] tabular text-fg-3">07:00</div>
                        <div className="text-[12px] text-fg-2 leading-snug">Briefing do dia</div>
                      </div>
                    )}
                    {items.map(({ o, a }) => {
                      const st = status(o, a);
                      return (
                        <button
                          key={o.automation_id + o.at}
                          onClick={() => setSelected(o)}
                          className={cn(
                            "text-left rounded-lg px-2.5 py-2 bg-line/[0.035] border border-line/[0.06] hover:bg-line/[0.07] hover:border-line/[0.12] transition-colors",
                            !a.active && !o.run && "opacity-50"
                          )}
                        >
                          <div className="flex items-center gap-1.5">
                            <ColorDot color={KIND[a.kind].color} />
                            <span className="text-[11.5px] tabular text-fg-2">{timeOf(o.at)}</span>
                            {a.trigger === "evento" && <span className="text-[10.5px] text-warning">evento</span>}
                            <StatusText tone={st.tone}>{st.label}</StatusText>
                          </div>
                          <div className="text-[12.5px] font-medium text-fg mt-1 leading-snug">{a.name}</div>
                        </button>
                      );
                    })}
                    {loaded && items.length === 0 && !briefing && <div className="text-[12px] text-fg-3/60 px-1 py-1.5">Sem nada</div>}
                  </div>
                </Card>
              );
            })}
          </div>

          {/* Por evento (como no Jarvis: disparam quando o Holiday deteta a situacao) */}
          {eventAutos.length > 0 && (
            <Card>
              <CardHeader title="Por evento" description="Disparam quando o Holiday deteta a situação, nos dias e a partir da hora marcados." />
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 px-5 pb-5">
                {eventAutos.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setEditing(toForm(a))}
                    className={cn("text-left rounded-lg p-3 bg-line/[0.03] border border-line/[0.06] hover:border-line/[0.12] transition-colors", !a.active && "opacity-50")}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-[13px] font-medium">{a.name}</span>
                      <Badge tone={KIND[a.kind].tone}>{KIND[a.kind].label}</Badge>
                      {!a.active && <Badge className="ml-auto">Pausada</Badge>}
                    </div>
                    <div className="text-[12.5px] text-fg-2 mt-1.5">Quando: {events[a.event || ""] || a.event}</div>
                    <div className="text-[12px] text-fg-3 mt-1">
                      {daysText(a.days)} · a partir das <span className="tabular">{a.time}</span> · {cooldownText(a.cooldown_hours)}
                      {a.last_run_at && (
                        <>
                          {" "}
                          · último{" "}
                          <span className="tabular">
                            {new Date(a.last_run_at).toLocaleString("pt-PT", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}

          {/* Sistema: sempre a correr */}
          {showSystem && system.some((s) => !q || s.name.toLowerCase().includes(q)) && (
            <Card>
              <CardHeader title="Sempre ativas" description="Tarefas do sistema que correm sem configuração." />
              <ul className="px-5 pb-3">
                {system
                  .filter((s) => !q || s.name.toLowerCase().includes(q))
                  .map((s) => (
                    <li key={s.name} className="flex items-center gap-3 py-2 border-t border-line/[0.05] text-[13px]">
                      <span className="tabular text-fg-3 w-[88px] flex-none text-[12.5px]">{s.time}</span>
                      <span className="text-fg">{s.name}</span>
                      <span className="text-fg-3 truncate hidden sm:inline">· {s.detail}</span>
                    </li>
                  ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {view === "lista" && (
        <Card className="overflow-hidden">
          <CardHeader title="Todas as automações" description={`${listed.length} de ${autos.length}`} />
          <div className="border-t border-line/[0.06]">
            {!loaded && (
              <div className="p-5 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <Skeleton key={i} className="h-10" />
                ))}
              </div>
            )}
            {loaded && autos.length === 0 && (
              <EmptyState
                icon={<IconAutomacao className="w-5 h-5" />}
                title="Ainda não há automações"
                description="Cria uma aqui ou pede ao Holiday no chat."
                action={
                  <Button variant="primary" size="sm" onClick={() => setEditing({ ...EMPTY })}>
                    Nova automação
                  </Button>
                }
              />
            )}
            {loaded && autos.length > 0 && listed.length === 0 && <EmptyState title="Nada corresponde aos filtros" description="Muda o tipo ou a pesquisa." />}
            <ul>
              {listed.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 border-b border-line/[0.05] last:border-b-0 hover:bg-line/[0.02]">
                  <ColorDot color={KIND[a.kind].color} />
                  <div className={cn("flex-1 min-w-[200px]", !a.active && "opacity-55")}>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[13.5px] font-medium">{a.name}</span>
                      <Badge tone={KIND[a.kind].tone}>{KIND[a.kind].label}</Badge>
                      {a.trigger === "evento" && <Badge tone="warning">Evento</Badge>}
                      {a.created_by === "holiday" && <Badge tone="violet">Criada pelo Holiday</Badge>}
                      {!a.active && <Badge>Pausada</Badge>}
                    </div>
                    <div className="text-[12px] text-fg-3 mt-1">
                      {a.trigger === "evento"
                        ? `Quando ${(events[a.event || ""] || a.event || "").toLowerCase()} · ${daysText(a.days)} a partir das ${a.time} · ${cooldownText(a.cooldown_hours)}`
                        : `${daysText(a.days)} às ${a.time}`}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" disabled={busyId === a.id} onClick={() => toggle(a)}>
                      {a.active ? "Pausar" : "Retomar"}
                    </Button>
                    <Button size="sm" variant="ghost" loading={busyId === a.id} onClick={() => runNow(a)}>
                      Correr já
                    </Button>
                    <Button size="sm" variant="secondary" disabled={busyId === a.id} onClick={() => setEditing(toForm(a))}>
                      Editar
                    </Button>
                    <Button size="sm" variant="ghost" className="hover:text-danger" disabled={busyId === a.id} onClick={() => setConfirmDel(a)}>
                      Apagar
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </Card>
      )}

      {/* Detalhe da ocorrencia */}
      <Modal
        open={!!(selected && sel)}
        onClose={() => setSelected(null)}
        title={sel?.name}
        description={
          selected &&
          new Date(selected.at).toLocaleString("pt-PT", { timeZone: TZ, weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
        }
        width={520}
        footer={
          sel && (
            <>
              <Button variant="ghost" onClick={() => setSelected(null)}>
                Fechar
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setSelected(null);
                  setEditing(toForm(sel));
                }}
              >
                Editar
              </Button>
              <Button variant="primary" loading={busyId === sel.id} onClick={() => runNow(sel)}>
                Correr já
              </Button>
            </>
          )
        }
      >
        {sel && selected && selStatus && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-1.5">
              <Badge tone={KIND[sel.kind].tone}>{KIND[sel.kind].label}</Badge>
              {sel.trigger === "evento" && <Badge tone="warning">Evento</Badge>}
              <Badge tone={selStatus.tone} dot>
                {selStatus.label}
              </Badge>
            </div>
            <div>
              <Label>{sel.kind === "lembrete" ? "Mensagem" : "Instrução"}</Label>
              <p className="text-[13px] text-fg-2 whitespace-pre-wrap leading-relaxed">{sel.prompt}</p>
            </div>
            {selected.run && (
              <div className="rounded-lg bg-surface-2 border border-line/[0.07] p-3">
                <Label>Resultado</Label>
                <p className="text-[12.5px] text-fg-2 whitespace-pre-wrap">{selected.run.result || "—"}</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Confirmar apagar (substitui o window.confirm) */}
      <Modal
        open={!!confirmDel}
        onClose={() => setConfirmDel(null)}
        title="Apagar automação?"
        description={confirmDel ? `"${confirmDel.name}" deixa de correr. Não dá para desfazer.` : undefined}
        width={420}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDel(null)}>
              Cancelar
            </Button>
            <Button variant="danger" loading={!!confirmDel && busyId === confirmDel.id} onClick={() => confirmDel && remove(confirmDel)}>
              Apagar
            </Button>
          </>
        }
      >
        {null}
      </Modal>

      {/* Formulario */}
      <Modal
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Editar automação" : "Nova automação"}
        description="Corre sozinha no horário ou quando o Holiday deteta a situação."
        width={520}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={saving} disabled={!canSave} onClick={save}>
              Guardar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="flex flex-col gap-4">
            <div>
              <Label>Nome</Label>
              <Input
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && canSave && !saving && save()}
                placeholder="Ex: Registar o jantar"
              />
            </div>

            <div>
              <Label>Quando corre</Label>
              <Segmented<"horario" | "evento">
                value={editing.trigger}
                onChange={(v) => setEditing({ ...editing, trigger: v })}
                options={[
                  { value: "horario", label: "Por horário" },
                  { value: "evento", label: "Por evento", color: KIND.evento.color },
                ]}
              />
            </div>

            {editing.trigger === "evento" && (
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3">
                <div>
                  <Label>Situação</Label>
                  <Select value={editing.event} onChange={(e) => setEditing({ ...editing, event: e.target.value })}>
                    {Object.entries(events).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>No máximo</Label>
                  <Select value={editing.cooldown_hours} onChange={(e) => setEditing({ ...editing, cooldown_hours: Number(e.target.value) })}>
                    {COOLDOWNS.map((h) => (
                      <option key={h} value={h}>
                        {cooldownText(h)}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            )}

            <div>
              <Label>Tipo</Label>
              <Segmented<Kind>
                value={editing.kind}
                onChange={(k) => setEditing({ ...editing, kind: k })}
                options={(["lembrete", "analise", "trabalho"] as Kind[]).map((k) => ({ value: k, label: KIND[k].label, color: KIND[k].color }))}
              />
              <p className="text-[12px] text-fg-3 mt-2 leading-relaxed">
                {editing.kind === "lembrete"
                  ? `O Holiday publica esta mensagem no chat ${editing.trigger === "evento" ? "quando o evento acontecer" : "à hora marcada"}.`
                  : editing.kind === "analise"
                  ? "O Holiday analisa o teu estado (tarefas, nutrição, histórico) e responde no chat."
                  : "O Holiday trabalha nisto sozinho e deixa o resultado no chat (o que mexer no Todoist/calendário pede aprovação)."}
              </p>
            </div>

            <div>
              <Label>{editing.kind === "lembrete" ? "Mensagem" : "Instrução"}</Label>
              <Textarea
                value={editing.prompt}
                onChange={(e) => setEditing({ ...editing, prompt: e.target.value })}
                rows={3}
                placeholder={editing.kind === "lembrete" ? "Ex: Já registaste o jantar?" : "Ex: revê a semana e diz-me as 3 prioridades"}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
              <div>
                <Label hint={editing.days.length ? daysText(editing.days) : "nenhum dia"}>Dias</Label>
                <div className="flex flex-wrap gap-1" role="group" aria-label="Dias da semana">
                  {DAY_ORDER.map((d) => {
                    const on = editing.days.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setEditing({ ...editing, days: on ? editing.days.filter((x) => x !== d) : [...editing.days, d] })}
                        className={cn(
                          "h-8 w-10 rounded-lg text-[12px] font-medium border transition-colors",
                          on ? "bg-accent/15 border-accent/40 text-fg" : "bg-surface-2 border-line/10 text-fg-3 hover:text-fg-2 hover:border-line/15"
                        )}
                      >
                        {DAY_SHORT[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Label>{editing.trigger === "evento" ? "A partir das" : "Hora"}</Label>
                <Select value={editing.time} onChange={(e) => setEditing({ ...editing, time: e.target.value })} className="tabular w-[110px]">
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </Select>
              </div>
            </div>
          </div>
        )}
      </Modal>
    </Page>
  );
}

function StatusText({ tone, children }: { tone: "success" | "danger" | "neutral" | "warning"; children: React.ReactNode }) {
  const c = { success: "text-success", danger: "text-danger", warning: "text-warning", neutral: "text-fg-3" }[tone];
  return <span className={cn("ml-auto text-[10.5px] font-medium", c)}>{children}</span>;
}

function Chevron({ dir }: { dir: "left" | "right" }) {
  return (
    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={dir === "left" ? "m15 18-6-6 6-6" : "m9 18 6-6-6-6"} />
    </svg>
  );
}
