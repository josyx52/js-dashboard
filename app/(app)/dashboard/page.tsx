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
    // Leitura simples — nenhuma chamada ao Groq aqui. O pilar ja foi
    // classificado e gravado na primeira sincronizacao (ver /lib/pillar-sync.ts,
    // a implementar na fase de sincronizacao real com Todoist/TickTick).
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
  }

  return (
    <div className="p-7">
      <header className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">
            <span className="text-white">Sistema</span>{" "}
            <span className="text-accent">JS</span>
          </h1>
          <p className="text-[13px] font-mono text-muted mt-1">
            {new Date().toLocaleDateString("pt-PT")}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={sync}
            disabled={syncing}
            className="bg-accent text-white rounded-lg px-4 py-2 text-[13px] font-semibold hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {syncing ? "a sincronizar…" : "⟳ Sincronizar agora"}
          </button>
          <button
            onClick={load}
            className="bg-white/[0.05] border border-border rounded-lg px-4 py-2 text-[13px] font-medium hover:bg-white/[0.08] transition-colors"
          >
            ↻ Atualizar
          </button>
        </div>
      </header>

      {syncMsg && (
        <div className="bg-white/[0.04] border border-border rounded-lg px-4 py-2 text-[12.5px] text-muted mb-4">
          {syncMsg}
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 text-red-400 border border-red-500/30 rounded-lg px-4 py-3 text-[13px] mb-4">
          Erro ao carregar: {error}
        </div>
      )}

      <section className="mb-8">
        <h2 className="text-[11px] font-mono uppercase tracking-wider text-muted mb-3">
          Pilares
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
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
      </section>

      {/* TODO fase seguinte: reaproveitar os graficos e listas
          (Atrasadas/Para hoje, Todoist vs TickTick) do sistema-3-pilares,
          agora lendo de tasks_cache em vez de chamar as APIs ao vivo. */}
    </div>
  );
}
