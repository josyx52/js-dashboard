import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { analyzeMealPhoto, insertPhotoMeal } from "@/lib/nutrition";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    if (!userId) return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });

    const { imageBase64 } = await req.json();
    if (!imageBase64) return NextResponse.json({ error: "imagem obrigatoria" }, { status: 400 });

    const estimate = await analyzeMealPhoto(imageBase64);
    const { data, error } = await insertPhotoMeal(supabaseServer(), userId, estimate);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, log: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
