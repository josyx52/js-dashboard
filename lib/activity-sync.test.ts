import { describe, it, expect } from "vitest";
import { activityKey, fromActivityEvent, fromCalendarEvent, fromCompletedTask } from "./activity-sync";

const projects = new Map([["P1", "Central de Projetos"]]);

describe("activity-sync", () => {
  it("as duas fontes do Todoist dao a mesma chave para a mesma conclusao", () => {
    const ev = fromActivityEvent(
      { event_type: "completed", object_id: "T1", event_date: "2026-10-19T07:26:55.895Z", parent_project_id: "P1", extra_data: { content: "Comprar chip", is_recurring: false } },
      projects
    );
    const done = fromCompletedTask({ id: "T1", content: "Comprar chip", project_id: "P1", completed_at: "2026-10-19T07:26:55.882Z" }, projects);
    expect(ev?.id).toBe(done?.id);
    expect(ev).toMatchObject({ task_id: "T1", project_name: "Central de Projetos", content: "Comprar chip" });
    expect(activityKey("todoist", "T1", "2026-10-19T07:26:59Z")).toBe("todoist:T1:2026-10-19T07:26");
  });

  it("ignora eventos que nao sao conclusoes", () => {
    expect(fromActivityEvent({ event_type: "updated", object_id: "T1", event_date: "2026-10-19T07:00:00Z" }, projects)).toBeNull();
  });

  it("calendario: dia local, dia todo e cancelados", () => {
    expect(fromCalendarEvent({ id: "e", summary: "Jantar", start: { dateTime: "2026-10-19T23:30:00Z" }, end: { dateTime: "2026-10-20T00:30:00Z" } })).toMatchObject({
      date: "2026-10-20",
      all_day: false,
    });
    expect(fromCalendarEvent({ id: "f", summary: "Feriado", start: { date: "2026-10-05" }, end: { date: "2026-10-06" } })).toMatchObject({ date: "2026-10-05", all_day: true, start_at: null });
    expect(fromCalendarEvent({ id: "g", status: "cancelled", start: { date: "2026-10-05" } })).toBeNull();
  });
});
