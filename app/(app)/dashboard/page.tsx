"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { localDateKey } from "@/lib/dates";
import { plainTitle } from "@/lib/text";
import { taskBucket } from "@/lib/task-bucket";
import { PILLARS, TaskCache } from "@/lib/types";
import { Badge, Button, Card, ColorDot, Page, PageHeader, Skeleton, useToast } from "@/components/ui";
import { StatTile } from "@/components/StatTile";
import { TaskList, type TaskRow, type TaskTab } from "@/components/TaskList";
import { PillarStackCard, HistoryCard, type HistoryRow } from "@/components/DashboardCharts";

export const dynamic = "force-dynamic";

type History = { rows: HistoryRow[]; days: number; today: string };

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
  if (h < 48) return `há ${h} h`;
  return `há ${Math.round(h / 24)} dias`;
}

function shortDate(d: string) {
  return new Date(d + "T12:00:00Z").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

export default function DashboardPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [history, setHistory] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<TaskTab>("today");

  const load = useCallback(async () => {
    try {
      const data = await api<{ tasks: TaskCache[]; last_sync_at: string | null }>("/api/tasks");
      setTasks(data.tasks);
      setLastSync(data.last_sync_at);
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
    api<History>("/api/history?days=14")
      .then(setHistory)
      .catch(() => setHistory(null));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function refresh() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }

  async function sync() {
    setSyncing(true);
    try {
      const { summary: s } = await api<{ summary: Record<string, any> }>("/api/sync", { method: "POST" });
      const closed = (s.todoist_closed || 0) + (s.ticktick_closed || 0);
      const errors = ["todoist_error", "ticktick_error", "calendar_error", "classify_error", "agenda_error"].filter((k) => s[k]).map((k) => s[k]);
      const detail =
        `Todoist ${s.todoist} · TickTick ${s.ticktick} · Calendar ${s.calendar}` +
        (s.classified ? ` · ${s.classified} classificadas` : "") +
        (closed ? ` · ${closed} concluídas na origem` : "");
      if (errors.length) toast.error("Sincronizado com erros", `${detail}. ${errors.join(" | ")}`);
      else toast.success("Sincronizado", detail);
      await load();
    } catch (e: any) {
      toast.error("Falhou a sincronização", e.message);
    } finally {
      setSyncing(false);
    }
  }

  // Otimista: a tarefa sai logo da lista; se o servidor falhar volta a entrar.
  async function completeTask(id: string) {
    const before = tasks;
    const task = tasks?.find((t) => t.id === id);
    try {
      const data = await api<{ remote_synced: boolean; remote_error: string | null }>("/api/tasks/complete", { body: { task_id: id } });
      setTasks((prev) => prev?.filter((t) => t.id !== id) ?? prev);
      if (!data.remote_synced && data.remote_error) toast.info("Concluída só aqui", `Falhou no app de origem: ${data.remote_error}`);
      else toast.success("Tarefa concluída", task ? plainTitle(task.content) : undefined);
    } catch (e: any) {
      setTasks(before);
      toast.error("Não foi possível concluir", e.message);
    }
  }

  const today = localDateKey();
  const view = useMemo(() => {
    if (!tasks) return null;
    const lists: Record<TaskTab, TaskRow[]> = { today: [], overdue: [], undated: [] };
    const pillars = PILLARS.map((p) => ({ label: p.label, color: p.color, overdue: 0, today: 0, undated: 0 }));
    for (const t of tasks) {
      const b = taskBucket(t.due, !!t.recurring, today);
      if (b === "future") continue;
      const p = PILLARS.findIndex((x) => x.key === t.pillar);
      if (p >= 0) pillars[p][b] += 1;
      lists[b].push({
        id: t.id,
        title: plainTitle(t.content),
        date: !t.due ? "" : t.recurring && t.due < today ? "rotina" : t.due === today ? "hoje" : shortDate(t.due),
        pillarLabel: p >= 0 ? PILLARS[p].label : "Sem pilar",
        pillarColor: p >= 0 ? PILLARS[p].color : "rgb(var(--fg-3))",
        source: t.source,
      });
    }
    lists.overdue.sort((a, b) => a.date.localeCompare(b.date));
    return { lists, pillars };
  }, [tasks, today]);

  const doneToday = history?.rows.find((r) => r.date === history.today)?.done_count ?? null;
  const syncStale = !lastSync || Date.now() - new Date(lastSync).getTime() > 3 * 3600000;
  const now = new Date();
  const dateLabel = now.toLocaleDateString("pt-PT", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Page>
      <PageHeader
        title={greeting(now.getHours())}
        description={dateLabel.charAt(0).toUpperCase() + dateLabel.slice(1)}
        meta={
          tasks && (
            <Badge tone={syncStale ? "warning" : "neutral"} dot>
              {lastSync ? `Sincronizado ${ago(lastSync)}` : "Nunca sincronizado"}
              {syncStale && " · desatualizado"}
            </Badge>
          )
        }
        actions={
          <>
            <Button variant="ghost" onClick={refresh} loading={refreshing}>
              Atualizar
            </Button>
            <Button variant="primary" onClick={sync} loading={syncing}>
              Sincronizar
            </Button>
          </>
        }
      />

      {error && (
        <Card className="border-danger/30 px-4 py-3 flex items-center gap-3">
          <span className="text-[13px] text-danger flex-1">Não foi possível carregar as tarefas: {error}</span>
          <Button size="sm" onClick={refresh}>
            Tentar de novo
          </Button>
        </Card>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile label="Para hoje" value={view ? view.lists.today.length : "—"} hint="inclui rotina" onClick={() => setTab("today")} active={tab === "today"} />
        <StatTile
          label="Atrasadas"
          value={view ? view.lists.overdue.length : "—"}
          tone={view && view.lists.overdue.length > 0 ? "danger" : "default"}
          hint={view && view.lists.overdue.length === 0 ? "tudo em dia" : "por resolver"}
          onClick={() => setTab("overdue")}
          active={tab === "overdue"}
        />
        <StatTile label="Sem data" value={view ? view.lists.undated.length : "—"} hint="por agendar" onClick={() => setTab("undated")} active={tab === "undated"} />
        <StatTile label="Concluídas hoje" value={doneToday ?? "—"} tone={doneToday ? "success" : "default"} hint="segundo o histórico" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4 items-start">
        <TaskList tab={tab} onTab={setTab} lists={view?.lists ?? null} onComplete={completeTask} />
        <Card className="p-5">
          <h3 className="text-[13.5px] font-semibold">Pilares</h3>
          <p className="text-[12.5px] text-fg-3 mt-1 mb-3">Para hoje e atrasadas, por área da vida.</p>
          <ul className="flex flex-col">
            {(view?.pillars ?? PILLARS.map((p) => ({ label: p.label, color: p.color, today: 0, overdue: 0, undated: 0 }))).map((p) => (
              <li key={p.label} className="flex items-center gap-3 h-10 border-b border-line/[0.05] last:border-b-0">
                <ColorDot color={p.color} />
                <span className="flex-1 text-[13px]">{p.label}</span>
                {view ? (
                  <>
                    <span className="text-[12.5px] tabular text-fg-2 w-16 text-right">{p.today} hoje</span>
                    <span className={"text-[12.5px] tabular w-20 text-right " + (p.overdue ? "text-danger" : "text-fg-3")}>{p.overdue} atras.</span>
                  </>
                ) : (
                  <Skeleton className="h-4 w-28" />
                )}
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1.25fr_1fr] gap-4">
        {view ? <PillarStackCard rows={view.pillars} /> : <Skeleton className="h-[280px] rounded-card" />}
        {history ? <HistoryCard rows={history.rows} days={history.days} today={history.today} /> : <Skeleton className="h-[280px] rounded-card" />}
      </div>
    </Page>
  );
}
