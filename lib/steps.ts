// Os Atalhos do iPhone podem mandar o numero com casas decimais ou
// formatado no locale pt ("6 240", "6.240", "6240,0").
export function parseSteps(v: unknown): number | null {
  let n: number;
  if (typeof v === "number") n = v;
  else {
    const t = String(v ?? "").trim().replace(/ /g, " ");
    if (!/\d/.test(t)) return null;
    if (/^\d{1,3}([ .]\d{3})+(,\d+)?$/.test(t)) n = Number(t.replace(/[ .]/g, "").replace(",", "."));
    else n = Number(t.replace(/[^\d.,]/g, "").replace(",", "."));
  }
  return Number.isFinite(n) && n >= 0 && n < 200000 ? Math.round(n) : null;
}
