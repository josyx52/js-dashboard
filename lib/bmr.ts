// Mifflin-St Jeor — formula clinica padrao para metabolismo basal (BMR).
// Extraida para lib/ para poder ser testada isoladamente (nao depende de
// nada externo — Supabase, APIs, etc.).
export function calcBMR(weightKg: number, heightCm: number, age: number, sex: "m" | "f") {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return Math.round(sex === "m" ? base + 5 : base - 161);
}
