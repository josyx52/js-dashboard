import { calcBMR, GOAL_TARGET_PCT } from "@/lib/bmr";
import type { Snapshot } from "./snapshot";

// Etapas 2 e 3 do ciclo (EventEngine + ProblemEngine do Jarvis): regras
// deterministicas, sem IA, que transformam o snapshot em sinais e agrupam
// os sinais em problemas por pilar. Correm sempre — se a IA falhar, o
// Holiday continua a mostrar isto.

export type Severity = "alta" | "media" | "baixa";
export type Area = "deus" | "saude" | "familia" | "estudo" | "negocio" | "trabalho" | "sistema";

export interface Signal {
  id: string;
  area: Area;
  severity: Severity;
  title: string;
  detail?: string;
  taskIds?: string[];
}

export interface Problem {
  area: Area;
  severity: Severity;
  signals: Signal[];
}

const SEVERITY_RANK: Record<Severity, number> = { alta: 3, media: 2, baixa: 1 };

function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + "T12:00:00Z").getTime() - new Date(a + "T12:00:00Z").getTime()) / 86400000);
}

export function detectSignals(s: Snapshot): Signal[] {
  const out: Signal[] = [];

  // ── Rotina / tarefas de hoje ──
  const todayTasks = s.tasks.filter((t) => t.bucket === "today");
  const routineByArea = new Map<Area, typeof todayTasks>();
  for (const t of todayTasks) {
    const area = (t.pillar || "trabalho") as Area;
    routineByArea.set(area, [...(routineByArea.get(area) || []), t]);
  }
  for (const [area, list] of routineByArea) {
    out.push({
      id: `today:${area}`,
      area,
      // Ao fim do dia o que ficou por fazer pesa mais.
      severity: s.hour >= 20 ? "media" : "baixa",
      title: `${list.length} tarefa(s) para hoje`,
      detail: list.map((t) => t.title).join(" · "),
      taskIds: list.map((t) => t.id),
    });
  }

  // ── Atrasadas por pilar ──
  const overdue = s.tasks.filter((t) => t.bucket === "overdue");
  const overdueByArea = new Map<Area, typeof overdue>();
  for (const t of overdue) {
    const area = (t.pillar || "trabalho") as Area;
    overdueByArea.set(area, [...(overdueByArea.get(area) || []), t]);
  }
  for (const [area, list] of overdueByArea) {
    const oldest = list.reduce((m, t) => (t.due! < m ? t.due! : m), list[0].due!);
    const days = daysBetween(oldest, s.today);
    out.push({
      id: `overdue:${area}`,
      area,
      severity: days > 14 ? "alta" : "media",
      title: `${list.length} tarefa(s) atrasada(s) — a mais antiga há ${days} dia(s)`,
      detail: list.map((t) => `${t.title} (${t.due})`).join(" · "),
      taskIds: list.map((t) => t.id),
    });
  }

  // ── Duplicados (mesmo titulo aberto mais de uma vez na mesma fonte) ──
  const byTitle = new Map<string, typeof s.tasks>();
  for (const t of s.tasks) {
    const key = `${t.source}:${t.title.toLowerCase().trim()}`;
    byTitle.set(key, [...(byTitle.get(key) || []), t]);
  }
  for (const [, list] of byTitle) {
    if (list.length < 2) continue;
    out.push({
      id: `dup:${list[0].id}`,
      area: (list[0].pillar || "trabalho") as Area,
      severity: "baixa",
      title: `Tarefa duplicada ${list.length}x: ${list[0].title}`,
      taskIds: list.map((t) => t.id),
    });
  }

  // ── GTD ──
  // Tarefas que delegaste ao Holiday e em que ele ainda nao trabalhou.
  const mine = s.tasks.filter((t) => t.owner === "holiday" && !t.note);
  if (mine.length > 0) {
    out.push({
      id: "gtd:holiday_backlog",
      area: "sistema",
      severity: "media",
      title: `${mine.length} tarefa(s) delegada(s) ao Holiday sem trabalho feito`,
      detail: mine.map((t) => t.title).join(" · "),
      taskIds: mine.map((t) => t.id),
    });
  }
  // Por esclarecer: sem dono definido (nem tu nem o Holiday), fora a rotina.
  const unclear = s.tasks.filter((t) => !t.owner && !t.recurring && t.bucket !== "future");
  if (unclear.length > 0) {
    out.push({
      id: "gtd:unclarified",
      area: "sistema",
      severity: "baixa",
      title: `${unclear.length} tarefa(s) por esclarecer — quem faz: tu ou o Holiday?`,
      taskIds: unclear.map((t) => t.id),
    });
  }

  // ── Nutricao ──
  const meals = s.meals.filter((m) => m.type === "in");
  if (meals.length === 0 && s.hour >= 14) {
    out.push({ id: "meals:none", area: "saude", severity: "media", title: "Nenhuma refeição registada hoje" });
  }
  const weight = s.body?.weight_kg;
  const p = s.profile;
  if (meals.length > 0 && s.hour >= 20 && weight && p?.height_cm && p.age && p.sex && p.goal) {
    const bmr = calcBMR(weight, p.height_cm, p.age, p.sex);
    const stepsKcal = s.steps ? Math.round(s.steps * weight * 0.0005) : 0;
    const treino = s.meals.filter((m) => m.type === "out").reduce((a, m) => a + m.kcal, 0);
    const out_ = bmr + stepsKcal + treino;
    const inn = meals.reduce((a, m) => a + m.kcal, 0);
    const pct = Math.round(((out_ - inn) / out_) * 100);
    const target = GOAL_TARGET_PCT[p.goal] ?? 0;
    const onTrack = p.goal === "perder" ? pct >= target : p.goal === "ganhar" ? pct <= target : Math.abs(pct) <= 10;
    if (!onTrack) {
      out.push({
        id: "deficit:off",
        area: "saude",
        severity: "media",
        title: `Défice de ${pct}% — meta ${target}% (${p.goal})`,
        detail: `ingeridas ${inn} kcal · gastas ${out_} kcal`,
      });
    }
  }

  // ── Corpo / perfil ──
  if (!s.body) {
    out.push({ id: "weight:none", area: "saude", severity: "baixa", title: "Nunca registaste o peso" });
  } else {
    const d = daysBetween(s.body.date, s.today);
    if (d > 7) out.push({ id: "weight:stale", area: "saude", severity: "baixa", title: `Último peso registado há ${d} dias` });
  }
  if (!p?.height_cm || !p?.age || !p?.sex) {
    out.push({ id: "profile:incomplete", area: "saude", severity: "baixa", title: "Perfil incompleto (altura/idade/sexo)" });
  }

  // ── Sistema ──
  if (!s.lastSyncAt) {
    out.push({ id: "sync:never", area: "sistema", severity: "media", title: "Sync nunca correu" });
  } else {
    const h = (new Date(s.now).getTime() - new Date(s.lastSyncAt).getTime()) / 3600000;
    if (h > 3) {
      out.push({
        id: "sync:stale",
        area: "sistema",
        severity: h > 24 ? "alta" : "media",
        title: `Tarefas desatualizadas — último sync há ${Math.round(h)} h`,
      });
    }
  }

  return out;
}

export function groupProblems(signals: Signal[]): Problem[] {
  const byArea = new Map<Area, Signal[]>();
  for (const sig of signals) byArea.set(sig.area, [...(byArea.get(sig.area) || []), sig]);
  return [...byArea.entries()]
    .map(([area, list]) => {
      const sorted = [...list].sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
      return { area, severity: sorted[0].severity, signals: sorted };
    })
    .sort((a, b) => SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity]);
}
