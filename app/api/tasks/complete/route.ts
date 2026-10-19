import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { completeTask } from "@/lib/tasks";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const { task_id } = await req.json();
    if (!task_id) return NextResponse.json({ error: "task_id obrigatorio" }, { status: 400 });

    const result = await completeTask(supabaseServer(), task_id);
    if (!result.ok) {
      const status = result.error === "tarefa nao encontrada" ? 404 : 500;
      return NextResponse.json({ error: result.error }, { status });
    }
    return NextResponse.json({ ok: true, remote_synced: result.remote_synced, remote_error: result.remote_error });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
