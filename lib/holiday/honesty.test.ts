import { describe, it, expect } from "vitest";
import { claimsDone, honestReply } from "./honesty";

describe("honestidade", () => {
  it("deteta quando diz que ja fez", () => {
    expect(claimsDone("Pronto, marquei como concluídas as tarefas de negócio.")).toBe(true);
    expect(claimsDone("Feito, já está.")).toBe(true);
    expect(claimsDone("Queres que marque como concluída?")).toBe(false);
    expect(claimsDone("Bom dia! Tudo bem contigo?")).toBe(false);
  });
  it("frase verdadeira com o que esta a espera de aprovacao", () => {
    expect(honestReply(["Concluir: Criar logo simples"], true)).toBe("Preparei isto para aprovares: Criar logo simples. Queres que avance?");
    expect(honestReply(["Concluir: A", "Concluir: B"], false)).toContain("precisam da tua aprovação");
  });
});
