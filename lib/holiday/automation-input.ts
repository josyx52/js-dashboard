import { EVENTS, normalizeDays, normalizeTime, type AutomationKind } from "./automations";
import { weekdayOf, zonedTimeToUtc } from "@/lib/dates";

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
  // Uma vez: run_at ("YYYY-MM-DDTHH:MM" em hora de Lisboa) define o dia e a hora.
  if (body.trigger === "uma_vez") {
    const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/.exec(String(body.run_at || ""));
    if (!m) return { ok: false, error: "escolhe o dia e a hora" };
    const at = zonedTimeToUtc(m[1], m[2], "Europe/Lisbon");
    if (at.getTime() < Date.now() - 60000) return { ok: false, error: "essa hora já passou" };
    const [hh, mm] = m[2].split(":").map(Number);
    body = { ...body, days: [weekdayOf(m[1])], time: `${String(hh).padStart(2, "0")}:${String(Math.floor(mm / 15) * 15).padStart(2, "0")}` };
    v.run_at = at.toISOString();
    v.last_run_at = null; // reagendar volta a ativar
    v.active = true;
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
  if (!partial || body.trigger !== undefined) {
    const trigger = body.trigger === "evento" ? "evento" : body.trigger === "uma_vez" ? "uma_vez" : "horario";
    v.trigger = trigger;
    if (trigger === "evento") {
      if (!EVENTS[body.event]) return { ok: false, error: "escolhe o evento" };
      v.event = body.event;
      const cd = Number(body.cooldown_hours);
      v.cooldown_hours = [1, 2, 4, 8, 12, 24, 48, 72, 168].includes(cd) ? cd : 24;
    } else {
      v.event = null;
    }
    if (trigger !== "uma_vez") v.run_at = null;
  }
  if (body.active !== undefined && v.active === undefined) v.active = !!body.active;
  return { ok: true, value: v };
}
