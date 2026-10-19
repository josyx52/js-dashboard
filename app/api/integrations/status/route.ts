import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { servicesStatus } from "@/lib/connectors";

export const runtime = "nodejs";

// Testa ao vivo cada servico ligado ao sistema.
export async function GET() {
  try {
    return NextResponse.json({ ok: true, services: await servicesStatus(supabaseServer()) });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
