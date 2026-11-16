// TODO(Bird): confirmar com a documentação do canal WhatsApp do Bird.
// Estas duas funções são o ÚNICO sítio que conhece o formato do Bird.

export interface Inbound { from: string; text: string; messageId: string }

export function parseInbound(body: any): Inbound | null {
  // TODO: ajustar ao payload real. Tentativa genérica:
  const msg = body?.payload ?? body;
  const from = msg?.sender?.contact?.identifierValue ?? msg?.from;
  const text = msg?.body?.text?.text ?? msg?.text;
  const messageId = msg?.id ?? body?.id;
  if (!from || !text || !messageId) return null;
  return { from: String(from), text: String(text), messageId: String(messageId) };
}

export async function sendReply(
  env: { BIRD_API_KEY: string },
  to: string,
  text: string,
): Promise<void> {
  // TODO: URL, workspaceId, channelId e corpo reais do Bird.
  const res = await fetch("https://TODO-bird-endpoint/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.BIRD_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ to, text }),
  });
  if (!res.ok) throw new Error(`Bird send ${res.status}`);
}

// TODO: usar o método de assinatura real do Bird. Por agora, segredo partilhado no header.
export function verifyWebhook(req: Request, env: { BIRD_WEBHOOK_SECRET: string }): boolean {
  const got = req.headers.get("x-webhook-secret") ?? "";
  const want = env.BIRD_WEBHOOK_SECRET;
  if (!want || got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= got.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}
