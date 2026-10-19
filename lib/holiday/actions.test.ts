import { describe, it, expect } from "vitest";
import { validateProposal } from "./actions";
import type { Snapshot } from "./snapshot";

const snap: Snapshot = {
  now: "2026-10-19T10:00:00Z",
  today: "2026-10-19",
  hour: 11,
  tasks: [
    { id: "t1", source: "todoist", title: "Bíblia", due: "2026-07-28", pillar: "deus", recurring: true, bucket: "today", owner: null, list: null, note: null },
    { id: "t2", source: "todoist", title: "Criar logo", due: "2026-08-01", pillar: "negocio", recurring: false, bucket: "overdue", owner: null, list: null, note: null },
    { id: "tt-3", source: "ticktick", title: "Acordar", due: "2026-07-28", pillar: "saude", recurring: true, bucket: "today", owner: null, list: null, note: null },
  ],
  meals: [],
  body: null,
  profile: null,
  steps: null,
  lastSyncAt: null,
};

describe("validateProposal", () => {
  it("rejeita ids inventados pela IA", () => {
    expect(validateProposal({ type: "complete_task", params: { task_id: "nao-existe" } }, snap).ok).toBe(false);
  });
  it("rejeita tipos fora do catalogo", () => {
    expect(validateProposal({ type: "delete_everything", params: {} }, snap).ok).toBe(false);
  });
  it("nao deixa reagendar recorrentes nem TickTick", () => {
    expect(validateProposal({ type: "reschedule_task", params: { task_id: "t1", due_date: "2026-10-20" } }, snap).ok).toBe(false);
    expect(validateProposal({ type: "reschedule_task", params: { task_id: "tt-3", due_date: "2026-10-20" } }, snap).ok).toBe(false);
    expect(validateProposal({ type: "reschedule_task", params: { task_id: "t2", due_date: "2026-10-20" } }, snap).ok).toBe(true);
  });
  it("normaliza refeicao e gera resumo", () => {
    const v = validateProposal({ type: "register_meal", params: { label: " Omelete ", kcal: "280.4" } }, snap);
    expect(v.ok && v.params).toEqual({ label: "Omelete", kcal: 280, type: "in" });
  });
  it("evento com fim antes do inicio e invalido", () => {
    const v = validateProposal(
      { type: "schedule_event", params: { summary: "x", start: "2026-10-20T10:00:00Z", end: "2026-10-20T09:00:00Z" } },
      snap
    );
    expect(v.ok).toBe(false);
  });
});
