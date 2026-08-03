import { NextRequest, NextResponse } from "next/server";
import { fetchCalendarEvents, addCalendarEvent, deleteCalendarEvent } from "@/lib/integrations";

export const runtime = "nodejs";

export async function GET() {
  try {
    const now = new Date();
    const future = new Date(now.getTime() + 14 * 24 * 60 * 60000);
    const events = await fetchCalendarEvents(now.toISOString(), future.toISOString());
    return NextResponse.json({ ok: true, events });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { summary, start, end, reminder_minutes } = await req.json();
    if (!summary || !start || !end) {
      return NextResponse.json({ error: "summary, start e end obrigatorios" }, { status: 400 });
    }
    const result = await addCalendarEvent(summary, start, end, reminder_minutes);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true, id: result.id });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { event_id } = await req.json();
    if (!event_id) return NextResponse.json({ error: "event_id obrigatorio" }, { status: 400 });
    const result = await deleteCalendarEvent(event_id);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || String(e) }, { status: 500 });
  }
}
