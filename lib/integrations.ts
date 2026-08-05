export interface RawTask {
  id: string;
  content: string;
  due: string | null;
}

export async function fetchTodoist(): Promise<RawTask[]> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return [];
  const h = { Authorization: `Bearer ${token}` };
  const out: RawTask[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("https://api.todoist.com/api/v1/tasks");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await fetch(url, { headers: h });
    if (!r.ok) break;
    const j: any = await r.json();
    for (const t of j.results || []) {
      out.push({ id: t.id, content: t.content, due: t.due?.date || null });
    }
    cursor = j.next_cursor || null;
  } while (cursor);
  return out;
}

export async function fetchTickTick(): Promise<RawTask[]> {
  const token = process.env.TICKTICK_ACCESS_TOKEN;
  if (!token) return [];
  const h = { Authorization: `Bearer ${token}` };
  const out: RawTask[] = [];
  const projR = await fetch("https://api.ticktick.com/open/v1/project", { headers: h });
  if (!projR.ok) return [];
  const projects: any[] = await projR.json();
  for (const p of projects) {
    const dr = await fetch(`https://api.ticktick.com/open/v1/project/${p.id}/data`, { headers: h });
    if (!dr.ok) continue;
    const d: any = await dr.json();
    for (const t of d.tasks || []) {
      if (t.status === 2) continue; // ja concluida
      out.push({
        id: `tt-${t.id}`,
        content: t.title,
        due: t.dueDate ? String(t.dueDate).slice(0, 10) : null,
      });
    }
  }
  return out;
}

async function googleAccessToken(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  return j.access_token || null;
}

async function fitbitAccessToken(): Promise<string | null> {
  const clientId = process.env.FITBIT_CLIENT_ID;
  const clientSecret = process.env.FITBIT_CLIENT_SECRET;
  const refreshToken = process.env.FITBIT_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const r = await fetch("https://api.fitbit.com/oauth2/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }),
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  return j.access_token || null;
}

export async function fetchFitbitSteps(date: string): Promise<number | null> {
  const token = await fitbitAccessToken();
  if (!token) return null;
  const r = await fetch(`https://api.fitbit.com/1/user/-/activities/date/${date}.json`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) return null;
  const j: any = await r.json();
  return j.summary?.steps ?? null;
}

export interface RawEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
}

export async function fetchCalendarEvents(timeMin: string, timeMax: string): Promise<RawEvent[]> {
  const token = await googleAccessToken();
  if (!token) return [];
  const url = new URL("https://www.googleapis.com/calendar/v3/calendars/primary/events");
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j.items || []).map((e: any) => ({
    id: e.id,
    summary: e.summary || "(sem título)",
    start: e.start?.dateTime || e.start?.date,
    end: e.end?.dateTime || e.end?.date,
  }));
}

export async function addCalendarEvent(
  summary: string,
  start: string,
  end: string,
  reminderMinutes?: number
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = await googleAccessToken();
  if (!token) return { ok: false, error: "sem acesso ao Google Calendar" };
  const body: any = { summary, start: { dateTime: start }, end: { dateTime: end } };
  if (reminderMinutes) {
    body.reminders = { useDefault: false, overrides: [{ method: "popup", minutes: reminderMinutes }] };
  }
  const r = await fetch("https://www.googleapis.com/calendar/v3/calendars/primary/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await r.json();
  if (!r.ok) return { ok: false, error: JSON.stringify(j) };
  return { ok: true, id: j.id };
}

export async function deleteCalendarEvent(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const token = await googleAccessToken();
  if (!token) return { ok: false, error: "sem acesso ao Google Calendar" };
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${eventId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 410) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: JSON.stringify(j) };
  }
  return { ok: true };
}
