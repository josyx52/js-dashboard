import type { SupabaseClient } from "@supabase/supabase-js";
import { completeTodoistTask, completeTickTickTask } from "@/lib/integrations";

// Concluir uma tarefa na origem (Todoist/TickTick) e na cache local.
// Usado pela rota /api/tasks/complete e pelas acoes do Holiday.
export async function completeTask(
  sb: SupabaseClient,
  taskId: string
): Promise<{ ok: boolean; remote_synced: boolean; remote_error: string | null; error?: string }> {
  const { data: task, error: fetchErr } = await sb
    .from("tasks_cache")
    .select("id, source, source_project_id")
    .eq("id", taskId)
    .single();
  if (fetchErr || !task) {
    return { ok: false, remote_synced: false, remote_error: null, error: fetchErr?.message || "tarefa nao encontrada" };
  }

  let remoteOk = false;
  let remoteError: string | undefined;

  if (task.source === "todoist") {
    const result = await completeTodoistTask(task.id);
    remoteOk = result.ok;
    remoteError = result.error;
  } else if (task.source === "ticktick") {
    const rawId = task.id.replace(/^tt-/, "");
    if (!task.source_project_id) {
      remoteError = "sem source_project_id — sincroniza de novo antes de tentar concluir";
    } else {
      const result = await completeTickTickTask(task.source_project_id, rawId);
      remoteOk = result.ok;
      remoteError = result.error;
    }
  }

  // Marca localmente sempre — mesmo que a chamada remota falhe, o
  // utilizador ve o resultado esperado na app; o erro remoto fica
  // reportado para diagnostico, nao bloqueia a UI.
  const { error: updateErr } = await sb.from("tasks_cache").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", taskId);
  if (updateErr) return { ok: false, remote_synced: remoteOk, remote_error: remoteError || null, error: updateErr.message };

  return { ok: true, remote_synced: remoteOk, remote_error: remoteOk ? null : remoteError || null };
}
