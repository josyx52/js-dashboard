import { describe, it, expect } from "vitest";
import { addressedToHoliday, mentionsHoliday } from "./wake";

describe("palavra de ativacao", () => {
  it("reconhece o nome mesmo mal transcrito", () => {
    for (const t of ["Holiday, tudo bem?", "olá holidei", "Oliday o que tenho hoje", "hollyday consegues ouvir-me", "HOLIDAY"]) expect(mentionsHoliday(t)).toBe(true);
  });
  it("ignora a TV quando nao e chamado", () => {
    expect(mentionsHoliday("e depois ela disse que não vinha jantar")).toBe(false);
    expect(addressedToHoliday("e depois ela disse que não vinha", 60_000)).toBe(false);
  });
  it("seguimento da conversa sem repetir o nome", () => {
    expect(addressedToHoliday("e amanhã?", 8_000)).toBe(true);
  });
});
