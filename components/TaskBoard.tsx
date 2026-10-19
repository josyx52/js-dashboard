"use client";
import { useMemo, useState } from "react";
import { api } from "@/lib/api";
import { localDateKey } from "@/lib/dates";
import { plainTitle } from "@/lib/text";
import { taskBucket } from "@/lib/task-bucket";
import { PILLARS, TaskCache } from "@/lib/types";
import { useToast } from "@/components/ui";
import { TaskList, type TaskRow, type TaskTab } from "@/components/TaskList";
import { shortDay } from "@/components/charts";

// Concluir uma tarefa (aqui e no app de origem), com feedback. Partilhado
// pela lista de tarefas e pela agenda do dia.
export function useCompleteTask(onDone: (id: string) => void) {
  const toast = useToast();
  return async function complete(id: string, title?: string) {
    try {
      const data = await api<{ remote_synced: boolean; remote_error: string | null }>("/api/tasks/complete", { body: { task_id: id } });
      onDone(id);
      if (!data.remote_synced && data.remote_error) toast.info("Concluída só aqui", `Falhou no app de origem: ${data.remote_error}`);
      else toast.success("Tarefa concluída", title);
    } catch (e: any) {
      toast.error("Não foi possível concluir", e.message);
    }
  };
}

// Caixa de tarefas abertas (hoje / atrasadas / sem data) com conclusao.
export function TaskBoard({ tasks, onCompleted }: { tasks: TaskCache[] | null; onCompleted: (id: string) => void }) {
  const [tab, setTab] = useState<TaskTab>("today");
  const complete = useCompleteTask(onCompleted);
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

  return (
    <TaskList
      tab={tab}
      onTab={setTab}
      lists={lists}
      onComplete={(id) => complete(id, lists ? Object.values(lists).flat().find((r) => r.id === id)?.title : undefined)}
    />
  );
}
