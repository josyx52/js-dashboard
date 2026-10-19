import type { SupabaseClient } from "@supabase/supabase-js";

export interface MealEstimate {
  label: string;
  kcal: number;
  protein_g: number | null;
  carbs_g: number | null;
  fat_g: number | null;
}

// Analisa a foto de um prato com a Gemini e devolve a estimativa.
// imageBase64 pode vir como data URL ("data:image/jpeg;base64,...") ou base64 puro.
export async function analyzeMealPhoto(imageBase64: string): Promise<MealEstimate> {
  const geminiKey = process.env.GEMINI_API_KEY;
  if (!geminiKey) throw new Error("GEMINI_API_KEY nao configurado");

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
                  "Analisa esta foto de um prato de comida. Estima com o melhor do teu " +
                  "julgamento visual (tipo de alimento, porção aparente). Responde APENAS " +
                  'com JSON valido, sem texto a mais: ' +
                  '{"label": "nome curto do prato", "kcal": numero, "protein_g": numero, ' +
                  '"carbs_g": numero, "fat_g": numero}',
              },
              { inline_data: { mime_type: mimeType, data: base64Data } },
            ],
          },
        ],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" },
      }),
    }
  );
  const j: any = await r.json();
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${j?.error?.message || ""}`.trim());

  let txt: string = j.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || "{}";
  txt = txt.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
  const p = JSON.parse(txt);
  return {
    label: p.label || "Refeição",
    kcal: Math.round(Number(p.kcal) || 0),
    protein_g: p.protein_g ?? null,
    carbs_g: p.carbs_g ?? null,
    fat_g: p.fat_g ?? null,
  };
}

export async function insertPhotoMeal(sb: SupabaseClient, userId: string, m: MealEstimate) {
  return sb
    .from("nutrition_logs")
    .insert({ user_id: userId, ...m, type: "in", source: "foto" })
    .select()
    .single();
}
