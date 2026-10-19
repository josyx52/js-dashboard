import { describe, it, expect } from "vitest";
import { buildOverview, type OverviewRaw } from "./overview";

const base: OverviewRaw = {
  openTasks: [], doneTasks: [], logs: [], body: [], profile: null, steps: [], actions: [],
  messages: 0, memories: 0, automations: [], runs: [], agenda: [], lastSyncAt: null,
  taskPillars: [], activity: [], calendarEvents: [], syncSummary: null,
};
const now = new Date("2026-10-19T10:00:00Z"); // Lisboa 11:00

describe("buildOverview", () => {
  it("serie diaria cobre o intervalo e compara com o periodo anterior", () => {
    const o = buildOverview(
      { ...base, doneTasks: [{ updated_at: "2026-10-19T09:00:00Z" }, { updated_at: "2026-10-13T09:00:00Z" }, { updated_at: "2026-10-10T09:00:00Z" }] },
      now,
      7
    );
    expect(o.series).toHaveLength(7);
    expect(o.series[0].date).toBe("2026-10-13");
    expect(o.tasks.doneInRange).toBe(2);
    expect(o.tasks.donePrevRange).toBe(1);
  });

  it("refeicoes no dia local (23:30 UTC de 18/10 = 00:30 de 19/10 em Lisboa)", () => {
    const o = buildOverview(
      { ...base, logs: [{ created_at: "2026-10-18T23:30:00Z", kcal: 500, type: "in", protein_g: 30, carbs_g: null, fat_g: "10" }, { created_at: "2026-10-19T08:00:00Z", kcal: 200, type: "out", protein_g: null, carbs_g: null, fat_g: null }] },
      now,
      7
    );
    expect(o.nutrition.todayIn).toBe(500);
    expect(o.nutrition.todayTraining).toBe(200);
    expect(o.nutrition.macros).toEqual({ protein: 30, carbs: 0, fat: 10 });
    expect(o.nutrition.loggedDays).toBe(1);
  });

  it("tarefas por balde, pilar, GTD e atraso mais antigo", () => {
    const o = buildOverview(
      {
        ...base,
        openTasks: [
          { id: "a", content: "a", due: "2026-10-10", pillar: "saude", recurring: false, gtd_owner: "holiday" },
          { id: "b", content: "b", due: "2026-10-01", pillar: "saude", recurring: true, gtd_owner: null },
          { id: "c", content: "c", due: null, pillar: "estudo", recurring: false, gtd_owner: "eu" },
          { id: "d", content: "d", due: "2026-12-01", pillar: "estudo", recurring: false, gtd_owner: null },
        ],
      },
      now,
      7
    );
    expect(o.tasks).toMatchObject({ open: 4, today: 1, overdue: 1, undated: 1, oldestOverdueDays: 9, gtd: { eu: 1, holiday: 1, unclear: 2 } });
    expect(o.tasks.byPillar.find((p) => p.key === "saude")).toMatchObject({ overdue: 1, today: 1 });
  });

  it("metabolismo, meta e IMC a partir do peso mais recente", () => {
    const o = buildOverview(
      {
        ...base,
        body: [{ date: "2026-09-01", weight_kg: "82", body_fat_pct: null, lean_mass_kg: null }, { date: "2026-10-01", weight_kg: 80, body_fat_pct: 20, lean_mass_kg: null }],
        profile: { height_cm: 180, age: 30, sex: "m", goal: "perder" },
      },
      now,
      30
    );
    expect(o.nutrition.bmr).toBe(1780);
    expect(o.nutrition.targetKcal).toBe(1513);
    expect(o.body.bmi).toBe(24.7);
    expect(o.body.previous?.weight).toBe(82);
    expect(o.body.series.map((s) => s.weight)).toEqual([82, 80]);
  });

  it("atividades: pilar pela tarefa ou pelo projeto, rotina dia a dia, hora e sequencia", () => {
    const act = (task_id: string, at: string, project_id: string | null = null) => ({ task_id, content: "x " + task_id, project_id, project_name: project_id ? "Proj " + project_id : null, recurring: false, completed_at: at });
    const o = buildOverview(
      {
        ...base,
        openTasks: [{ id: "r1", content: "Bíblia", due: "2026-10-19", pillar: "deus", recurring: true, gtd_owner: null }],
        taskPillars: [{ id: "r1", pillar: "deus", source_project_id: "P" }, { id: "t2", pillar: "negocio", source_project_id: "N" }, { id: "t9", pillar: "negocio", source_project_id: "N" }],
        activity: [
          act("r1", "2026-10-19T06:10:00Z"), // 07:10 Lisboa
          act("r1", "2026-10-18T06:10:00Z"),
          act("r1", "2026-10-17T06:10:00Z"),
          act("t2", "2026-10-17T20:00:00Z"),
          act("t3", "2026-10-16T09:00:00Z", "N"), // sem pilar -> pilar do projeto N
          act("t4", "2026-10-08T09:00:00Z"), // periodo anterior
        ],
      },
      now,
      7
    );
    const a = o.activity;
    expect(a.total).toBe(5);
    expect(a.prevTotal).toBe(1);
    expect(a.streak).toBe(4);
    expect(a.byPillar.map((p) => [p.key, p.count])).toEqual([["deus", 3], ["negocio", 2]]);
    expect(a.byHour[7]).toBe(3);
    expect(a.routine[0]).toMatchObject({ id: "r1", done: 3 });
    expect(a.routine[0].days.slice(-3)).toEqual([true, true, true]);
    expect(o.tasks.doneInRange).toBe(5);
  });

  it("agenda: horas por dia, eventos mais longos e erro do Google", () => {
    const o = buildOverview(
      {
        ...base,
        syncSummary: { calendar_history_error: "sem acesso ao Google Calendar: Google OAuth: refresh token expirado" },
        calendarEvents: [
          { id: "1", summary: "Treino", start_at: "2026-10-18T17:00:00Z", end_at: "2026-10-18T18:30:00Z", all_day: false, date: "2026-10-18" },
          { id: "2", summary: "Treino", start_at: "2026-10-16T17:00:00Z", end_at: "2026-10-16T18:00:00Z", all_day: false, date: "2026-10-16" },
          { id: "3", summary: "Feriado", start_at: null, end_at: null, all_day: true, date: "2026-10-16" },
          { id: "4", summary: "Dentista", start_at: "2026-10-21T08:00:00Z", end_at: "2026-10-21T09:00:00Z", all_day: false, date: "2026-10-21" },
        ],
      },
      now,
      7
    );
    expect(o.calendar).toMatchObject({ count: 3, hours: 2.5, connected: false });
    expect(o.calendar.top[0]).toEqual({ title: "Treino", hours: 2.5, count: 2 });
    expect(o.agenda).toEqual([{ date: "2026-10-21", time: "09:00", title: "Dentista" }]);
  });
});
