import { parseInbound, sendReply, verifyWebhook } from "./bird";
import { askGroq } from "./groq";
import { isDuplicate, loadHistory, saveMessage, saveOrder, upsertCliente } from "./db";

interface Env {
  GROQ_API_KEY: string; GROQ_MODEL: string;
  SUPABASE_URL: string; SUPABASE_SERVICE_KEY: string;
  BIRD_API_KEY: string; BIRD_WEBHOOK_SECRET: string;
  HUMAN_NOTIFY_NUMBER: string;
}

async function handle(env: Env, body: unknown) {
  const msg = parseInbound(body);
  if (!msg) return;
  if (await isDuplicate(env, msg.messageId)) return; // Bird pode reenviar

  const cliente = await upsertCliente(env, msg.from);
  await saveMessage(env, cliente.id, "user", msg.text, msg.messageId);

  const history = await loadHistory(env, cliente.id);
  let out;
  try {
    out = await askGroq(env, history);
  } catch {
    out = { reply: "Um colega responde-lhe em breve.", handoff: true, order: null };
  }

  let reply = out.reply;
  if (out.order) {
    const pedido = await saveOrder(env, cliente.id, out.order);
    if (pedido) reply += `\n\nPedido registado. Total: ${pedido.total_eur.toFixed(2)} €`;
    else out.handoff = true;
  }

  await saveMessage(env, cliente.id, "assistant", reply);
  await sendReply(env, msg.from, reply);

  if (out.handoff && env.HUMAN_NOTIFY_NUMBER) {
    await sendReply(env, env.HUMAN_NOTIFY_NUMBER, `Passar a humano: ${msg.from}\n"${msg.text}"`);
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url);
    if (req.method !== "POST" || url.pathname !== "/webhook") return new Response("ok");
    if (!verifyWebhook(req, env)) return new Response("unauthorized", { status: 401 });
    const body = await req.json().catch(() => null);
    // Responder já ao Bird e processar em segundo plano.
    ctx.waitUntil(handle(env, body).catch((e) => console.error("handle", e)));
    return new Response("ok");
  },
};
