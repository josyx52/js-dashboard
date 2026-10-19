import { describe, it, expect } from "vitest";
import { dueNow, normalizeDays, normalizeTime, occurrences, type Automation } from "./automations";

const auto = (p: Partial<Automation>): Automation => ({
  id: "a1",
  name: "Registar refeições",
  kind: "lembrete",
  prompt: "Regista o almoço",
  days: [1, 2, 3, 4, 5],
  time: "13:30",
  active: true,
  created_by: "eu",
  last_run_at: null,
  ...p,
});

describe("normalizeTime / normalizeDays", () => {
  it("arredonda para passos de 15 min", () => {
    expect(normalizeTime("9:07")).toBe("09:00");
    expect(normalizeTime("21:53")).toBe("22:00");
    expect(normalizeTime("25:00")).toBeNull();
  });
  it("dias validos, sem repetidos", () => {
    expect(normalizeDays([5, 1, 1, 9])).toEqual([1, 5]);
    expect(normalizeDays([])).toBeNull();
  });
});

describe("occurrences", () => {
  it("so nos dias marcados, ordenadas", () => {
    // 2026-10-19 e segunda; semana ate domingo 25
    const occ = occurrences([auto({ days: [1, 3] })], "2026-10-19", "2026-10-25");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-19", "2026-10-21"]);
    expect(occ[0].at).toBe("2026-10-19T12:30:00.000Z"); // 13:30 em Lisboa (UTC+1)
  });
});

describe("dueNow", () => {
  const now = new Date("2026-10-19T12:40:00Z"); // 13:40 Lisboa
  it("corre quando passou a hora e ainda nao correu hoje", () => {
    expect(dueNow([auto({})], now).run).toHaveLength(1);
  });
  it("nao corre duas vezes", () => {
    expect(dueNow([auto({ last_run_at: "2026-10-19T12:31:00Z" })], now).run).toHaveLength(0);
  });
  it("ainda nao chegou a hora / inativa", () => {
    expect(dueNow([auto({ time: "18:00" })], now).run).toHaveLength(0);
    expect(dueNow([auto({ active: false })], now).run).toHaveLength(0);
  });
  it("mais de 2h de atraso fica perdida", () => {
    const r = dueNow([auto({ time: "09:00" })], now);
    expect(r.run).toHaveLength(0);
    expect(r.missed).toHaveLength(1);
  });
});
