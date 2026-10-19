import { describe, it, expect } from "vitest";
import { correlate, pearson, type DailyRow } from "./correlate";

const day = (date: string, p: Partial<DailyRow> = {}): DailyRow => ({
  date,
  kcal_in: null,
  kcal_out: null,
  meals: 0,
  deficit_pct: null,
  steps: null,
  weight_kg: null,
  today_pending: 0,
  overdue: 0,
  done_count: 0,
  signals: [],
  ...p,
});

function range(n: number, start = "2026-09-01") {
  const d0 = new Date(start + "T12:00:00Z").getTime();
  return Array.from({ length: n }, (_, i) => new Date(d0 + i * 86400000).toISOString().slice(0, 10));
}

describe("pearson", () => {
  it("correlacao perfeita positiva e negativa", () => {
    expect(pearson([1, 2, 3, 4], [2, 4, 6, 8])).toBeCloseTo(1);
    expect(pearson([1, 2, 3, 4], [8, 6, 4, 2])).toBeCloseTo(-1);
  });
  it("sem variacao devolve null", () => {
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull();
  });
});

describe("correlate", () => {
  it("conta ha quantos dias seguidos um problema persiste", () => {
    const rows = range(5).map((d, i) => day(d, { signals: i >= 2 ? ["meals:none"] : [] }));
    const c = correlate(rows, ["meals:none", "sync:stale"], "2026-09-06");
    expect(c.persistence["meals:none"]).toBe(4); // 3 dias anteriores + hoje
    expect(c.persistence["sync:stale"]).toBe(1);
  });

  it("deteta o dia da semana em que o registo falha", () => {
    // 21 dias: regista sempre, exceto aos domingos
    const rows = range(21).map((d) => {
      const sunday = new Date(d + "T12:00:00Z").getUTCDay() === 0;
      return day(d, { meals: sunday ? 0 : 3, kcal_in: sunday ? 0 : 1800 });
    });
    const c = correlate(rows, [], "2026-09-30");
    expect(c.insights.some((i) => i.includes("domingo"))).toBe(true);
    expect(c.baseline.kcal_media).toBe(1800);
  });

  it("tendencia de peso por semana", () => {
    const rows = [day("2026-09-01", { weight_kg: 80 }), day("2026-09-15", { weight_kg: 79 })];
    const c = correlate(rows, [], "2026-09-20");
    expect(c.insights.some((i) => i.includes("-0.50 kg/semana"))).toBe(true);
  });

  it("ignora a linha de hoje no historico", () => {
    const c = correlate([day("2026-09-20", { meals: 5, kcal_in: 9999 })], [], "2026-09-20");
    expect(c.days).toBe(0);
  });
});
