import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    const groqKey = process.env.GROQ_API_KEY;
    if (!userId) return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });
    if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY nao configurado" }, { status: 500 });

    const { message, history } = await req.json();
    if (!message) return NextResponse.json({ error: "mensagem obrigatoria" }, { status: 400 });

    const sb = supabaseServer();

    await sb.from("agent_messages").insert({ user_id: userId, role: "user", content: message, mode: "chat" });

    const msgs = [
      {
        role: "system",
        content:
          "Es o assistente do Sistema JS de Josuel, organizado em 6 pilares " +
          "(Deus, Saude, Familia, Estudo, Negocio, Trabalho). Responde em portugues, " +
          "de forma direta e curta.",
      },
      ...(history || []).map((h: any) => ({ role: h.role, content: h.content })),
      { role: "user", content: message },
    ];

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: msgs, temperature: 0.4 }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: JSON.stringify(j) }, { status: 500 });

    const reply = j.choices?.[0]?.message?.content?.trim() || "(sem resposta)";
    await sb.from("agent_messages").insert({ user_id: userId, role: "assistant", content: reply, mode: "chat" });

    return NextResponse.json({ ok: true, reply });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
