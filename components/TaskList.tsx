"use client";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { Card, EmptyState, Segmented, Skeleton } from "@/components/ui";

export interface TaskRow {
  id: string;
  title: string;
  date: string; // texto ja formatado ("hoje", "recorrente", "28/07")
  pillarLabel: string;
  pillarColor: string;
  source: string;
}

export type TaskTab = "today" | "overdue" | "undated";

// Lista de tarefas com separadores. Concluir e otimista: a linha sai logo e
// volta se o servidor falhar (o pai trata do erro).
export function TaskList(props: {
  tab: TaskTab;
  onTab: (t: TaskTab) => void;
  lists: Record<TaskTab, TaskRow[]> | null;
  onComplete: (id: string) => Promise<void>;
}) {
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const rows = props.lists?.[props.tab] || [];

  async function complete(id: string) {
    setLeaving((s) => new Set(s).add(id));
    try {
      await props.onComplete(id);
    } finally {
      setLeaving((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  const count = (t: TaskTab) => props.lists?.[t].length ?? 0;
  const EMPTY: Record<TaskTab, { title: string; description: string }> = {
    today: { title: "Nada para hoje", description: "Sem tarefas com data de hoje nem rotina por fazer." },
    overdue: { title: "Nada atrasado", description: "Tudo em dia. Continua assim." },
    undated: { title: "Tudo com data", description: "Não há tarefas por agendar." },
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-5 pt-4 pb-3">
        <h3 className="text-[13.5px] font-semibold flex-1">Tarefas</h3>
        <Segmented<TaskTab>
          size="sm"
          value={props.tab}
          onChange={props.onTab}
          options={[
            { value: "today", label: <>Hoje <span className="text-fg-3 tabular">{count("today")}</span></> },
            { value: "overdue", label: <>Atrasadas <span className="text-fg-3 tabular">{count("overdue")}</span></> },
            { value: "undated", label: <>Sem data <span className="text-fg-3 tabular">{count("undated")}</span></> },
          ]}
        />
      </div>
      <div className="border-t border-line/[0.06]">
        {!props.lists && (
          <div className="p-5 flex flex-col gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-5" />
            ))}
          </div>
        )}
        {props.lists && rows.length === 0 && <EmptyState title={EMPTY[props.tab].title} description={EMPTY[props.tab].description} />}
        <ul>
          {rows.map((t) => {
            const busy = leaving.has(t.id);
            return (
              <li
                key={t.id}
                className={cn(
                  "group flex items-center gap-3 px-5 h-12 border-b border-line/[0.05] last:border-b-0 hover:bg-line/[0.025] transition-all",
                  busy && "opacity-40"
                )}
              >
                <button type="button"
                  onClick={() => complete(t.id)}
                  disabled={busy}
                  aria-label={`Concluir ${t.title}`}
                  className={cn(
                    "w-[18px] h-[18px] rounded-md border flex-none flex items-center justify-center transition-colors",
                    busy ? "bg-accent border-accent text-white" : "border-line/25 hover:border-accent text-transparent hover:text-accent/60"
                  )}
                >
                  <svg viewBox="0 0 24 24" className="w-3 h-3">
                    <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <span className={cn("flex-1 min-w-0 truncate text-[13.5px]", busy && "line-through")}>{t.title}</span>
                <span className="hidden sm:inline-flex items-center gap-1.5 text-[12px] text-fg-3 flex-none">
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: t.pillarColor }} />
                  {t.pillarLabel}
                </span>
                <span className={cn("text-[12px] tabular flex-none w-[74px] text-right", props.tab === "overdue" ? "text-danger" : "text-fg-3")}>{t.date}</span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
