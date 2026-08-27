export interface RawTask {
  id: string;
  content: string;
  due: string | null;
  projectId?: string;
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

// Cria uma tarefa real no Todoist — usada pela execucao real da delegacao GTD.
// Marca com o rotulo "delegada-agente" para se distinguir de tarefas normais.
export async function addTodoistTask(
  content: string
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return { ok: false, error: "TODOIST_API_TOKEN nao configurado" };
  const r = await fetch("https://api.todoist.com/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ content, labels: ["delegada-agente"] }),
  });
  const j: any = await r.json();
  if (!r.ok) return { ok: false, error: JSON.stringify(j) };
  return { ok: true, id: j.id };
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
        projectId: p.id,
      });
    }
  }
  return out;
}

// Validacao real do token contra o provedor — so para integracoes
// reconhecidas pelo nome (Todoist/TickTick). Integracoes arbitrarias
// criadas pelo utilizador nao tem API conhecida para validar contra.
export async function validateProviderToken(
  providerName: string,
  token: string
): Promise<{ recognized: boolean; valid: boolean; error?: string }> {
  const name = providerName.toLowerCase();
  if (name.includes("todoist")) {
    try {
      const r = await fetch("https://api.todoist.com/api/v1/tasks?limit=1", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { recognized: true, valid: r.ok, error: r.ok ? undefined : `Todoist respondeu ${r.status}` };
    } catch (e: any) {
      return { recognized: true, valid: false, error: e?.message };
    }
  }
  if (name.includes("ticktick")) {
    try {
      const r = await fetch("https://api.ticktick.com/open/v1/project", {
        headers: { Authorization: `Bearer ${token}` },
      });
      return { recognized: true, valid: r.ok, error: r.ok ? undefined : `TickTick respondeu ${r.status}` };
    } catch (e: any) {
      return { recognized: true, valid: false, error: e?.message };
    }
  }
  return { recognized: false, valid: true }; // nao reconhecido — nao ha como validar, aceita
}

export async function completeTodoistTask(taskId: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return { ok: false, error: "TODOIST_API_TOKEN nao configurado" };
  const r = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}/close`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 204) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: JSON.stringify(j) };
  }
  return { ok: true };
}

export async function completeTickTickTask(
  projectId: string,
  taskId: string
): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TICKTICK_ACCESS_TOKEN;
  if (!token) return { ok: false, error: "TICKTICK_ACCESS_TOKEN nao configurado" };
  const r = await fetch(
    `https://api.ticktick.com/open/v1/project/${projectId}/task/${taskId}/complete`,
    { method: "POST", headers: { Authorization: `Bearer ${token}` } }
  );
  if (!r.ok && r.status !== 200 && r.status !== 204) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: JSON.stringify(j) };
  }
  return { ok: true };
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

async function googleHealthAccessToken(): Promise<{ token: string | null; error?: string }> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_HEALTH_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return { token: null, error: "credenciais nao configuradas" };
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
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { token: null, error: j.error_description || j.error || `HTTP ${r.status}` };
  }
  const j: any = await r.json();
  return { token: j.access_token || null };
}

export async function fetchFitbitSteps(date: string): Promise<{ steps: number | null; error?: string }> {
  const { token, error } = await googleHealthAccessToken();
  if (!token) return { steps: null, error };
  const [year, month, day] = date.split("-").map(Number);
  const r = await fetch("https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      range: {
        start: { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
        end: { date: { year, month, day }, time: { hours: 23, minutes: 59, seconds: 59, nanos: 0 } },
      },
      windowSizeDays: 1,
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { steps: null, error: j.error?.message || `HTTP ${r.status}` };
  }
  const j: any = await r.json();
  const total = j.rollupDataPoints?.[0]?.steps?.countSum;
  return { steps: total ? parseInt(total, 10) : null };
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
