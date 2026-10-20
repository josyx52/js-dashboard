import { describe, it, expect } from "vitest";
import { dueNow, eventsDue, normalizeDays, normalizeTime, occurrences, type Automation } from "./automations";

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

describe("eventsDue (automacoes por evento)", () => {
  const ev = auto({ id: "e1", trigger: "evento", event: "meals:none", time: "14:00", days: [0, 1, 2, 3, 4, 5, 6], cooldown_hours: 24 });
  const sig = [{ id: "meals:none", area: "saude" as const, severity: "media" as const, title: "Nenhuma refeição registada hoje" }];
  const at = new Date("2026-10-19T14:30:00Z"); // 15:30 Lisboa

  it("dispara quando o sinal existe, dentro da janela", () => {
    expect(eventsDue([ev], sig, at).map((x) => x.automation.id)).toEqual(["e1"]);
  });
  it("nao dispara sem o sinal, antes da hora, ou dentro do cooldown", () => {
    expect(eventsDue([ev], [], at)).toHaveLength(0);
    expect(eventsDue([ev], sig, new Date("2026-10-19T11:00:00Z"))).toHaveLength(0);
    expect(eventsDue([{ ...ev, last_run_at: "2026-10-19T13:30:00Z" }], sig, at)).toHaveLength(0);
  });
  it("eventos nao aparecem como ocorrencias de horario", () => {
    expect(occurrences([ev], "2026-10-19", "2026-10-25")).toHaveLength(0);
  });
  it("overdue_old so com atrasadas graves", () => {
    const old = { ...ev, event: "overdue_old" };
    expect(eventsDue([old], [{ id: "overdue:estudo", area: "estudo" as const, severity: "media" as const, title: "x" }], at)).toHaveLength(0);
    expect(eventsDue([old], [{ id: "overdue:estudo", area: "estudo" as const, severity: "alta" as const, title: "x" }], at)).toHaveLength(1);
  });
});

describe("uma vez (como o \"once\" do Lachesis)", () => {
  const once = auto({ trigger: "uma_vez", run_at: "2026-10-23T08:00:00.000Z", days: [5], time: "09:00" }); // sexta 09:00 Lisboa

  it("so aparece no proprio dia, nao todas as semanas", () => {
    const occ = occurrences([once], "2026-10-19", "2026-11-01");
    expect(occ.map((o) => o.date)).toEqual(["2026-10-23"]);
    expect(occ[0].at).toBe("2026-10-23T08:00:00.000Z");
  });

  it("corre a hora e depois de correr nao volta a aparecer", () => {
    expect(dueNow([once], new Date("2026-10-23T08:05:00Z")).run).toHaveLength(1);
    expect(dueNow([once], new Date("2026-10-23T07:55:00Z")).run).toHaveLength(0);
    expect(occurrences([{ ...once, last_run_at: "2026-10-23T08:05:00Z" }], "2026-10-23", "2026-10-30")).toHaveLength(0);
  });
});
