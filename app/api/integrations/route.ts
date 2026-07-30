import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const userId = process.env.SYNC_USER_ID;
    if (!userId) {
      return NextResponse.json({ error: "SYNC_USER_ID nao configurado" }, { status: 500 });
    }
    const body = await req.json();
    const { name, api_key, description } = body;
    if (!name) {
      return NextResponse.json({ error: "nome obrigatorio" }, { status: 400 });
    }

    const sb = supabaseServer();
    const { data, error } = await sb
      .from("integrations")
      .insert({
        user_id: userId,
        name,
        description: description || null,
        api_key_encrypted: api_key || null, // TODO: mover para Supabase Vault
        connected: false,
        capabilities: [],
      })
      .select()
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, integration: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
