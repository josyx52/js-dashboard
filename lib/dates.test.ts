import { describe, it, expect } from "vitest";
import { dateInTimeZone } from "./dates";

describe("dateInTimeZone", () => {
  it("meia-noite de Lisboa (23:00 UTC no verao) fica no dia certo", () => {
    expect(dateInTimeZone(new Date("2026-07-27T23:00:00Z"), "Europe/Lisbon")).toBe("2026-07-28");
  });
  it("fuso invalido cai para UTC", () => {
    expect(dateInTimeZone(new Date("2026-07-27T23:00:00Z"), "Nao/Existe")).toBe("2026-07-27");
  });
});
