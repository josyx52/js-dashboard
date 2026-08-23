import { describe, it, expect } from "vitest";
import { calcBMR } from "./bmr";

describe("calcBMR (Mifflin-St Jeor)", () => {
  it("calcula corretamente para um homem — valor de referência conhecido", () => {
    // Homem, 80kg, 180cm, 30 anos: 10*80 + 6.25*180 - 5*30 + 5 = 800+1125-150+5 = 1780
    expect(calcBMR(80, 180, 30, "m")).toBe(1780);
  });

  it("calcula corretamente para uma mulher — valor de referência conhecido", () => {
    // Mulher, 60kg, 165cm, 25 anos: 10*60 + 6.25*165 - 5*25 - 161 = 600+1031.25-125-161 = 1345.25 -> 1345
    expect(calcBMR(60, 165, 25, "f")).toBe(1345);
  });

  it("a diferenca entre homem e mulher com os mesmos dados e sempre 166", () => {
    const m = calcBMR(70, 170, 28, "m");
    const f = calcBMR(70, 170, 28, "f");
    expect(m - f).toBe(166); // +5 vs -161
  });

  it("aumenta com o peso, mantendo tudo o resto igual", () => {
    const lower = calcBMR(60, 170, 30, "m");
    const higher = calcBMR(90, 170, 30, "m");
    expect(higher).toBeGreaterThan(lower);
  });

  it("diminui com a idade, mantendo tudo o resto igual", () => {
    const younger = calcBMR(70, 170, 20, "m");
    const older = calcBMR(70, 170, 60, "m");
    expect(older).toBeLessThan(younger);
  });
});
