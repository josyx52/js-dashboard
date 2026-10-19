import { describe, it, expect } from "vitest";
import { compactSnapshot, SYSTEM } from "./reasoning";
import type { Snapshot, SnapTask } from "./snapshot";

// O plano gratuito da Groq aceita ~8000 tokens/minuto. Com ~45 tarefas reais
// o pedido tem de ficar bem abaixo disso (estimativa: 1 token ≈ 3.5 caracteres).
describe("tamanho do contexto", () => {
  it("snapshot com 45 tarefas + prompt cabe no orcamento", () => {
    const tasks: SnapTask[] = Array.from({ length: 45 }, (_, i) => ({
      id: `6h8VXq${i}abcdef`,
      source: "todoist",
      title: `📚 PyHack Academy — sessão de estudo número ${i} com descrição longa`,
      due: i < 7 ? "2026-07-28" : i < 30 ? "2026-08-01" : null,
      pillar: "estudo",
      recurring: i < 7,
      bucket: i < 7 ? "today" : i < 30 ? "overdue" : "undated",
      owner: null,
      list: null,
      note: null,
    }));
    const snap: Snapshot = {
      now: "2026-10-19T10:00:00Z", today: "2026-10-19", hour: 11, tasks,
      meals: [], body: { weight_kg: 79, body_fat_pct: null, date: "2026-09-02" },
      profile: { height_cm: 165, age: 21, sex: "m", goal: "perder" }, steps: null, lastSyncAt: null,
    };
    const chars = JSON.stringify(compactSnapshot(snap)).length + SYSTEM.length;
    const tokens = Math.round(chars / 3.5);
    console.log(`estimativa: ${tokens} tokens (snapshot + prompt)`);
    expect(tokens).toBeLessThan(3500);
  });
});
