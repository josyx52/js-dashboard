import { CATALOG, ZONAS } from "./catalog";
import type { BotOutput, Turn } from "./groq";

type Env = { SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string };

async function sb(env: Env, path: string, init: RequestInit = {}) {
  const res = await fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: env.SUPABASE_SERVICE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=representation,resolution=merge-duplicates",
      ...(init.headers ?? {}),
    },
  });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${await res.text()}`);
  return res.json() as Promise<any[]>;
}

export async function isDuplicate(env: Env, messageId: string): Promise<boolean> {
  const rows = await sb(env, `rm_mensagens?external_id=eq.${encodeURIComponent(messageId)}&select=id`);
  return rows.length > 0;
}

export async function upsertCliente(env: Env, telefone: string) {
  const rows = await sb(env, "rm_clientes?on_conflict=telefone", {
    method: "POST",
    body: JSON.stringify({ telefone }),
  });
  return rows[0];
}

export async function saveMessage(
  env: Env, clienteId: string, role: "user" | "assistant", content: string, externalId?: string,
) {
  await sb(env, "rm_mensagens", {
    method: "POST",
    body: JSON.stringify({ cliente_id: clienteId, role, content, external_id: externalId ?? null }),
  });
}

export async function loadHistory(env: Env, clienteId: string, limit = 12): Promise<Turn[]> {
  const rows = await sb(
    env, `rm_mensagens?cliente_id=eq.${clienteId}&select=role,content&order=created_at.desc&limit=${limit}`,
  );
  return rows.reverse();
}

// O total é recalculado AQUI com os preços fixos; nunca se confia no modelo.
export async function saveOrder(env: Env, clienteId: string, order: NonNullable<BotOutput["order"]>) {
  let total = 0;
  const itens = order.itens.flatMap((i) => {
    const p = CATALOG.find((c) => c.id === i.id);
    if (!p || !(i.qtd > 0)) return [];
    total += p.preco_eur * i.qtd;
    return [{ id: p.id, nome: p.nome, qtd: i.qtd, preco_eur: p.preco_eur }];
  });
  if (!itens.length) return null;
  const taxa = ZONAS.find((z) => z.zona === order.zona)?.taxa_eur ?? 0;
  const rows = await sb(env, "rm_pedidos", {
    method: "POST",
    body: JSON.stringify({
      cliente_id: clienteId, nome: order.nome, morada: order.morada, zona: order.zona,
      itens, taxa_entrega_eur: taxa, total_eur: Math.round((total + taxa) * 100) / 100,
    }),
  });
  return rows[0];
}
