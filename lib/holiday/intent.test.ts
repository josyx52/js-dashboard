import { describe, it, expect } from "vitest";
import { explicitlyAsked } from "./intent";

describe("pedido explicito", () => {
  it("lembretes e agenda pedidos por ele correm logo", () => {
    expect(explicitlyAsked("schedule_event", "Lembra-me na sexta de marcar a consulta")).toBe(true);
    expect(explicitlyAsked("schedule_event", "põe na agenda reunião amanhã às 10")).toBe(true);
    expect(explicitlyAsked("schedule_event", "avisa-me às 18h para ir ao ginásio")).toBe(true);
  });
  it("sem pedido nao corre sozinho", () => {
    expect(explicitlyAsked("schedule_event", "bom dia, tudo bem?")).toBe(false);
    expect(explicitlyAsked("complete_task", "lembra-me disto")).toBe(false);
  });
});
