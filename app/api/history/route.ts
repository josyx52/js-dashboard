import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { addDays, dateInTimeZone } from "@/lib/dates";

export const runtime = "nodejs";

// Historico diario (holiday_daily) dos ultimos N dias, para os graficos.
export async function GET(req: NextRequest) {
  try {
    const days = Math.min(90, Math.max(2, Number(req.nextUrl.searchParams.get("days")) || 14));
    const today = dateInTimeZone(new Date(), "Europe/Lisbon");
    const { data, error } = await supabaseServer()
      .from("holiday_daily")
      .select("date, done_count, overdue, today_pending, meals, kcal_in, deficit_pct, steps, weight_kg")
      .gte("date", addDays(today, -(days - 1)))
      .order("date");
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, today, days, rows: data || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
