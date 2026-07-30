"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { PILLARS, TaskCache } from "@/lib/types";
import PillarCard from "@/components/PillarCard";

export const dynamic = "force-dynamic";

type PillarCounts = Record<string, { today: number; overdue: number }>;

export default function DashboardPage() {
  const [counts, setCounts] = useState<PillarCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [syncTime, setSyncTime] = useState<string>("--:--");

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
      .select("pillar, due, status")
      .eq("status", "open");

    if (error) {
      setError(error.message);
      return;
    }

    const acc: PillarCounts = {};
    for (const p of PILLARS) acc[p.key] = { today: 0, overdue: 0 };
    for (const t of (data || []) as Pick<TaskCache, "pillar" | "due" | "status">[]) {
      if (!t.pillar) continue;
      if (!acc[t.pillar]) continue;
      if (t.due && t.due < today) acc[t.pillar].overdue += 1;
      else acc[t.pillar].today += 1;
    }
    setCounts(acc);
    setSyncTime(new Date().toLocaleTimeString("pt-PT", { hour: "2-digit", minute: "2-digit" }));
  }

  return (
    <div className="flex-1 min-w-0 p-[28px_36px] flex flex-col gap-6">
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
            onClick={load}
            className="flex items-center gap-2 px-4 py-[9px] bg-transparent border border-white/[0.14] rounded text-white font-mono font-semibold text-[11px] tracking-[0.05em] whitespace-nowrap hover:border-accent hover:text-accent transition-colors"
          >
            ↻ ATUALIZAR
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

      <div
        className="grid gap-3"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
      >
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
    </div>
  );
}
