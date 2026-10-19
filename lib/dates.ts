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

// Instante (UTC) de uma hora local num fuso — ex: "2026-10-26" + "07:00" em
// Lisboa. Funciona nos dois lados da mudanca de hora.
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (ms: number) => {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).formatToParts(new Date(ms));
    const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute")) - ms;
  };
  const first = guess - offsetAt(guess);
  return new Date(guess - offsetAt(first));
}

// Dia da semana (0 = domingo) de uma data YYYY-MM-DD.
export function weekdayOf(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

export function addDays(date: string, n: number): string {
  return new Date(new Date(date + "T12:00:00Z").getTime() + n * 86400000).toISOString().slice(0, 10);
}
