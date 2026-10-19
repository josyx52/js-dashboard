// Em que "balde" fica uma tarefa num dado dia. Usado pelo dashboard (browser)
// e pelo Holiday (servidor) — uma so regra para os dois.
// Recorrentes (rotina diaria) contam sempre como "hoje", mesmo que a ultima
// ocorrencia tenha ficado por marcar.
export type Bucket = "overdue" | "today" | "future" | "undated";

export function taskBucket(due: string | null, recurring: boolean, today: string): Bucket {
  if (!due) return "undated";
  if (due === today || (recurring && due < today)) return "today";
  return due < today ? "overdue" : "future";
}
