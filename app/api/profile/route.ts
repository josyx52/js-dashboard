import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";

export const runtime = "nodejs";

const PROFILE_ID = "00000000-0000-0000-0000-000000000001";

export async function GET() {
  try {
    const { data, error } = await supabaseServer()
      .from("user_profile")
      .select("height_cm, age, sex, goal")
      .eq("id", PROFILE_ID)
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, profile: data });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { height_cm, age, sex, goal } = await req.json();
    const h = Number(height_cm);
    const a = Number(age);
    if (!(h > 50 && h < 260)) return NextResponse.json({ error: "altura invalida" }, { status: 400 });
    if (!(Number.isInteger(a) && a > 0 && a < 120)) return NextResponse.json({ error: "idade invalida" }, { status: 400 });
    if (sex !== "m" && sex !== "f") return NextResponse.json({ error: "sexo invalido" }, { status: 400 });
    if (!["perder", "manter", "ganhar"].includes(goal)) return NextResponse.json({ error: "objetivo invalido" }, { status: 400 });

    const { error } = await supabaseServer()
      .from("user_profile")
      .upsert({ id: PROFILE_ID, height_cm: h, age: a, sex, goal, updated_at: new Date().toISOString() });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
