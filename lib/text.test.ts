import { describe, it, expect } from "vitest";
import { plainTitle } from "./text";

describe("plainTitle", () => {
  it("troca links markdown pelo texto do link", () => {
    expect(plainTitle("Organizar com projetos ([Assista](https://youtu.be/6qbRubRorcs?si=x))")).toBe(
      "Organizar com projetos (Assista)"
    );
  });
  it("varios links seguidos", () => {
    expect(plainTitle("Descobrir os layouts ([Lista](https://a) | [Painel](https://b))")).toBe(
      "Descobrir os layouts (Lista | Painel)"
    );
  });
  it("remove negrito e codigo, mantem texto simples", () => {
    expect(plainTitle("**Comprar** `chip`")).toBe("Comprar chip");
    expect(plainTitle("Horario da dormir")).toBe("Horario da dormir");
  });
});
