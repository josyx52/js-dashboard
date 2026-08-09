import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    const geminiKey = process.env.GEMINI_API_KEY;
    if (!userId) return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });
    if (!geminiKey) return NextResponse.json({ error: "GEMINI_API_KEY nao configurado" }, { status: 500 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "imagem obrigatoria" }, { status: 400 });

    // imageBase64 chega como data URL ("data:image/jpeg;base64,...."); a Gemini
    // precisa do base64 puro + o mime_type em separado.
    const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/.exec(imageBase64);
    const mimeType = match?.[1] || "image/jpeg";
    const base64Data = match?.[2] || imageBase64;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    'Analisa esta foto de um prato de comida. Responde APENAS com JSON valido: ' +
                    '{"label": "nome curto do prato", "kcal": numero_estimado_de_calorias}',
                },
                { inline_data: { mime_type: mimeType, data: base64Data } },
              ],
            },
          ],
          generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
        }),
      }
    );
    const j = await r.json();
    if (!r.ok) return NextResponse.json({ error: JSON.stringify(j) }, { status: 500 });

    let txt = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
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
