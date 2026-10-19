"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { localDateKey } from "@/lib/dates";
import { plainTitle } from "@/lib/text";
import { taskBucket } from "@/lib/task-bucket";
import { PILLARS, TaskCache } from "@/lib/types";
import type { Overview } from "@/lib/overview";
import { Badge, Button, Card, ColorDot, EmptyState, Page, PageHeader, Segmented, Skeleton, useToast } from "@/components/ui";
import { TaskList, type TaskRow, type TaskTab } from "@/components/TaskList";
import { AreaChart, ColumnChart, Meter, SegmentBar, Sparkline, VIZ, compact, shortDay } from "@/components/charts";
import { cn } from "@/lib/cn";

export const dynamic = "force-dynamic";

type Range = "7" | "30" | "90";

function greeting(h: number) {
  if (h < 6) return "Boa noite";
  if (h < 13) return "Bom dia";
  if (h < 20) return "Boa tarde";
  return "Boa noite";
}

function ago(iso: string) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora mesmo";
  if (min < 60) return `há ${min} min`;
  const h = Math.round(min / 60);
  return h < 48 ? `há ${h} h` : `há ${Math.round(h / 24)} dias`;
}

const lisbonDay = (iso: string) => new Date(iso).toLocaleDateString("en-CA", { timeZone: "Europe/Lisbon" });

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Lisbon" });
}

// Variacao com sinal; a cor diz se e bom ou mau (direcao x objetivo).
function Delta({ value, unit = "%", goodWhenUp = true, digits = 0 }: { value: number | null; unit?: string; goodWhenUp?: boolean; digits?: number }) {
  if (value === null || !Number.isFinite(value)) return null;
  const r = Number(value.toFixed(digits));
  if (r === 0) return <Badge>= 0{unit}</Badge>;
  const good = r > 0 === goodWhenUp;
  return (
    <Badge tone={good ? "success" : "danger"}>
      {r > 0 ? "↑" : "↓"} {Math.abs(r)}
      {unit}
    </Badge>
  );
}

// Indicador: rotulo, valor grande, variacao e um rodape (tendencia/medidor).
function Kpi(props: { label: string; value: React.ReactNode; unit?: string; delta?: React.ReactNode; hint?: React.ReactNode; footer?: React.ReactNode; href: string }) {
  return (
    <Link href={props.href} className="group block">
      <Card className="h-full px-4 pt-3.5 pb-3 flex flex-col gap-2 transition-colors group-hover:border-line/15 group-hover:bg-surface-2/60">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[12.5px] text-fg-2">{props.label}</span>
          {props.delta}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-[28px] font-semibold leading-none tracking-[-0.02em] text-fg">{props.value}</span>
          {props.unit && <span className="text-[13px] text-fg-3">{props.unit}</span>}
        </div>
        <div className="mt-auto pt-1">{props.footer}</div>
        {props.hint && <div className="text-[11.5px] text-fg-3 -mt-0.5">{props.hint}</div>}
      </Card>
    </Link>
  );
}

function CardTitle(props: { title: string; sub?: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-[13.5px] font-semibold text-fg">{props.title}</h3>
        {props.sub && <p className="text-[12px] text-fg-3 mt-0.5">{props.sub}</p>}
      </div>
      {props.right}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: React.ReactNode; tone?: "danger" | "warning" | "success" }) {
  return (
    <div className="flex items-center justify-between h-9 border-b border-line/[0.05] last:border-b-0">
      <span className="text-[12.5px] text-fg-2">{label}</span>
      <span className={cn("text-[13px] font-medium tabular", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : tone === "success" ? "text-success" : "text-fg")}>{value}</span>
    </div>
  );
}

const KIND_COLOR: Record<string, string> = { lembrete: VIZ.blue, analise: VIZ.violet, trabalho: VIZ.orange };
const KIND_LABEL: Record<string, string> = { lembrete: "Lembrete", analise: "Análise", trabalho: "Trabalho" };

export default function DashboardPage() {
  const toast = useToast();
  const [range, setRange] = useState<Range>("30");
  const [ov, setOv] = useState<Overview | null>(null);
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [tab, setTab] = useState<TaskTab>("today");

  const load = useCallback(async (days: Range) => {
    const [o, t] = await Promise.allSettled([api<Overview>(`/api/overview?days=${days}`), api<{ tasks: TaskCache[] }>("/api/tasks")]);
    if (o.status === "fulfilled") setOv(o.value);
    if (t.status === "fulfilled") setTasks(t.value.tasks);
    const failed = [o, t].find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    setError(failed ? failed.reason?.message || String(failed.reason) : null);
  }, []);

  useEffect(() => {
    load(range);
  }, [load, range]);

  async function sync() {
    setSyncing(true);
    try {
      const { summary: s } = await api<{ summary: Record<string, any> }>("/api/sync", { method: "POST" });
      const closed = (s.todoist_closed || 0) + (s.ticktick_closed || 0);
      const errors = ["todoist_error", "ticktick_error", "calendar_error", "classify_error", "agenda_error"].filter((k) => s[k]).map((k) => s[k]);
      const detail = `Todoist ${s.todoist} · TickTick ${s.ticktick} · Calendar ${s.calendar}` + (closed ? ` · ${closed} concluídas na origem` : "");
      if (errors.length) toast.error("Sincronizado com erros", `${detail}. ${errors.join(" | ")}`);
      else toast.success("Sincronizado", detail);
      await load(range);
    } catch (e: any) {
      toast.error("Falhou a sincronização", e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function completeTask(id: string) {
    const task = tasks?.find((t) => t.id === id);
    try {
      const data = await api<{ remote_synced: boolean; remote_error: string | null }>("/api/tasks/complete", { body: { task_id: id } });
      setTasks((prev) => prev?.filter((t) => t.id !== id) ?? prev);
      if (!data.remote_synced && data.remote_error) toast.info("Concluída só aqui", `Falhou no app de origem: ${data.remote_error}`);
      else toast.success("Tarefa concluída", task ? plainTitle(task.content) : undefined);
      load(range);
    } catch (e: any) {
      toast.error("Não foi possível concluir", e.message);
    }
  }

  const today = localDateKey();
  const lists = useMemo(() => {
    if (!tasks) return null;
    const out: Record<TaskTab, TaskRow[]> = { today: [], overdue: [], undated: [] };
    for (const t of tasks) {
      const b = taskBucket(t.due, !!t.recurring, today);
      if (b === "future") continue;
      const p = PILLARS.find((x) => x.key === t.pillar);
      out[b].push({
        id: t.id,
        title: plainTitle(t.content),
        date: !t.due ? "" : t.recurring && t.due < today ? "rotina" : t.due === today ? "hoje" : shortDay(t.due),
        pillarLabel: p?.label ?? "Sem pilar",
        pillarColor: p?.color ?? "rgb(var(--fg-3))",
        source: t.source,
      });
    }
    out.overdue.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  }, [tasks, today]);

  const now = new Date();
  const dateLabel = now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });
  const syncStale = ov && (!ov.lastSyncAt || Date.now() - new Date(ov.lastSyncAt).getTime() > 3 * 3600000);
  const days = Number(range);

  // derivados
  const doneDelta = ov && ov.tasks.donePrevRange > 0 ? ((ov.tasks.doneInRange - ov.tasks.donePrevRange) / ov.tasks.donePrevRange) * 100 : null;
  const weightDelta = ov?.body.latest?.weight != null && ov.body.previous?.weight != null ? ov.body.latest.weight - ov.body.previous.weight : null;
  const kcalTarget = ov?.nutrition.targetKcal ?? null;
  const kcalPct = ov && kcalTarget ? Math.round((ov.nutrition.todayIn / kcalTarget) * 100) : null;
  const pillarMax = ov ? Math.max(1, ...ov.tasks.byPillar.map((p) => p.overdue + p.today + p.undated)) : 1;
  const h = ov?.holiday;

  return (
    <Page wide>
      <PageHeader
        title={greeting(now.getHours())}
        description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        meta={
          ov && (
            <Badge tone={syncStale ? "warning" : "neutral"} dot>
              {ov.lastSyncAt ? `Sincronizado ${ago(ov.lastSyncAt)}` : "Nunca sincronizado"}
              {syncStale && " · desatualizado"}
            </Badge>
          )
        }
        actions={
          <>
            <Segmented<Range>
              value={range}
              onChange={setRange}
              options={[
                { value: "7", label: "7 dias" },
                { value: "30", label: "30 dias" },
                { value: "90", label: "90 dias" },
              ]}
            />
            <Button variant="primary" onClick={sync} loading={syncing}>
              Sincronizar
            </Button>
          </>
        }
      />

      {error && (
        <Card className="border-danger/30 px-4 py-3 flex items-center gap-3">
          <span className="text-[13px] text-danger flex-1">Não foi possível carregar: {error}</span>
          <Button size="sm" onClick={() => load(range)}>
            Tentar de novo
          </Button>
        </Card>
      )}

      {/* ── Indicadores ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
        {!ov ? (
          [0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[138px] rounded-card" />)
        ) : (
          <>
            <Kpi
              href="/dashboard"
              label={`Concluídas · ${days}d`}
              value={ov.tasks.doneInRange}
              delta={<Delta value={doneDelta} />}
              footer={<Sparkline values={ov.series.map((d) => d.done)} color={VIZ.blue} />}
              hint={doneDelta === null ? "sem período anterior para comparar" : `vs ${ov.tasks.donePrevRange} nos ${days} dias anteriores`}
            />
            <Kpi
              href="/nutricao"
              label="Calorias hoje"
              value={ov.nutrition.todayIn ? ov.nutrition.todayIn.toLocaleString("pt-PT") : "0"}
              unit={kcalTarget ? `/ ${kcalTarget.toLocaleString("pt-PT")} kcal` : "kcal"}
              delta={kcalPct !== null ? <Badge tone={kcalPct > 105 ? "warning" : "neutral"}>{kcalPct}%</Badge> : null}
              footer={<Meter value={ov.nutrition.todayIn} max={kcalTarget || Math.max(ov.nutrition.todayIn, 1)} color={VIZ.orange} className="my-[13px]" />}
              hint={ov.nutrition.avgKcal ? `média ${ov.nutrition.avgKcal.toLocaleString("pt-PT")} kcal em ${ov.nutrition.loggedDays} dias registados` : "sem refeições no período"}
            />
            <Kpi
              href="/nutricao"
              label="Peso"
              value={ov.body.latest?.weight != null ? ov.body.latest.weight.toLocaleString("pt-PT") : "—"}
              unit={ov.body.latest?.weight != null ? "kg" : undefined}
              delta={<Delta value={weightDelta} unit=" kg" digits={1} goodWhenUp={ov.nutrition.goal === "ganhar"} />}
              footer={ov.body.series.length > 1 ? <Sparkline values={ov.body.series.map((s) => s.weight)} color={VIZ.aqua} domain="minmax" /> : <div className="h-8" />}
              hint={
                ov.body.latest
                  ? `${ov.body.bmi ? `IMC ${ov.body.bmi.toLocaleString("pt-PT")} · ` : ""}medido ${shortDay(ov.body.latest.date)}`
                  : "regista o peso na Nutrição"
              }
            />
            <Kpi
              href="/nutricao"
              label="Passos hoje"
              value={ov.steps.today != null ? ov.steps.today.toLocaleString("pt-PT") : "—"}
              footer={ov.series.some((d) => d.steps) ? <Sparkline values={ov.series.map((d) => d.steps)} color={VIZ.violet} /> : <div className="h-8" />}
              hint={ov.steps.avg ? `média ${ov.steps.avg.toLocaleString("pt-PT")} por dia` : "sem dados de passos no período"}
            />
          </>
        )}
      </div>

      {/* ── Produtividade + hoje ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <CardTitle
            title="Produtividade"
            sub={`Tarefas concluídas por dia · últimos ${days} dias`}
            right={
              ov && (
                <div className="text-right">
                  <div className="text-[22px] font-semibold leading-none">{ov.tasks.doneInRange}</div>
                  <div className="text-[11.5px] text-fg-3 mt-1">{(ov.tasks.doneInRange / days).toFixed(1).replace(".", ",")} / dia</div>
                </div>
              )
            }
          />
          {!ov ? (
            <Skeleton className="h-[220px]" />
          ) : ov.tasks.doneInRange ? (
            <AreaChart data={ov.series.map((d) => ({ x: d.date, y: d.done }))} color={VIZ.blue} unit="tarefas" height={220} />
          ) : (
            <EmptyState className="h-[220px] justify-center" title="Nenhuma tarefa concluída neste período" description="Conclui tarefas aqui, no Todoist ou no TickTick — o gráfico enche-se a cada sync." />
          )}
        </Card>

        <Card className="p-5 flex flex-col">
          <CardTitle title="Hoje" sub="Estado das tarefas abertas" />
          {ov ? (
            <>
              <Stat label="Para hoje (com rotina)" value={ov.tasks.today} />
              <Stat label="Atrasadas" value={ov.tasks.overdue} tone={ov.tasks.overdue ? "danger" : undefined} />
              <Stat label="Atraso mais antigo" value={ov.tasks.oldestOverdueDays != null ? `${ov.tasks.oldestOverdueDays} dias` : "—"} tone={ov.tasks.oldestOverdueDays && ov.tasks.oldestOverdueDays > 7 ? "warning" : undefined} />
              <Stat label="Sem data" value={ov.tasks.undated} />
              <div className="mt-5">
                <div className="text-[12px] text-fg-3 mb-2">Quem faz (GTD)</div>
                <SegmentBar
                  items={[
                    { label: "Eu", value: ov.tasks.gtd.eu, color: VIZ.blue },
                    { label: "Holiday", value: ov.tasks.gtd.holiday, color: VIZ.orange },
                    { label: "Por esclarecer", value: ov.tasks.gtd.unclear, color: "rgb(var(--fg-3) / 0.55)" },
                  ]}
                />
              </div>
            </>
          ) : (
            <Skeleton className="flex-1 min-h-[200px]" />
          )}
        </Card>
      </div>

      {/* ── Tarefas + pilares ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 items-start">
        <div className="xl:col-span-2">
          <TaskList tab={tab} onTab={setTab} lists={lists} onComplete={completeTask} />
        </div>
        <Card className="p-5">
          <CardTitle title="Pilares" sub="Tarefas abertas por área da vida" />
          <div className="flex flex-wrap gap-x-4 gap-y-1 mb-4">
            {[
              ["Atrasadas", VIZ.red],
              ["Hoje", VIZ.blue],
              ["Sem data", VIZ.yellow],
            ].map(([l, c]) => (
              <span key={l} className="flex items-center gap-1.5 text-[12px] text-fg-2">
                <span className="w-2 h-2 rounded-sm" style={{ background: c }} />
                {l}
              </span>
            ))}
          </div>
          <ul className="flex flex-col gap-3">
            {(ov?.tasks.byPillar ?? PILLARS.map((p) => ({ ...p, overdue: 0, today: 0, undated: 0 }))).map((p) => {
              const total = p.overdue + p.today + p.undated;
              return (
                <li key={p.key} className="grid grid-cols-[88px_1fr_28px] items-center gap-3" title={`${p.label}: ${p.overdue} atrasadas, ${p.today} hoje, ${p.undated} sem data`}>
                  <span className="flex items-center gap-2 text-[12.5px] text-fg-2 truncate">
                    <ColorDot color={p.color} />
                    {p.label}
                  </span>
                  <div className="h-2.5 rounded-[3px] bg-line/[0.05] overflow-hidden">
                    <div className="h-full flex gap-[2px]" style={{ width: `${(total / pillarMax) * 100}%` }}>
                      {p.overdue > 0 && <div className="h-full rounded-l-[3px]" style={{ flexGrow: p.overdue, background: VIZ.red }} />}
                      {p.today > 0 && <div className="h-full" style={{ flexGrow: p.today, background: VIZ.blue }} />}
                      {p.undated > 0 && <div className="h-full" style={{ flexGrow: p.undated, background: VIZ.yellow }} />}
                    </div>
                  </div>
                  <span className="text-[12.5px] tabular text-right text-fg">{ov ? total : "—"}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      {/* ── Saude ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <Card className="xl:col-span-2 p-5">
          <CardTitle
            title="Calorias ingeridas"
            sub={kcalTarget ? `Por dia, contra a meta de ${kcalTarget.toLocaleString("pt-PT")} kcal (${ov?.nutrition.goal})` : "Por dia · define o perfil na Nutrição para ver a meta"}
            right={
              <Link href="/nutricao" className="text-[12.5px] text-fg-2 hover:text-fg">
                Nutrição →
              </Link>
            }
          />
          {ov ? (
            ov.nutrition.loggedDays ? (
              <ColumnChart
                data={ov.series.map((d) => ({ x: d.date, y: d.kcal_in }))}
                color={VIZ.orange}
                unit="kcal"
                height={200}
                reference={kcalTarget ? { value: kcalTarget, label: `meta ${compact(kcalTarget)}` } : undefined}
              />
            ) : (
              <EmptyState title="Sem refeições neste período" description="Tira uma foto ao prato no chat do Holiday ou regista na Nutrição." action={<Link href="/agente"><Button size="sm">Abrir o Holiday</Button></Link>} />
            )
          ) : (
            <Skeleton className="h-[200px]" />
          )}
          {ov && ov.nutrition.todayIn > 0 && (
            <div className="mt-5 pt-4 border-t border-line/[0.06]">
              <div className="text-[12px] text-fg-3 mb-2">Macros de hoje</div>
              <SegmentBar
                unit="g"
                items={[
                  { label: "Proteína", value: ov.nutrition.macros.protein, color: VIZ.blue },
                  { label: "Hidratos", value: ov.nutrition.macros.carbs, color: VIZ.orange },
                  { label: "Gordura", value: ov.nutrition.macros.fat, color: VIZ.aqua },
                ]}
              />
            </div>
          )}
        </Card>

        <Card className="p-5 flex flex-col">
          <CardTitle title="Peso" sub={ov?.body.series.length ? `${ov.body.series.length} medições` : "Evolução"} />
          {ov ? (
            ov.body.series.length >= 2 ? (
              <AreaChart data={ov.body.series.map((s) => ({ x: s.date, y: s.weight }))} color={VIZ.aqua} unit="kg" domain="auto" dots fmt={(n) => n.toFixed(0)} height={180} />
            ) : (
              <EmptyState
                title={ov.body.series.length ? `${ov.body.series[0].weight.toLocaleString("pt-PT")} kg em ${shortDay(ov.body.series[0].date)}` : "Sem medições"}
                description="O gráfico aparece a partir da segunda medição."
                action={<Link href="/nutricao"><Button size="sm">Registar peso</Button></Link>}
              />
            )
          ) : (
            <Skeleton className="h-[180px]" />
          )}
          {ov?.body.latest && (
            <div className="grid grid-cols-3 gap-2 mt-auto pt-4">
              {[
                ["IMC", ov.body.bmi?.toLocaleString("pt-PT")],
                ["Gordura", ov.body.latest.fat != null ? `${ov.body.latest.fat}%` : null],
                ["Basal", ov.nutrition.bmr ? `${compact(ov.nutrition.bmr)} kcal` : null],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg bg-line/[0.03] border border-line/[0.05] px-3 py-2">
                  <div className="text-[11px] text-fg-3">{l}</div>
                  <div className="text-[13.5px] font-medium tabular">{v ?? "—"}</div>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── Holiday, automacoes, agenda ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-stretch">
        <Card className="p-5">
          <CardTitle
            title="Holiday"
            sub={`Atividade · últimos ${days} dias`}
            right={
              <Link href="/agente" className="text-[12.5px] text-fg-2 hover:text-fg">
                Abrir →
              </Link>
            }
          />
          {h ? (
            <>
              <SegmentBar
                items={[
                  { label: "Feitas", value: h.actions.executed, color: "rgb(var(--success))" },
                  { label: "À espera", value: h.actions.proposed, color: "rgb(var(--warning))" },
                  { label: "Falharam", value: h.actions.failed, color: "rgb(var(--danger))" },
                  { label: "Rejeitadas", value: h.actions.rejected, color: "rgb(var(--fg-3) / 0.55)" },
                ]}
              />
              <div className="grid grid-cols-3 gap-2 mt-5">
                {[
                  ["Mensagens", h.messages],
                  ["Memórias", h.memories],
                  ["Automações", h.automationsActive],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-line/[0.03] border border-line/[0.05] px-3 py-2">
                    <div className="text-[11px] text-fg-3">{l}</div>
                    <div className="text-[15px] font-semibold tabular">{v}</div>
                  </div>
                ))}
              </div>
              {h.pending.length > 0 && (
                <Link href="/agente" className="mt-4 flex items-center gap-2 rounded-lg border border-warning/25 bg-warning/[0.06] px-3 py-2.5 hover:bg-warning/10 transition-colors">
                  <span className="w-1.5 h-1.5 rounded-full bg-warning flex-none" />
                  <span className="text-[12.5px] text-fg flex-1 min-w-0 truncate">
                    {h.actions.proposed} {h.actions.proposed === 1 ? "ação precisa" : "ações precisam"} da tua aprovação
                  </span>
                  <span className="text-[12px] text-fg-2">Rever</span>
                </Link>
              )}
            </>
          ) : (
            <Skeleton className="h-[160px]" />
          )}
        </Card>

        <Card className="p-5">
          <CardTitle
            title="Próximas automações"
            sub={h ? `${h.runs.ok} execuções ok${h.runs.failed ? ` · ${h.runs.failed} falharam` : ""} no período` : undefined}
            right={
              <Link href="/automacoes" className="text-[12.5px] text-fg-2 hover:text-fg">
                Ver agenda →
              </Link>
            }
          />
          {h ? (
            h.next.length ? (
              <ul>
                {h.next.map((a, i) => (
                  <li key={i} className="flex items-center gap-3 h-11 border-b border-line/[0.05] last:border-b-0">
                    <span className="w-1 h-6 rounded-full flex-none" style={{ background: KIND_COLOR[a.kind] || VIZ.blue }} />
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] truncate">{a.name}</div>
                      <div className="text-[11.5px] text-fg-3">{KIND_LABEL[a.kind] || a.kind}</div>
                    </div>
                    <div className="text-right text-[12px] tabular">
                      <div className="text-fg">{time(a.at)}</div>
                      <div className="text-fg-3">{lisbonDay(a.at) === ov!.today ? "hoje" : shortDay(lisbonDay(a.at))}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Nada agendado" description="Pede ao Holiday: “lembra-me todas as noites às 21h de registar o jantar”." />
            )
          ) : (
            <Skeleton className="h-[160px]" />
          )}
        </Card>

        <Card className="p-5">
          <CardTitle
            title="Agenda"
            sub="Próximos 7 dias · Google Calendar"
            right={
              <Link href="/agendar" className="text-[12.5px] text-fg-2 hover:text-fg">
                Agenda →
              </Link>
            }
          />
          {ov ? (
            ov.agenda.length ? (
              <ul>
                {ov.agenda.map((e, i) => (
                  <li key={i} className="flex items-center gap-3 h-11 border-b border-line/[0.05] last:border-b-0">
                    <div className="w-11 flex-none text-center">
                      <div className="text-[10.5px] uppercase text-fg-3">{e.date === ov.today ? "hoje" : new Date(e.date + "T12:00:00Z").toLocaleDateString("pt-PT", { weekday: "short" }).replace(".", "")}</div>
                      <div className="text-[13px] font-semibold tabular leading-tight">{Number(e.date.slice(8))}</div>
                    </div>
                    <span className="flex-1 min-w-0 truncate text-[13px]">{e.title}</span>
                    <span className="text-[12px] text-fg-3 tabular">{e.time ?? "dia todo"}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState title="Agenda livre" description="Sem eventos nos próximos 7 dias." action={<Link href="/agendar"><Button size="sm">Novo evento</Button></Link>} />
            )
          ) : (
            <Skeleton className="h-[160px]" />
          )}
        </Card>
      </div>
    </Page>
  );
}
