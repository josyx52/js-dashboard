const PILLAR_KEYS = ["deus", "saude", "familia", "estudo", "negocio", "trabalho"] as const;

export async function classifyPillars(
  tasks: { id: string; content: string }[]
): Promise<Record<string, string>> {
  if (tasks.length === 0) return {};
  const key = process.env.GROQ_API_KEY;
  if (!key) return {};

  const prompt = `Classifica cada tarefa abaixo num destes pilares: ${PILLAR_KEYS.join(", ")}.
Responde APENAS com JSON valido, um array de objetos {"id": "...", "pillar": "..."}.
Tarefas:
${tasks.map((t) => `- id=${t.id}: ${t.content}`).join("\n")}`;

  try {
    const r = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });
    const j = await r.json();
    let txt = j.choices?.[0]?.message?.content?.trim() || "[]";
    txt = txt.replace(/^```json/, "").replace(/^```/, "").replace(/```$/, "").trim();
    const arr = JSON.parse(txt) as { id: string; pillar: string }[];
    const out: Record<string, string> = {};
    for (const item of arr) {
      if (PILLAR_KEYS.includes(item.pillar as any)) out[item.id] = item.pillar;
    }
    return out;
  } catch {
    return {};
  }
}
