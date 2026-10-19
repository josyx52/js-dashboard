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

import { zonedTimeToUtc, weekdayOf, addDays } from "./dates";

describe("zonedTimeToUtc", () => {
  it("verao em Lisboa (UTC+1)", () => {
    expect(zonedTimeToUtc("2026-10-19", "07:00", "Europe/Lisbon").toISOString()).toBe("2026-10-19T06:00:00.000Z");
  });
  it("inverno em Lisboa (UTC+0), depois de 25/10", () => {
    expect(zonedTimeToUtc("2026-10-26", "07:00", "Europe/Lisbon").toISOString()).toBe("2026-10-26T07:00:00.000Z");
  });
});

describe("weekdayOf / addDays", () => {
  it("segunda-feira e soma de dias", () => {
    expect(weekdayOf("2026-10-19")).toBe(1);
    expect(addDays("2026-10-19", 7)).toBe("2026-10-26");
  });
});
