"use client";

export function LineChartCard(props: {
  todoist: [number, number];
  ticktick: [number, number];
}) {
  const { todoist, ticktick } = props;
  const hojeTotal = todoist[1] + ticktick[1];
  const max = Math.max(1, todoist[0], todoist[1], ticktick[0], ticktick[1]);
  const W = 300, H = 150, padL = 24, padB = 22, padT = 10;
  const x0 = padL, x1 = W - 10;
  const yFor = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const baseY = H - padB;
  const ptsA: [number, number][] = [[x0, yFor(todoist[0])], [x1, yFor(todoist[1])]];
  const ptsB: [number, number][] = [[x0, yFor(ticktick[0])], [x1, yFor(ticktick[1])]];
  const line = (pts: [number, number][]) => {
    const [p0, p1] = pts;
    const midX = (p0[0] + p1[0]) / 2;
    return `M${p0[0]},${p0[1]} C${midX},${p0[1]} ${midX},${p1[1]} ${p1[0]},${p1[1]}`;
  };
  const area = (pts: [number, number][]) =>
    line(pts) + ` L${pts[1][0]},${baseY} L${pts[0][0]},${baseY} Z`;
  const gridVals = [0.33, 0.66, 1].map((f) => Math.round(max * f));

  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 20 }}>
      <div style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.06em", color: "rgba(244,244,242,0.4)" }}>
        TODOIST VS TICKTICK
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginTop: 6 }}>
        <span style={{ font: "700 34px 'JetBrains Mono',monospace" }}>
          {todoist[0] + todoist[1] + ticktick[0] + ticktick[1]}
        </span>
        <span
          style={{
            padding: "3px 9px",
            border: "1px solid rgba(245,78,0,0.35)",
            background: "rgba(245,78,0,0.1)",
            borderRadius: 3,
            font: "600 11px 'JetBrains Mono',monospace",
            color: "#F54E00",
          }}
        >
          {hojeTotal} PARA HOJE
        </span>
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, font: "500 11px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.5)" }}>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#F54E00", borderRadius: 1, marginRight: 6 }} />Todoist</span>
        <span><span style={{ display: "inline-block", width: 8, height: 8, background: "#36CFC9", borderRadius: 1, marginRight: 6 }} />TickTick</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 150, marginTop: 10 }}>
        <defs>
          <linearGradient id="orangeFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F54E00" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#F54E00" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="cyanFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#36CFC9" stopOpacity={0.22} />
            <stop offset="100%" stopColor="#36CFC9" stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={0} y1={yFor(v)} x2={W} y2={yFor(v)} stroke="rgba(255,255,255,0.06)" />
            <text x={0} y={yFor(v) - 4} fill="rgba(244,244,242,0.3)" fontSize={9} fontFamily="JetBrains Mono">{v}</text>
          </g>
        ))}
        <path d={area(ptsA)} fill="url(#orangeFade)" stroke="none" />
        <path d={area(ptsB)} fill="url(#cyanFade)" stroke="none" />
        <path d={line(ptsA)} fill="none" stroke="#F54E00" strokeWidth={2} strokeLinecap="round" />
        <path d={line(ptsB)} fill="none" stroke="#36CFC9" strokeWidth={2} strokeLinecap="round" />
        {ptsA.map((p, i) => <circle key={"a" + i} cx={p[0]} cy={p[1]} r={3.5} fill="#F54E00" />)}
        {ptsB.map((p, i) => <circle key={"b" + i} cx={p[0]} cy={p[1]} r={3.5} fill="#36CFC9" />)}
        <text x={x0} y={H - 5} fill="rgba(244,244,242,0.4)" fontSize={10} fontFamily="JetBrains Mono">Atrasadas</text>
        <text x={x1 - 30} y={H - 5} fill="rgba(244,244,242,0.4)" fontSize={10} fontFamily="JetBrains Mono">Hoje</text>
      </svg>
    </div>
  );
}

export function DonutCard(props: { overdue: number; today: number }) {
  const total = Math.max(1, props.overdue + props.today);
  const pct = Math.round((100 * props.overdue) / total);
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.08)", background: "#14161B", borderRadius: 6, padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <div style={{ font: "600 11px 'JetBrains Mono',monospace", letterSpacing: "0.06em", color: "rgba(244,244,242,0.4)" }}>
          DISTRIBUIÇÃO POR ESTADO
        </div>
        <span style={{ font: "700 34px 'JetBrains Mono',monospace" }}>{props.overdue + props.today}</span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <div
          style={{
            width: 110, height: 110, borderRadius: "50%", flexShrink: 0,
            background: `conic-gradient(#FF5F5F 0 ${pct}%, #F54E00 ${pct}% 100%)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          <div style={{ width: 70, height: 70, borderRadius: "50%", background: "#14161B", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
            <span style={{ font: "700 20px 'JetBrains Mono',monospace" }}>{props.overdue + props.today}</span>
            <span style={{ font: "500 9px 'JetBrains Mono',monospace", color: "rgba(244,244,242,0.4)" }}>itens</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "500 12px Inter,sans-serif" }}>
            <span style={{ width: 8, height: 8, background: "#FF5F5F", borderRadius: 1, display: "inline-block" }} />
            Atrasadas — {props.overdue}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, font: "500 12px Inter,sans-serif" }}>
            <span style={{ width: 8, height: 8, background: "#F54E00", borderRadius: 1, display: "inline-block" }} />
            Para hoje — {props.today}
          </div>
        </div>
      </div>
    </div>
  );
}

export interface ListItem {
  id: string;
  title: string;
  date: string;
  pillarLabel: string;
  pillarColor: string;
}

export function TaskListCard(props: {
  title: string;
  items: ListItem[];
  accentColor: string;
  borderColor: string;
  dateColor: string;
  onComplete: (id: string) => void;
  completingIds: Set<string>;
}) {
  return (
    <div style={{ border: `1px solid ${props.borderColor}`, background: "#14161B", borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
        <span style={{ font: "700 13px Inter,sans-serif" }}>{props.title}</span>
        <span
          style={{
            font: "700 11px 'JetBrains Mono',monospace", padding: "2px 8px",
            background: `${props.accentColor}26`, color: props.accentColor, borderRadius: 3,
          }}
        >
          {props.items.length}
        </span>
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {props.items.length === 0 && (
          <div style={{ padding: "16px 18px", font: "500 12.5px Inter,sans-serif", color: "rgba(244,244,242,0.35)" }}>
            nada por aqui
          </div>
        )}
        {props.items.map((t) => {
          const busy = props.completingIds.has(t.id);
          return (
            <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 18px", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
              <input
                type="checkbox"
                checked={busy}
                onChange={() => props.onComplete(t.id)}
                disabled={busy}
                style={{ width: 15, height: 15, accentColor: "#F54E00", flexShrink: 0 }}
              />
              <span
                style={{
                  font: "600 10px 'JetBrains Mono',monospace", letterSpacing: "0.03em",
                  padding: "3px 8px", borderRadius: 3, flexShrink: 0,
                  color: t.pillarColor, background: `${t.pillarColor}1a`, border: `1px solid ${t.pillarColor}40`,
                }}
              >
                {t.pillarLabel}
              </span>
              <span style={{ flex: 1, font: "500 13px Inter,sans-serif", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {t.title}
              </span>
              <span style={{ font: "500 11px 'JetBrains Mono',monospace", color: props.dateColor, flexShrink: 0 }}>
                {t.date}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
