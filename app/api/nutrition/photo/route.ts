import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    const groqKey = process.env.GROQ_API_KEY;
    if (!userId) return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });
    if (!groqKey) return NextResponse.json({ error: "GROQ_API_KEY nao configurado" }, { status: 500 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "imagem obrigatoria" }, { status: 400 });

    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "meta-llama/llama-4-scout-17b-16e-instruct",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  'Analisa esta foto de um prato de comida. Responde APENAS com JSON valido: ' +
                  '{"label": "nome curto do prato", "kcal": numero_estimado_de_calorias}',
              },
              { type: "image_url", image_url: { url: imageBase64 } },
            ],
          },
        ],
        temperature: 0.2,
      }),
    });
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: JSON.stringify(j) }, { status: 500 });

    let txt = j.choices?.[0]?.message?.content?.trim() || "{}";
    txt = txt.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    const parsed = JSON.parse(txt);

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("nutrition_logs")
      .insert({
        user_id: userId,
        label: parsed.label || "Refeição",
        kcal: parsed.kcal || 0,
        type: "in",
        source: "foto",
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, log: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
