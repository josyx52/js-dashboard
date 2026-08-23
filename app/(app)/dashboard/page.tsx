"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PILLARS, TaskCache } from "@/lib/types";
import PillarCard from "@/components/PillarCard";
import { LineChartCard, DonutCard, TaskListCard, ListItem } from "@/components/DashboardCharts";

export const dynamic = "force-dynamic";

type PillarCounts = Record<string, { today: number; overdue: number }>;

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
  const [syncTime, setSyncTime] = useState<string>("--:--");
  const [updating, setUpdating] = useState(false);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    load();
  }, []);

  async function sync() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await fetch("/api/sync", { method: "POST" });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setSyncMsg(
        `Todoist: ${data.summary.todoist} · TickTick: ${data.summary.ticktick} · Calendar: ${data.summary.calendar}` +
          (data.summary.classified ? ` · ${data.summary.classified} classificadas` : "")
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
    const today = new Date().toISOString().slice(0, 10);
    const { data, error } = await supabase
      .from("tasks_cache")
      .select("*")
      .eq("status", "open");

    if (error) {
      setError(error.message);
      return;
    }

    const rows = (data || []) as TaskCache[];
    setTasks(rows);

    const acc: PillarCounts = {};
    for (const p of PILLARS) acc[p.key] = { today: 0, overdue: 0 };
    for (const t of rows) {
      if (!t.pillar || !acc[t.pillar]) continue;
      if (t.due && t.due < today) acc[t.pillar].overdue += 1;
      else acc[t.pillar].today += 1;
    }
    setCounts(acc);
    setSyncTime(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
  }

  async function completeTask(id: string) {
    setCompletingIds((prev) => new Set(prev).add(id));
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: id }),
      });
      const data = await res.json();
      if (!data.remote_synced && data.remote_error) {
        setSyncMsg(`Concluída localmente, mas falhou no app de origem: ${data.remote_error}`);
      }
    } catch {
      // se a rota falhar por completo, ainda assim tenta refletir localmente
    }
    await load();
    setCompletingIds((prev) => {
      const s = new Set(prev);
      s.delete(id);
      return s;
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const rows = tasks || [];
  const todoistTasks = rows.filter((t) => t.source === "todoist");
  const ticktickTasks = rows.filter((t) => t.source === "ticktick");
  const overdueRows = rows.filter((t) => t.due && t.due < today);
  const todayRows = rows.filter((t) => !t.due || t.due >= today);

  const toListItem = (t: TaskCache): ListItem => {
    const meta = pillarMeta(t.pillar);
    return { id: t.id, title: t.content, date: t.due || "", pillarLabel: meta.label, pillarColor: meta.color };
  };

  const todoistOverdue = todoistTasks.filter((t) => t.due && t.due < today).length;
  const todoistToday = todoistTasks.length - todoistOverdue;
  const ticktickOverdue = ticktickTasks.filter((t) => t.due && t.due < today).length;
  const ticktickToday = ticktickTasks.length - ticktickOverdue;

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
          <div className="font-mono font-medium text-[12px] text-white/40 mt-1.5">sync {syncTime}</div>
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
        <LineChartCard
          todoist={[todoistOverdue, todoistToday]}
          ticktick={[ticktickOverdue, ticktickToday]}
        />
        <DonutCard overdue={overdueRows.length} today={todayRows.length} />
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
    </div>
  );
}
