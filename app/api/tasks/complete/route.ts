import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { completeTodoistTask, completeTickTickTask } from "@/lib/integrations";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { task_id } = await req.json();
    if (!task_id) return NextResponse.json({ error: "task_id obrigatorio" }, { status: 400 });

    const sb = supabaseServer();
    const { data: task, error: fetchErr } = await sb
      .from("tasks_cache")
      .select("id, source, source_project_id")
      .eq("id", task_id)
      .single();
    if (fetchErr || !task) {
      return NextResponse.json({ error: fetchErr?.message || "tarefa nao encontrada" }, { status: 404 });
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
    const { error: updateErr } = await sb.from("tasks_cache").update({ status: "done" }).eq("id", task_id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

    return NextResponse.json({ ok: true, remote_synced: remoteOk, remote_error: remoteOk ? null : remoteError });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
