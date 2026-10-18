// Cliente das rotas /api/* — substitui o acesso direto ao Supabase com a
// anon key (que deixava os dados abertos a qualquer pessoa). Todas as
// leituras e escritas passam pelo servidor, protegido pela sessao.
export async function api<T = any>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(path, {
    method: init?.method || (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = "/login?next=" + encodeURIComponent(window.location.pathname);
    throw new Error("sessao expirada");
  }
  const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
  if (!res.ok || data?.error) throw new Error(data?.error || `HTTP ${res.status}`);
  return data as T;
}
