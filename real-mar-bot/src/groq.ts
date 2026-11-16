import { systemPrompt } from "./catalog";

export interface BotOutput {
  reply: string;
  handoff: boolean;
  order: null | {
    nome: string;
    morada: string;
    zona: string;
    itens: { id: string; qtd: number }[];
  };
}

export interface Turn { role: "user" | "assistant"; content: string }

export async function askGroq(
  env: { GROQ_API_KEY: string; GROQ_MODEL: string },
  history: Turn[],
): Promise<BotOutput> {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.GROQ_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: env.GROQ_MODEL,
      temperature: 0.2,
      response_format: { type: "json_object" },
      messages: [{ role: "system", content: systemPrompt() }, ...history],
    }),
  });
  if (!res.ok) throw new Error(`Groq ${res.status}`);
  const data = (await res.json()) as any;
  try {
    const out = JSON.parse(data.choices[0].message.content);
    return {
      reply: String(out.reply ?? ""),
      handoff: Boolean(out.handoff),
      order: out.order ?? null,
    };
  } catch {
    // Resposta inválida do modelo: nunca enviar lixo ao cliente.
    return { reply: "Já lhe respondemos, um momento por favor.", handoff: true, order: null };
  }
}
