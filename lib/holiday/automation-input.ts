import { normalizeDays, normalizeTime, type AutomationKind } from "./automations";

// Valida o que vem do formulario de automacoes (criar/editar).
export function parseAutomationInput(
  body: any,
  partial = false
): { ok: true; value: Record<string, any> } | { ok: false; error: string } {
  const v: Record<string, any> = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || "").trim().slice(0, 80);
    if (!name) return { ok: false, error: "nome obrigatorio" };
    v.name = name;
  }
  if (!partial || body.kind !== undefined) {
    if (!["lembrete", "analise", "trabalho"].includes(body.kind)) return { ok: false, error: "tipo invalido" };
    v.kind = body.kind as AutomationKind;
  }
  if (!partial || body.prompt !== undefined) {
    const prompt = String(body.prompt || "").trim().slice(0, 1000);
    if (!prompt) return { ok: false, error: "descreve o que o Holiday deve fazer" };
    v.prompt = prompt;
  }
  if (!partial || body.days !== undefined) {
    const days = normalizeDays(body.days);
    if (!days) return { ok: false, error: "escolhe pelo menos um dia" };
    v.days = days;
  }
  if (!partial || body.time !== undefined) {
    const time = normalizeTime(String(body.time || ""));
    if (!time) return { ok: false, error: "hora invalida" };
    v.time = time;
  }
  if (body.active !== undefined) v.active = !!body.active;
  return { ok: true, value: v };
}
