import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const groqKey = process.env.GROQ_API_KEY;
    const { task_id, integration_id } = await req.json();
    if (!task_id || !integration_id) {
      return NextResponse.json({ error: "task_id e integration_id obrigatorios" }, { status: 400 });
    }

    const sb = supabaseServer();

    const { data: integ } = await sb
      .from("integrations")
      .select("id, name, connected")
      .eq("id", integration_id)
      .single();
    if (!integ || !integ.connected) {
      return NextResponse.json({ error: "integracao nao esta ligada" }, { status: 400 });
    }

    const { data: task } = await sb.from("tasks_cache").select("id, content").eq("id", task_id).single();
    if (!task) return NextResponse.json({ error: "tarefa nao encontrada" }, { status: 404 });

    const { data: tools } = await sb
      .from("integration_tools")
      .select("name, description")
      .eq("integration_id", integration_id);

    let chosenTool = tools?.[0]?.name || null;
    if (groqKey && tools && tools.length > 0) {
      const prompt = `Tarefa: "${task.content}". Ferramentas disponiveis: ${tools
        .map((t) => `${t.name} (${t.description})`)
        .join("; ")}. Responde APENAS com o nome exato da ferramenta mais adequada.`;
      try {
        const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "openai/gpt-oss-120b",
            messages: [{ role: "user", content: prompt }],
            temperature: 0,
          }),
        });
        const j = await r.json();
        const pick = j.choices?.[0]?.message?.content?.trim();
        if (pick && tools.some((t) => t.name === pick)) chosenTool = pick;
      } catch {
        // mantem o fallback (primeira tool)
      }
    }

    const { data, error } = await sb
      .from("delegations")
      .insert({ task_id, integration_id, status: "em_analise" })
      .select()
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true, delegation: data, chosen_tool: chosenTool });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
