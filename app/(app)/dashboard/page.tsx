"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { localDateKey } from "@/lib/dates";
import { plainTitle } from "@/lib/text";
import { PILLARS, TaskCache } from "@/lib/types";
import PillarCard from "@/components/PillarCard";
import { PillarStackCard, HistoryCard, TaskListCard, ListItem, type HistoryRow } from "@/components/DashboardCharts";

export const dynamic = "force-dynamic";

type PillarCounts = Record<string, { today: number; overdue: number }>;

// Recorrentes (ex: rotina diaria) contam sempre como "hoje", mesmo que a
// ultima ocorrencia tenha ficado por marcar — senao "Para hoje" ficava vazio
// e a rotina inteira aparecia como atrasada ha meses.
function bucket(t: TaskCache, today: string): "overdue" | "today" | "future" | "undated" {
  if (!t.due) return "undated";
  if (t.due === today || (t.recurring && t.due < today)) return "today";
  return t.due < today ? "overdue" : "future";
}

function pillarMeta(key: string | null) {
  const p = PILLARS.find((p) => p.key === key);
  return { label: p ? p.label : "—", color: p ? p.color : "#666" };
}

export default function DashboardPage() {
  const [tasks, setTasks] = useState<TaskCache[] | null>(null);
  const [counts, setCounts] = useState<PillarCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [history, setHistory] = useState<{ rows: HistoryRow[]; days: number; today: string } | null>(null);
  const [updating, setUpdating] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const data = await api<{ summary: Record<string, any> }>("/api/sync", { method: "POST" });
      const s = data.summary;
      const closed = (s.todoist_closed || 0) + (s.ticktick_closed || 0);
      const errors = ["todoist_error", "ticktick_error", "calendar_error", "classify_error", "agenda_error"]
        .filter((k) => s[k])
        .map((k) => s[k]);
      setSyncMsg(
        `Todoist: ${s.todoist} · TickTick: ${s.ticktick} · Calendar: ${s.calendar}` +
          (s.classified ? ` · ${s.classified} classificadas` : "") +
          (closed ? ` · ${closed} já concluídas na origem` : "") +
          (errors.length ? ` · ERROS: ${errors.join(" | ")}` : "")
      );
      await load();
    } catch (e: any) {
      setSyncMsg("Erro na sincronização: " + e.message);
    } finally {
      setSyncing(false);
    }
  }

  async function load() {
    setError(null);
    const today = localDateKey();
    let data: { tasks: TaskCache[]; last_sync_at: string | null };
    try {
      data = await api("/api/tasks");
    } catch (e: any) {
      setError(e.message);
      return;
    }

    api<{ rows: HistoryRow[]; days: number; today: string }>("/api/history?days=14")
      .then(setHistory)
      .catch(() => setHistory(null));

    const rows = data.tasks;
    setTasks(rows);
    setLastSync(data.last_sync_at);

    const acc: PillarCounts = {};
    for (const p of PILLARS) acc[p.key] = { today: 0, overdue: 0 };
    for (const t of rows) {
      if (!t.pillar || !acc[t.pillar]) continue;
      const b = bucket(t, today);
      if (b === "overdue") acc[t.pillar].overdue += 1;
      else if (b === "today") acc[t.pillar].today += 1;
    }
    setCounts(acc);
  }

  async function completeTask(id: string) {
    setCompletingIds((prev) => new Set(prev).add(id));
    try {
      const data = await api<{ remote_synced: boolean; remote_error: string | null }>("/api/tasks/complete", {
        body: { task_id: id },
      });
      if (!data.remote_synced && data.remote_error) {
        setSyncMsg(`Concluída localmente, mas falhou no app de origem: ${data.remote_error}`);
      }
    } catch (e: any) {
      setSyncMsg("Erro ao concluir: " + e.message);
    }
    await load();
    setCompletingIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  const today = localDateKey();
  const rows = tasks || [];
  const overdueRows = rows.filter((t) => bucket(t, today) === "overdue");
  // "Para hoje" = so o que vence hoje. Antes entravam tambem as tarefas sem
  // data e as futuras (ex: os tutoriais do Todoist apareciam como "hoje").
  const todayRows = rows.filter((t) => bucket(t, today) === "today");
  const undatedRows = rows.filter((t) => bucket(t, today) === "undated");

  const toListItem = (t: TaskCache): ListItem => {
    const meta = pillarMeta(t.pillar);
    const date = t.recurring && t.due && t.due < today ? "recorrente" : t.due || "";
    return { id: t.id, title: plainTitle(t.content), date, pillarLabel: meta.label, pillarColor: meta.color };
  };

  const pillarRows = PILLARS.map((p) => {
    const mine = rows.filter((t) => t.pillar === p.key);
    return {
      label: p.label,
      color: p.color,
      overdue: mine.filter((t) => bucket(t, today) === "overdue").length,
      today: mine.filter((t) => bucket(t, today) === "today").length,
      undated: mine.filter((t) => bucket(t, today) === "undated").length,
    };
  });

  const syncAgeH = lastSync ? (Date.now() - new Date(lastSync).getTime()) / 3600000 : null;
  const syncLabel = lastSync
    ? new Date(lastSync).toLocaleString("pt-PT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : "nunca";
  const syncStale = syncAgeH === null || syncAgeH > 3;

  return (
    <div className="flex-1 min-w-0 p-4 sm:p-[28px_36px] flex flex-col gap-6">
      <div className="flex items-start justify-between gap-5">
        <div>
          <div className="flex items-center gap-1.5 px-[8px_10px] py-1 bg-[rgba(61,220,132,0.12)] rounded">
            <div className="w-[6px] h-[6px] rounded-[1px] bg-[#3DDC84] flex-none animate-[pulse-dot_2s_ease-in-out_infinite]" />
            <span className="font-mono font-bold text-[11px] tracking-[0.03em] text-[#3DDC84]">
              OPERACIONAL
            </span>
          </div>
          <div className={"font-mono font-medium text-[12px] mt-1.5 " + (syncStale ? "text-[#E8B93F]" : "text-white/40")}>
            último sync {syncLabel}
            {syncStale && " · desatualizado"}
          </div>
        </div>
        <div className="flex gap-2 flex-none">
          <button
            onClick={sync}
            disabled={syncing}
            className="flex items-center gap-2 px-4 py-[9px] bg-transparent border border-white/[0.14] rounded text-white font-mono font-semibold text-[11px] tracking-[0.05em] whitespace-nowrap hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {syncing ? "…" : "⟳ SINCRONIZAR"}
          </button>
          <button
            onClick={async () => {
              setUpdating(true);
              await load();
              setUpdating(false);
            }}
            disabled={updating}
            className="flex items-center gap-2 px-4 py-[9px] bg-transparent border border-white/[0.14] rounded text-white font-mono font-semibold text-[11px] tracking-[0.05em] whitespace-nowrap hover:border-accent hover:text-accent transition-colors disabled:opacity-50"
          >
            {updating ? "…" : "↻ ATUALIZAR"}
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="bg-white/[0.04] border border-white/[0.08] rounded px-4 py-2 font-mono text-[11.5px] text-white/50">
          {syncMsg}
        </div>
      )}
      {error && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/30 rounded px-4 py-2 font-mono text-[11.5px]">
          Erro ao carregar: {error}
        </div>
      )}

      <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
        {PILLARS.map((p) => (
          <PillarCard
            key={p.key}
            label={p.label}
            color={p.color}
            today={counts?.[p.key]?.today ?? 0}
            overdue={counts?.[p.key]?.overdue ?? 0}
          />
        ))}
      </div>

      <div className="grid grid-cols-1 lg:[grid-template-columns:1.3fr_1fr] gap-4">
        <PillarStackCard rows={pillarRows} />
        {history ? (
          <HistoryCard rows={history.rows} days={history.days} today={history.today} />
        ) : (
          <div className="animate-pulse" style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, minHeight: 240 }} />
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <TaskListCard
          title="Atrasadas"
          items={overdueRows.map(toListItem)}
          accentColor="#FF5F5F"
          borderColor="rgba(255,95,95,0.25)"
          dateColor="rgba(255,95,95,0.75)"
          onComplete={completeTask}
          completingIds={completingIds}
        />
        <TaskListCard
          title="Para hoje"
          items={todayRows.map(toListItem)}
          accentColor="#F54E00"
          borderColor="rgba(245,78,0,0.25)"
          dateColor="rgba(244,244,242,0.4)"
          onComplete={completeTask}
          completingIds={completingIds}
        />
      </div>

      {undatedRows.length > 0 && (
        <TaskListCard
          title="Sem data"
          items={undatedRows.map(toListItem)}
          accentColor="rgba(244,244,242,0.5)"
          borderColor="rgba(255,255,255,0.08)"
          dateColor="rgba(244,244,242,0.4)"
          onComplete={completeTask}
          completingIds={completingIds}
        />
      )}
    </div>
  );
}
