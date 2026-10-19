import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { decideAction } from "@/lib/holiday/run";

export const runtime = "nodejs";

// { decision: "approve" | "reject" } — aprova (executa) ou rejeita um cartao.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { decision } = await req.json();
    if (decision !== "approve" && decision !== "reject") {
      return NextResponse.json({ error: "decision deve ser approve ou reject" }, { status: 400 });
    }
    const action = await decideAction(supabaseServer(), id, decision);
    return NextResponse.json({ ok: true, action });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 409 });
  }
}
