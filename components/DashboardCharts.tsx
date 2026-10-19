"use client";
import { useState } from "react";
import { Card, Segmented } from "@/components/ui";

// Graficos do dashboard. Cores validadas (dataviz validate_palette, modo
// escuro, superficie #14161B): estados Atrasadas/Hoje/Sem data passam
// lightness, chroma, CVD e contraste. O texto usa sempre tintas neutras;
// a identidade vem da marca colorida ao lado.

export const STATE_COLORS = { overdue: "#e66767", today: "#3987e5", undated: "#c98500" } as const;
const DONE_COLOR = "#199e70";
const INK = { primary: "rgb(var(--fg))", secondary: "rgb(var(--fg-2))", muted: "rgb(var(--fg-3))" };
const GRID = "rgba(255,255,255,0.07)";
const mono = (w: number, size: number) => `${w} ${size}px 'JetBrains Mono',monospace`;
const cardStyle: React.CSSProperties = { padding: "16px 20px" };

function CardHead(props: { title: string; subtitle?: string; table: boolean; onTable: () => void }) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="flex-1 min-w-0">
        <h3 className="text-[13.5px] font-semibold text-fg">{props.title}</h3>
        {props.subtitle && <p className="text-[12.5px] text-fg-3 mt-1">{props.subtitle}</p>}
      </div>
      <Segmented<"chart" | "table">
        size="sm"
        value={props.table ? "table" : "chart"}
        onChange={(v) => v === "table" !== props.table && props.onTable()}
        options={[
          { value: "chart", label: "Gráfico" },
          { value: "table", label: "Tabela" },
        ]}
      />
    </div>
  );
}

function Legend(props: { items: { label: string; color: string }[] }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginBottom: 12 }}>
      {props.items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "500 11.5px Inter,sans-serif", color: INK.secondary }}>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: it.color }} />
          {it.label}
        </span>
      ))}
    </div>
  );
}

function Table(props: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", font: "500 12px Inter,sans-serif" }}>
      <thead>
        <tr>
          {props.head.map((h, i) => (
            <th key={h} style={{ textAlign: i ? "right" : "left", font: mono(600, 10), color: INK.muted, padding: "4px 6px", borderBottom: `1px solid ${GRID}` }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {props.rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j} style={{ textAlign: j ? "right" : "left", padding: "5px 6px", color: j ? INK.primary : INK.secondary, fontVariantNumeric: "tabular-nums", borderBottom: `1px solid ${GRID}` }}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Tarefas por pilar: barras horizontais empilhadas por estado ──

export interface PillarRow {
  label: string;
  color: string; // cor do pilar (so no marcador ao lado do nome)
  overdue: number;
  today: number;
  undated: number;
}

export function PillarStackCard(props: { rows: PillarRow[] }) {
  const [table, setTable] = useState(false);
  const [hover, setHover] = useState<{ row: string; seg: string; value: number; x: number; y: number } | null>(null);
  const max = Math.max(1, ...props.rows.map((r) => r.overdue + r.today + r.undated));
  const segs = [
    { key: "overdue" as const, label: "Atrasadas", color: STATE_COLORS.overdue },
    { key: "today" as const, label: "Hoje", color: STATE_COLORS.today },
    { key: "undated" as const, label: "Sem data", color: STATE_COLORS.undated },
  ];
  const total = props.rows.reduce((a, r) => a + r.overdue + r.today + r.undated, 0);

  return (
    <Card style={cardStyle}>
      <CardHead title="Tarefas abertas por pilar" subtitle={`${total} no total · futuras não contam`} table={table} onTable={() => setTable(!table)} />
      {table ? (
        <Table head={["Pilar", "Atrasadas", "Hoje", "Sem data", "Total"]} rows={props.rows.map((r) => [r.label, r.overdue, r.today, r.undated, r.overdue + r.today + r.undated])} />
      ) : (
        <>
          <Legend items={segs} />
          <div style={{ position: "relative", display: "flex", flexDirection: "column", gap: 10 }} onMouseLeave={() => setHover(null)}>
            {props.rows.map((r) => {
              const rowTotal = r.overdue + r.today + r.undated;
              return (
                <div key={r.label} style={{ display: "grid", gridTemplateColumns: "84px 1fr 28px", alignItems: "center", gap: 10 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6, font: "500 12px Inter,sans-serif", color: INK.secondary }}>
                    <span style={{ width: 7, height: 7, borderRadius: 1, background: r.color, flexShrink: 0 }} />
                    {r.label}
                  </span>
                  <div style={{ display: "flex", gap: 2, height: 14, background: rowTotal ? "transparent" : GRID, borderRadius: 2 }}>
                    {segs.map((s, i) => {
                      const v = r[s.key];
                      if (!v) return null;
                      const last = segs.slice(i + 1).every((n) => !r[n.key]);
                      return (
                        <div
                          key={s.key}
                          onMouseMove={(e) => {
                            const box = (e.currentTarget.closest("[data-chart]") as HTMLElement).getBoundingClientRect();
                            setHover({ row: r.label, seg: s.label, value: v, x: e.clientX - box.left, y: e.clientY - box.top });
                          }}
                          style={{ width: `${(v / max) * 100}%`, background: s.color, borderRadius: last ? "0 4px 4px 0" : 0, cursor: "default", minWidth: 3 }}
                        />
                      );
                    })}
                  </div>
                  <span style={{ font: mono(600, 11.5), color: rowTotal ? INK.primary : INK.muted, textAlign: "right" }}>{rowTotal}</span>
                </div>
              );
            })}
            <div data-chart style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
              {hover && (
                <div style={{ position: "absolute", left: Math.min(hover.x + 12, 260), top: hover.y - 40, background: "rgb(var(--surface-3))", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 8, boxShadow: "0 8px 24px -8px rgb(0 0 0 / .6)", padding: "6px 9px", font: "500 11.5px Inter,sans-serif", color: INK.primary, whiteSpace: "nowrap" }}>
                  {hover.row} · {hover.seg}: <b>{hover.value}</b>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ── Ultimos N dias (historico do Holiday) ──

export interface HistoryRow {
  date: string;
  done_count: number | null;
  overdue: number | null;
}

function dayLabel(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-PT", { day: "2-digit", month: "2-digit" });
}

function MiniChart(props: {
  kind: "columns" | "line";
  color: string;
  points: { date: string; value: number | null }[];
  label: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 100; // viewBox em %
  const H = 90;
  const vals = props.points.map((p) => p.value ?? 0);
  const max = Math.max(1, ...vals);
  const niceMax = max <= 4 ? 4 : max <= 10 ? 10 : Math.ceil(max / 10) * 10;
  const n = props.points.length;
  const slot = W / n;
  const x = (i: number) => slot * i + slot / 2;
  const y = (v: number) => H - (v / niceMax) * (H - 8);
  const linePts = props.points.map((p, i) => (p.value === null ? null : `${x(i)},${y(p.value)}`)).filter(Boolean).join(" ");

  return (
    <div style={{ position: "relative" }} onMouseLeave={() => setHover(null)}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ font: "600 12px Inter,sans-serif", color: INK.secondary }}>{props.label}</span>
        <span style={{ font: mono(500, 10), color: INK.muted }}>máx {niceMax}</span>
      </div>
      <div style={{ position: "relative", height: 90 }}>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: "100%", height: 90, display: "block", overflow: "visible" }}>
        <line x1={0} x2={W} y1={H} y2={H} stroke="rgba(255,255,255,0.18)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
        <line x1={0} x2={W} y1={y(niceMax / 2)} y2={y(niceMax / 2)} stroke={GRID} strokeWidth={1} vectorEffect="non-scaling-stroke" />
        {props.kind === "columns" &&
          props.points.map((p, i) => {
            if (!p.value) return null;
            const bw = Math.min(slot - 1.2, 5);
            const top = y(p.value);
            return <rect key={p.date} x={x(i) - bw / 2} y={top} width={bw} height={H - top} rx={0.8} fill={props.color} opacity={hover === null || hover === i ? 1 : 0.45} />;
          })}
        {props.kind === "line" && (
          <>
            <polyline points={linePts} fill="none" stroke={props.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          </>
        )}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="rgba(255,255,255,0.25)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        {props.points.map((_, i) => (
          <rect key={i} x={slot * i} y={0} width={slot} height={H} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {props.kind === "line" &&
        props.points.map((p, i) =>
          p.value === null || (i !== n - 1 && hover !== i) ? null : (
            <span
              key={p.date}
              style={{ position: "absolute", left: `${x(i)}%`, top: `${(y(p.value) / H) * 100}%`, width: 9, height: 9, marginLeft: -4.5, marginTop: -4.5, borderRadius: "50%", background: props.color, boxShadow: "0 0 0 2px rgb(var(--surface))", pointerEvents: "none" }}
            />
          )
        )}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", font: mono(500, 9.5), color: INK.muted, marginTop: 4 }}>
        <span>{dayLabel(props.points[0].date)}</span>
        <span>hoje</span>
      </div>
      {hover !== null && (
        <div style={{ position: "absolute", left: `${Math.min(Math.max(x(hover), 12), 80)}%`, top: 0, transform: "translateX(-50%)", background: "rgb(var(--surface-3))", border: "1px solid rgb(255 255 255 / 0.1)", borderRadius: 8, boxShadow: "0 8px 24px -8px rgb(0 0 0 / .6)", padding: "5px 8px", font: "500 11.5px Inter,sans-serif", color: INK.primary, whiteSpace: "nowrap", pointerEvents: "none" }}>
          {dayLabel(props.points[hover].date)} · <b>{props.points[hover].value ?? "sem dados"}</b>
        </div>
      )}
    </div>
  );
}

export function HistoryCard(props: { rows: HistoryRow[]; days: number; today: string }) {
  const [table, setTable] = useState(false);
  const byDate = new Map(props.rows.map((r) => [r.date, r]));
  const dates = Array.from({ length: props.days }, (_, i) => {
    const d = new Date(new Date(props.today + "T12:00:00Z").getTime() - (props.days - 1 - i) * 86400000);
    return d.toISOString().slice(0, 10);
  });
  const done = dates.map((d) => ({ date: d, value: byDate.get(d)?.done_count ?? null }));
  const overdue = dates.map((d) => ({ date: d, value: byDate.get(d)?.overdue ?? null }));
  const withData = props.rows.length;

  return (
    <Card style={cardStyle}>
      <CardHead
        title={`Últimos ${props.days} dias`}
        subtitle={withData < 2 ? "o Holiday começou a registar o histórico há pouco — enche-se dia a dia" : `${withData} dias registados pelo Holiday`}
        table={table}
        onTable={() => setTable(!table)}
      />
      {table ? (
        <Table
          head={["Dia", "Concluídas", "Atrasadas"]}
          rows={dates.filter((d) => byDate.has(d)).map((d) => [dayLabel(d), byDate.get(d)!.done_count ?? "—", byDate.get(d)!.overdue ?? "—"])}
        />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <MiniChart kind="columns" color={DONE_COLOR} points={done} label="Tarefas concluídas por dia" />
          <MiniChart kind="line" color={STATE_COLORS.overdue} points={overdue} label="Atrasadas em aberto" />
        </div>
      )}
    </Card>
  );
}

