import type { SupabaseClient } from "@supabase/supabase-js";
import { calendarEventsUrl, googleAccessTokenResult, googleHealthAccessToken } from "@/lib/integrations";

// Servicos ligados ao sistema: estado real (teste ao vivo) e o que o Holiday
// faz com cada um. Os tokens vivem nos secrets do Worker; o do Notion no
// Supabase Vault (pagina Integracoes).

export interface ServiceStatus {
  key: string;
  name: string;
  purpose: string; // para que serve no sistema
  configured: boolean;
  ok: boolean;
  detail: string;
  ms: number | null;
  setup: string; // onde se configura
}

async function timed<T>(fn: () => Promise<T>): Promise<{ v: T; ms: number }> {
  const t = Date.now();
  const v = await fn();
  return { v, ms: Date.now() - t };
}

async function check(
  base: Omit<ServiceStatus, "configured" | "ok" | "detail" | "ms">,
  configured: boolean,
  run: () => Promise<string>
): Promise<ServiceStatus> {
  if (!configured) return { ...base, configured: false, ok: false, detail: "não configurado", ms: null };
  try {
    const { v, ms } = await timed(run);
    return { ...base, configured: true, ok: true, detail: v, ms };
  } catch (e: any) {
    return { ...base, configured: true, ok: false, detail: String(e?.message || e).slice(0, 160), ms: null };
  }
}

async function getJson(url: string, init?: RequestInit) {
  const r = await fetch(url, init);
  const j: any = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(`HTTP ${r.status}${j?.message ? ` — ${j.message}` : j?.error?.message ? ` — ${j.error.message}` : ""}`);
  return j;
}

// ── Notion ──

const NOTION_VERSION = "2022-06-28";

export async function notionToken(sb: SupabaseClient): Promise<{ token: string | null; integrationId: string | null; config: any }> {
  const { data } = await sb.from("integrations").select("id, name, api_key_vault_id, connected, config");
  const it = (data || []).find((i: any) => i.name.trim().toLowerCase() === "notion");
  if (!it?.api_key_vault_id) return { token: null, integrationId: it?.id ?? null, config: it?.config ?? {} };
  const { data: secret } = await sb.rpc("read_integration_secret", { vault_id: it.api_key_vault_id });
  return { token: (secret as string) || null, integrationId: it.id, config: it.config || {} };
}

function notionHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, "Notion-Version": NOTION_VERSION, "Content-Type": "application/json" };
}

function notionTitle(obj: any): string {
  if (obj.object === "database") return (obj.title || []).map((t: any) => t.plain_text).join("") || "(sem título)";
  const props = obj.properties || {};
  for (const k of Object.keys(props)) {
    if (props[k]?.type === "title") return (props[k].title || []).map((t: any) => t.plain_text).join("") || "(sem título)";
  }
  return "(sem título)";
}

export async function notionSearch(token: string, query: string, limit = 8) {
  const j = await getJson("https://api.notion.com/v1/search", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({ query, page_size: limit, sort: { direction: "descending", timestamp: "last_edited_time" } }),
  });
  return (j.results || []).map((r: any) => ({
    id: r.id as string,
    type: r.object as "page" | "database",
    title: notionTitle(r),
    url: r.url as string,
    edited: r.last_edited_time as string,
  }));
}

// Texto simples -> blocos (paragrafos; linhas "- " viram listas; "# " titulos).
function toBlocks(content: string) {
  const rich = (t: string) => [{ type: "text", text: { content: t.slice(0, 1900) } }];
  return content
    .split("\n")
    .filter((l) => l.trim())
    .slice(0, 90)
    .map((l) => {
      if (/^#{1,3} /.test(l)) return { object: "block", type: "heading_3", heading_3: { rich_text: rich(l.replace(/^#+ /, "")) } };
      if (/^[-*] /.test(l)) return { object: "block", type: "bulleted_list_item", bulleted_list_item: { rich_text: rich(l.slice(2)) } };
      return { object: "block", type: "paragraph", paragraph: { rich_text: rich(l) } };
    });
}

export async function notionCreatePage(token: string, parentId: string, title: string, content: string) {
  const j = await getJson("https://api.notion.com/v1/pages", {
    method: "POST",
    headers: notionHeaders(token),
    body: JSON.stringify({
      parent: { page_id: parentId },
      properties: { title: { title: [{ type: "text", text: { content: title.slice(0, 200) } }] } },
      children: toBlocks(content),
    }),
  });
  return { id: j.id as string, url: j.url as string };
}

// Aceita um link do Notion ou um id e devolve o id (32 hex).
export function notionIdFrom(input: string): string | null {
  const m = /([0-9a-f]{32})(?:\?|$)/i.exec(input.replace(/-/g, "")) || /([0-9a-f]{32})/i.exec(input.replace(/-/g, ""));
  return m ? m[1].toLowerCase() : null;
}

// ── Estado de todos os servicos ──

export async function servicesStatus(sb: SupabaseClient): Promise<ServiceStatus[]> {
  const env = process.env;
  const notion = await notionToken(sb).catch(() => ({ token: null, integrationId: null, config: {} as any }));

  return Promise.all([
    check(
      { key: "todoist", name: "Todoist", purpose: "Tarefas: sync, concluir, criar e reagendar", setup: "secret TODOIST_API_TOKEN" },
      !!env.TODOIST_API_TOKEN,
      async () => {
        const j = await getJson("https://api.todoist.com/api/v1/projects?limit=200", {
          headers: { Authorization: `Bearer ${env.TODOIST_API_TOKEN}` },
        });
        return `${(j.results || []).length} projetos acessíveis`;
      }
    ),
    check(
      { key: "ticktick", name: "TickTick", purpose: "Tarefas e rotina: sync e concluir", setup: "secret TICKTICK_ACCESS_TOKEN" },
      !!env.TICKTICK_ACCESS_TOKEN,
      async () => {
        const j = await getJson("https://api.ticktick.com/open/v1/project", {
          headers: { Authorization: `Bearer ${env.TICKTICK_ACCESS_TOKEN}` },
        });
        return `${(j || []).length} listas acessíveis`;
      }
    ),
    check(
      { key: "calendar", name: "Google Calendar", purpose: "Agenda: ver eventos e agendar (com aprovação)", setup: "secrets GOOGLE_SERVICE_ACCOUNT_JSON + GOOGLE_CALENDAR_ID (ou GOOGLE_CLIENT_ID/SECRET + GOOGLE_REFRESH_TOKEN)" },
      !!(env.GOOGLE_SERVICE_ACCOUNT_JSON || (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REFRESH_TOKEN)),
      async () => {
        const { token, error } = await googleAccessTokenResult();
        if (!token) throw new Error(error || "o Google recusou o acesso");
        if (env.GOOGLE_SERVICE_ACCOUNT_JSON && !env.GOOGLE_CALENDAR_ID) throw new Error("falta o secret GOOGLE_CALENDAR_ID (o teu email do Google)");
        const url = new URL(calendarEventsUrl());
        url.searchParams.set("maxResults", "1");
        const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        const j: any = await r.json().catch(() => ({}));
        if (r.status === 404) throw new Error("calendário não encontrado — partilha-o com o email da conta de serviço");
        if (!r.ok) throw new Error(j?.error?.message || `HTTP ${r.status}`);
        return `${j.summary || "calendário"} · ${env.GOOGLE_SERVICE_ACCOUNT_JSON ? "conta de serviço" : "OAuth"}`;
      }
    ),
    check(
      { key: "health", name: "Google Health", purpose: "Passos do dia (Nutrição e Holiday)", setup: "secret GOOGLE_HEALTH_REFRESH_TOKEN" },
      !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_HEALTH_REFRESH_TOKEN),
      async () => {
        const { token, error } = await googleHealthAccessToken();
        if (!token) throw new Error(error || "token recusado");
        return "autorizado";
      }
    ),
    check(
      { key: "groq", name: "Groq", purpose: "Cérebro do Holiday, classificação por pilares e Whisper (reserva de voz)", setup: "secret GROQ_API_KEY" },
      !!env.GROQ_API_KEY,
      async () => {
        const j = await getJson("https://api.groq.com/openai/v1/models", { headers: { Authorization: `Bearer ${env.GROQ_API_KEY}` } });
        const has = (j.data || []).some((m: any) => m.id === "openai/gpt-oss-120b");
        return has ? "gpt-oss-120b disponível" : "chave válida (modelo do Holiday não listado)";
      }
    ),
    check(
      { key: "gemini", name: "Gemini", purpose: "Análise de fotos de refeições", setup: "secret GEMINI_API_KEY" },
      !!env.GEMINI_API_KEY,
      async () => {
        const j = await getJson(`https://generativelanguage.googleapis.com/v1beta/models?pageSize=100&key=${env.GEMINI_API_KEY}`);
        return `${(j.models || []).length} modelos acessíveis`;
      }
    ),
    check(
      { key: "elevenlabs", name: "ElevenLabs", purpose: "Voz do Holiday (falar e ouvir)", setup: "secret ELEVENLABS_API_KEY" },
      !!env.ELEVENLABS_API_KEY,
      async () => {
        const j = await getJson("https://api.elevenlabs.io/v1/user/subscription", { headers: { "xi-api-key": env.ELEVENLABS_API_KEY! } });
        const used = Number(j.character_count) || 0;
        const limit = Number(j.character_limit) || 0;
        return limit ? `${(limit - used).toLocaleString("pt-PT")} de ${limit.toLocaleString("pt-PT")} créditos livres (${j.tier})` : "chave válida";
      }
    ),
    check(
      { key: "notion", name: "Notion", purpose: "O Holiday pesquisa páginas e cria páginas (com aprovação)", setup: "integração “Notion” abaixo, com a chave" },
      !!notion.token,
      async () => {
        const me = await getJson("https://api.notion.com/v1/users/me", { headers: notionHeaders(notion.token!) });
        const dest = notion.config?.parent_title ? ` · destino: ${notion.config.parent_title}` : " · sem página de destino";
        return `ligado como ${me.name || me.bot?.owner?.user?.name || "bot"}${dest}`;
      }
    ),
  ]);
}
