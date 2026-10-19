// Correlacao sobre o historico diario (Correlator + BaselineEngine +
// Predictor do Jarvis). Funcoes puras: recebem as linhas de holiday_daily
// e devolvem linha de base, padroes em texto e ha quantos dias cada
// problema persiste. Sem IA — a IA so recebe as conclusoes.

export interface DailyRow {
  date: string;
  kcal_in: number | null;
  kcal_out: number | null;
  meals: number | null;
  deficit_pct: number | null;
  steps: number | null;
  weight_kg: number | null;
  today_pending: number | null;
  overdue: number | null;
  done_count: number | null;
  signals: string[] | null;
}

export interface Correlation {
  days: number; // dias de historico usados
  baseline: {
    registo_refeicoes_pct: number | null; // % de dias com pelo menos 1 refeicao registada
    kcal_media: number | null; // media nos dias com registo
    defice_medio_pct: number | null;
    passos_media: number | null;
    concluidas_media: number | null;
  };
  insights: string[];
  persistence: Record<string, number>; // signal id -> dias seguidos (inclui hoje)
}

const WEEKDAY = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round = (x: number | null, d = 0) => (x === null ? null : Math.round(x * 10 ** d) / 10 ** d);

export function pearson(xs: number[], ys: number[]): number | null {
  const n = xs.length;
  if (n < 3 || n !== ys.length) return null;
  const mx = avg(xs)!;
  const my = avg(ys)!;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

function weekday(date: string): number {
  return new Date(date + "T12:00:00Z").getUTCDay();
}

// rows: historico ANTERIOR a hoje (mais antigo -> mais recente).
export function correlate(rows: DailyRow[], todaySignals: string[], today: string): Correlation {
  const past = rows.filter((r) => r.date < today).sort((a, b) => a.date.localeCompare(b.date));
  const insights: string[] = [];

  const logged = past.filter((r) => (r.meals ?? 0) > 0);
  const baseline = {
    registo_refeicoes_pct: past.length ? Math.round((logged.length / past.length) * 100) : null,
    kcal_media: round(avg(logged.map((r) => r.kcal_in ?? 0))),
    defice_medio_pct: round(avg(logged.filter((r) => r.deficit_pct !== null).map((r) => r.deficit_pct!))),
    passos_media: round(avg(past.filter((r) => r.steps !== null).map((r) => r.steps!))),
    concluidas_media: round(avg(past.map((r) => r.done_count ?? 0)), 1),
  };

  // Dia da semana em que o registo de refeicoes mais falha.
  if (past.length >= 14) {
    const misses: Record<number, { miss: number; total: number }> = {};
    for (const r of past) {
      const w = weekday(r.date);
      misses[w] = misses[w] || { miss: 0, total: 0 };
      misses[w].total += 1;
      if ((r.meals ?? 0) === 0) misses[w].miss += 1;
    }
    const worst = Object.entries(misses)
      .filter(([, v]) => v.total >= 2 && v.miss / v.total >= 0.6)
      .sort((a, b) => b[1].miss / b[1].total - a[1].miss / a[1].total)[0];
    if (worst && (baseline.registo_refeicoes_pct ?? 0) >= 30) {
      insights.push(`Às ${WEEKDAY[Number(worst[0])]}s quase nunca registas refeições (${worst[1].miss}/${worst[1].total}).`);
    }
  }

  // Correlacoes entre metricas (so com 7+ dias com ambos os valores).
  const pair = (fx: (r: DailyRow) => number | null, fy: (r: DailyRow) => number | null) => {
    const pts = past.map((r) => [fx(r), fy(r)] as const).filter(([x, y]) => x !== null && y !== null) as [number, number][];
    return pts.length >= 7 ? pearson(pts.map((p) => p[0]), pts.map((p) => p[1])) : null;
  };
  const rStepsDeficit = pair((r) => r.steps, (r) => ((r.meals ?? 0) > 0 ? r.deficit_pct : null));
  if (rStepsDeficit !== null && rStepsDeficit >= 0.5) {
    insights.push(`Nos dias com mais passos o défice é maior (r=${rStepsDeficit.toFixed(2)}) — andar está a funcionar.`);
  }
  const rDoneMeals = pair((r) => r.done_count, (r) => r.meals);
  if (rDoneMeals !== null && Math.abs(rDoneMeals) >= 0.5) {
    insights.push(
      rDoneMeals > 0
        ? `Dias em que concluis mais tarefas são também os dias em que registas refeições (r=${rDoneMeals.toFixed(2)}) — quando estás organizado, estás em tudo.`
        : `Quando concluis muitas tarefas deixas de registar refeições (r=${rDoneMeals.toFixed(2)}).`
    );
  }

  // Tendencia de peso (Predictor): kg/semana entre o primeiro e o ultimo registo dos ultimos 30 dias.
  const weights = past.filter((r) => r.weight_kg !== null);
  if (weights.length >= 2) {
    const first = weights[0];
    const last = weights[weights.length - 1];
    const days = (new Date(last.date).getTime() - new Date(first.date).getTime()) / 86400000;
    if (days >= 7) {
      const perWeek = ((Number(last.weight_kg) - Number(first.weight_kg)) / days) * 7;
      insights.push(`Peso: ${perWeek >= 0 ? "+" : ""}${perWeek.toFixed(2)} kg/semana (${first.weight_kg} → ${last.weight_kg} kg).`);
    }
  }

  // Ha quantos dias seguidos cada sinal de hoje aparece (ciclo de vida do problema).
  const persistence: Record<string, number> = {};
  for (const id of todaySignals) {
    let n = 1;
    for (let i = past.length - 1; i >= 0; i--) {
      if (past[i].signals?.includes(id)) n += 1;
      else break;
    }
    persistence[id] = n;
  }

  return { days: past.length, baseline, insights, persistence };
}
