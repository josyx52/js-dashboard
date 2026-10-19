import { describe, it, expect } from "vitest";
import { detectSignals, groupProblems } from "./engines";
import type { Snapshot, SnapTask } from "./snapshot";

const base: Snapshot = {
  now: "2026-10-19T15:00:00Z",
  today: "2026-10-19",
  hour: 16,
  tasks: [],
  meals: [],
  body: { weight_kg: 79, body_fat_pct: null, date: "2026-10-18" },
  profile: { height_cm: 165, age: 21, sex: "m", goal: "perder" },
  steps: null,
  lastSyncAt: "2026-10-19T14:30:00Z",
};
const task = (p: Partial<SnapTask>): SnapTask => ({
  id: "x",
  source: "todoist",
  title: "t",
  due: null,
  pillar: "saude",
  recurring: false,
  bucket: "undated",
  ...p,
});

describe("detectSignals", () => {
  it("sem refeicoes depois das 14h gera alerta de Saude", () => {
    const ids = detectSignals(base).map((s) => s.id);
    expect(ids).toContain("meals:none");
  });

  it("atrasada ha mais de 14 dias e severidade alta", () => {
    const s = detectSignals({
      ...base,
      tasks: [task({ id: "a", due: "2026-08-01", bucket: "overdue", pillar: "negocio" })],
    }).find((x) => x.id === "overdue:negocio");
    expect(s?.severity).toBe("alta");
    expect(s?.taskIds).toEqual(["a"]);
  });

  it("deteta duplicados na mesma fonte", () => {
    const sigs = detectSignals({
      ...base,
      tasks: [task({ id: "a", title: "Comprar chip" }), task({ id: "b", title: "comprar chip " })],
    });
    expect(sigs.some((s) => s.id.startsWith("dup:"))).toBe(true);
  });

  it("sync parado ha mais de 24h e alta", () => {
    const s = detectSignals({ ...base, lastSyncAt: "2026-08-13T12:00:00Z" }).find((x) => x.id === "sync:stale");
    expect(s?.severity).toBe("alta");
  });

  it("peso registado ha mais de 7 dias", () => {
    const ids = detectSignals({ ...base, body: { weight_kg: 79, body_fat_pct: null, date: "2026-09-02" } }).map((s) => s.id);
    expect(ids).toContain("weight:stale");
  });
});

describe("groupProblems", () => {
  it("agrupa por area e ordena pela severidade mais alta", () => {
    const problems = groupProblems([
      { id: "1", area: "saude", severity: "baixa", title: "a" },
      { id: "2", area: "sistema", severity: "alta", title: "b" },
      { id: "3", area: "saude", severity: "media", title: "c" },
    ]);
    expect(problems.map((p) => p.area)).toEqual(["sistema", "saude"]);
    expect(problems[1].severity).toBe("media");
  });
});
