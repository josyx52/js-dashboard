import { serviceAccountJson, serviceAccountToken } from "@/lib/google-sa";
import { dateInTimeZone } from "@/lib/dates";

export interface RawTask {
  id: string;
  content: string;
  due: string | null;
  projectId?: string;
  recurring?: boolean;
}

// Marca de versao — muda a cada push, para confirmarmos sem ambiguidade
// se o Cloudflare esta mesmo a servir o codigo mais recente.
export const DEPLOY_MARKER = "google-sa-1";


// Resultado de uma leitura a um provedor. `ok: false` quando o token falta
// ou o pedido falha — nesse caso o sync NAO pode concluir que as tarefas
// desapareceram (uma lista vazia por erro nao e o mesmo que zero tarefas).
export interface FetchResult<T> {
  ok: boolean;
  items: T[];
  error?: string;
}

export async function fetchTodoist(): Promise<FetchResult<RawTask>> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return { ok: false, items: [], error: "TODOIST_API_TOKEN nao configurado" };
  const h = { Authorization: `Bearer ${token}` };
  const out: RawTask[] = [];
  let cursor: string | null = null;
  do {
    const url = new URL("https://api.todoist.com/api/v1/tasks");
    url.searchParams.set("limit", "200");
    if (cursor) url.searchParams.set("cursor", cursor);
    const r = await fetch(url, { headers: h });
    if (!r.ok) return { ok: false, items: out, error: `Todoist HTTP ${r.status}` };
    const j: any = await r.json();
    for (const t of j.results || []) {
      out.push({
        id: t.id,
        content: t.content,
        due: t.due?.date ? String(t.due.date).slice(0, 10) : null,
        recurring: !!t.due?.is_recurring,
      });
    }
    cursor = j.next_cursor || null;
  } while (cursor);
  return { ok: true, items: out };
}

// Tarefa nova criada pelo Holiday (com aprovacao) — rotulo "holiday".
export async function createTodoistTask(
  content: string,
  dueDate?: string | null
): Promise<{ ok: boolean; id?: string; error?: string }> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return { ok: false, error: "TODOIST_API_TOKEN nao configurado" };
  const body: Record<string, unknown> = { content, labels: ["holiday"] };
  if (dueDate) body.due_date = dueDate;
  const r = await fetch("https://api.todoist.com/api/v1/tasks", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) return { ok: false, error: `Todoist HTTP ${r.status}: ${JSON.stringify(j)}` };
  return { ok: true, id: j.id };
}

// Mudar a data de uma tarefa NAO recorrente (em recorrentes o due_date
// substituia a regra de repeticao — o Holiday nao propoe isso).
export async function rescheduleTodoistTask(taskId: string, dueDate: string): Promise<{ ok: boolean; error?: string }> {
  const token = process.env.TODOIST_API_TOKEN;
  if (!token) return { ok: false, error: "TODOIST_API_TOKEN nao configurado" };
  const r = await fetch(`https://api.todoist.com/api/v1/tasks/${taskId}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ due_date: dueDate }),
  });
  if (!r.ok) return { ok: false, error: `Todoist HTTP ${r.status}: ${JSON.stringify(await r.json().catch(() => ({})))}` };
  return { ok: true };
}

export async function fetchTickTick(): Promise<FetchResult<RawTask>> {
  const token = process.env.TICKTICK_ACCESS_TOKEN;
  if (!token) return { ok: false, items: [], error: "TICKTICK_ACCESS_TOKEN nao configurado" };
  const h = { Authorization: `Bearer ${token}` };
  const out: RawTask[] = [];
  const projR = await fetch("https://api.ticktick.com/open/v1/project", { headers: h });
  if (!projR.ok) return { ok: false, items: [], error: `TickTick HTTP ${projR.status}` };
  const projects: any[] = await projR.json();
  for (const p of projects) {
    const dr = await fetch(`https://api.ticktick.com/open/v1/project/${p.id}/data`, { headers: h });
    if (!dr.ok) return { ok: false, items: out, error: `TickTick projeto ${p.id} HTTP ${dr.status}` };
    const d: any = await dr.json();
    for (const t of d.tasks || []) {
      if (t.status === 2) continue; // ja concluida
      out.push({
        id: `tt-${t.id}`,
        content: t.title,
        // dueDate vem em UTC; converter para a data civil no fuso da tarefa
        // (senao uma tarefa de dia 28 em Lisboa ficava no dia 27).
        due: t.dueDate ? dateInTimeZone(new Date(String(t.dueDate).replace(/([+-]\d{2})(\d{2})$/, "$1:$2")), t.timeZone || "Europe/Lisbon") : null,
        projectId: t.projectId || p.id,
        recurring: !!t.repeatFlag,
      });
    }
  }
  return { ok: true, items: out };
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

// Token do Google Calendar, com a causa exata quando falha (ex: invalid_grant =
// refresh token revogado/expirado — apps OAuth em modo "Testing" expiram em 7 dias).
export async function googleAccessTokenResult(): Promise<{ token: string | null; error?: string }> {
  // Preferido: conta de servico (nunca expira). Alternativa: refresh token OAuth.
  const sa = serviceAccountJson();
  if (sa) return serviceAccountToken(sa);
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  const missing = [!clientId && "GOOGLE_CLIENT_ID", !clientSecret && "GOOGLE_CLIENT_SECRET", !refreshToken && "GOOGLE_REFRESH_TOKEN"].filter(Boolean);
  if (missing.length) return { token: null, error: `falta GOOGLE_SERVICE_ACCOUNT_JSON (ou ${missing.join(", ")})` };
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId!,
      client_secret: clientSecret!,
      refresh_token: refreshToken!,
      grant_type: "refresh_token",
    }),
  });
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    const why = j.error === "invalid_grant" ? "refresh token expirado ou revogado — gera um novo GOOGLE_REFRESH_TOKEN" : j.error_description || j.error || `HTTP ${r.status}`;
    return { token: null, error: `Google OAuth: ${why}` };
  }
  return { token: j.access_token };
}

// Calendario a usar: com a conta de servico, "primary" seria o calendario
// dela (vazio) — por isso GOOGLE_CALENDAR_ID = o teu email do Google.
export function calendarEventsUrl(eventId?: string) {
  const id = encodeURIComponent(process.env.GOOGLE_CALENDAR_ID || "primary");
  return `https://www.googleapis.com/calendar/v3/calendars/${id}/events${eventId ? `/${encodeURIComponent(eventId)}` : ""}`;
}

export async function googleAccessToken(): Promise<string | null> {
  return (await googleAccessTokenResult()).token;
}

export async function googleHealthAccessToken(): Promise<{ token: string | null; error?: string }> {
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
    const raw = await r.text();
    return { token: null, error: `[v${DEPLOY_MARKER}] OAUTH HTTP ${r.status}: ${raw}` };
  }
  const j: any = await r.json();
  return { token: j.access_token || null };
}

export async function fetchFitbitSteps(date: string): Promise<{ steps: number | null; error?: string }> {
  const { token, error } = await googleHealthAccessToken();
  if (!token) return { steps: null, error };
  const [year, month, day] = date.split("-").map(Number);
  // O intervalo tem de ser um dia civil completo e alinhado (00:00 -> 00:00
  // do dia seguinte), nao 00:00 -> 23:59:59 do mesmo dia — isso rebentava
  // com "Bad Request" por nao estar alinhado com windowSizeDays=1.
  const nextDay = new Date(Date.UTC(year, month - 1, day + 1));
  const r = await fetch("https://health.googleapis.com/v4/users/me/dataTypes/steps/dataPoints:dailyRollUp", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      range: {
        start: { date: { year, month, day }, time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 } },
        end: {
          date: { year: nextDay.getUTCFullYear(), month: nextDay.getUTCMonth() + 1, day: nextDay.getUTCDate() },
          time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
        },
      },
      windowSizeDays: 1,
    }),
  });
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    return { steps: null, error: `[v${DEPLOY_MARKER}] HTTP ${r.status}: ${JSON.stringify(j)}` };
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
  return (await fetchCalendarEventsResult(timeMin, timeMax)).items;
}

export async function fetchCalendarEventsResult(timeMin: string, timeMax: string): Promise<FetchResult<RawEvent>> {
  const { token, error } = await googleAccessTokenResult();
  if (!token) return { ok: false, items: [], error: `sem acesso ao Google Calendar: ${error}` };
  const url = new URL(calendarEventsUrl());
  url.searchParams.set("timeMin", timeMin);
  url.searchParams.set("timeMax", timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) return { ok: false, items: [], error: `Calendar HTTP ${r.status}` };
  const j: any = await r.json();
  return {
    ok: true,
    items: (j.items || []).map((e: any) => ({
      id: e.id,
      summary: e.summary || "(sem título)",
      start: e.start?.dateTime || e.start?.date,
      end: e.end?.dateTime || e.end?.date,
    })),
  };
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
  const r = await fetch(calendarEventsUrl(), {
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
  const r = await fetch(calendarEventsUrl(eventId), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok && r.status !== 410) {
    const j = await r.json().catch(() => ({}));
    return { ok: false, error: JSON.stringify(j) };
  }
  return { ok: true };
}
