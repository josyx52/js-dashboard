import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { generateIntegrationTools } from "@/lib/groq";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    if (!userId) {
      return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });
    }
    const { id, connect } = await req.json();
    if (!id) return NextResponse.json({ error: "id obrigatorio" }, { status: 400 });

    const sb = supabaseServer();

    if (!connect) {
      const { error } = await sb.from("integrations").update({ connected: false }).eq("id", id);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ ok: true });
    }

    const { data: integ, error: fetchErr } = await sb
      .from("integrations")
      .select("id, name, description")
      .eq("id", id)
      .single();
    if (fetchErr || !integ) {
      return NextResponse.json({ error: fetchErr?.message || "integracao nao encontrada" }, { status: 404 });
    }

    // So gera tools se ainda nao existirem (nunca re-gerar a cada toggle)
    const { data: existingTools } = await sb
      .from("integration_tools")
      .select("id")
      .eq("integration_id", id)
      .limit(1);

    if (!existingTools || existingTools.length === 0) {
      const tools = await generateIntegrationTools(integ.name, integ.description || "");
      if (tools.length > 0) {
        await sb.from("integration_tools").insert(
          tools.map((t) => ({
            integration_id: id,
            name: t.name,
            description: t.description,
            input_schema: t.input_schema,
          }))
        );
      }
    }

    const { error: updErr } = await sb.from("integrations").update({ connected: true }).eq("id", id);
    if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
