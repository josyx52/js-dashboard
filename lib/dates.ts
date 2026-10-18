// Data local (fuso do browser) em YYYY-MM-DD — diferente de toISOString(),
// que da a data em UTC e pode "saltar" de dia perto da meia-noite local.
export function localDateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Data civil (YYYY-MM-DD) de um instante noutro fuso — ex: o dueDate do
// TickTick vem em UTC ("2026-07-27T23:00:00+0000" = 28/07 em Lisboa).
export function dateInTimeZone(instant: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
  } catch {
    return instant.toISOString().slice(0, 10);
  }
}
