import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { validateProviderToken } from "@/lib/integrations";

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

    let validationNote: string | null = null;
    if (api_key) {
      const check = await validateProviderToken(name, api_key);
      if (check.recognized && !check.valid) {
        return NextResponse.json(
          { error: `API key invalida para ${name}: ${check.error || "rejeitada pelo provedor"}` },
          { status: 400 }
        );
      }
      if (!check.recognized) {
        validationNote = "integracao nao reconhecida — a API key nao foi validada contra nenhum provedor";
      }
    }

    const sb = supabaseServer();

    let vaultId: string | null = null;
    if (api_key) {
      const { data: vid, error: vaultErr } = await sb.rpc("create_integration_secret", {
        secret: api_key,
        secret_name: `integration-${name}-${Date.now()}`,
      });
      if (vaultErr) return NextResponse.json({ error: "vault: " + vaultErr.message }, { status: 500 });
      vaultId = vid;
    }

    const { data, error } = await sb
      .from("integrations")
      .insert({
        user_id: userId,
        name,
        description: description || null,
        api_key_vault_id: vaultId,
        connected: false,
        capabilities: [],
      })
      .select("id, name, description, connected, capabilities, created_at")
      .single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, integration: data, validation_note: validationNote });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
