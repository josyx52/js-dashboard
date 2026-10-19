import { describe, it, expect } from "vitest";
import { parseSteps } from "./steps";

describe("parseSteps", () => {
  it("aceita os formatos que os Atalhos enviam", () => {
    expect(parseSteps(6240)).toBe(6240);
    expect(parseSteps(6240.7)).toBe(6241);
    expect(parseSteps("6 240")).toBe(6240);
    expect(parseSteps("6240,0")).toBe(6240);
    expect(parseSteps("6.240")).toBe(6240);
    expect(parseSteps(0)).toBe(0);
  });
  it("rejeita lixo", () => {
    expect(parseSteps("abc")).toBeNull();
    expect(parseSteps(-5)).toBeNull();
    expect(parseSteps(999999)).toBeNull();
  });
});
