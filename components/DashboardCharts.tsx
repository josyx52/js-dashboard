"use client";

export function LineChartCard(props: {
  todoist: [number, number]; // [atrasadas, hoje]
  ticktick: [number, number];
}) {
  const { todoist, ticktick } = props;
  const total = todoist[0] + todoist[1];
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
    <div className="border border-white/[0.08] bg-surface rounded-md p-5">
      <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
        TODOIST VS TICKTICK
      </div>
      <div className="flex items-baseline gap-3 mt-1.5">
        <span className="font-mono font-bold text-[34px] leading-none">{todoist[0] + todoist[1] + ticktick[0] + ticktick[1]}</span>
        <span className="px-[9px] py-[3px] border border-[rgba(245,78,0,0.35)] bg-[rgba(245,78,0,0.1)] rounded-[3px] font-mono font-semibold text-[11px] text-accent">
          {hojeTotal} PARA HOJE
        </span>
      </div>
      <div className="flex gap-4 mt-3.5 font-mono font-medium text-[11px] text-white/50">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[1px] bg-accent inline-block" />
          Todoist
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-[1px] bg-[#36CFC9] inline-block" />
          TickTick
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full mt-2.5" style={{ height: 150 }}>
        <defs>
          <linearGradient id="orangeFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#F54E00" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#F54E00" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="tealFade" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#36CFC9" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#36CFC9" stopOpacity={0} />
          </linearGradient>
        </defs>
        {gridVals.map((v, i) => (
          <g key={i}>
            <line x1={x0} y1={yFor(v)} x2={x1} y2={yFor(v)} stroke="rgba(255,255,255,0.08)" strokeDasharray="3,4" />
            <text x={x0 - 6} y={yFor(v) + 3} fill="rgba(244,244,242,0.35)" fontSize={8} textAnchor="end" fontFamily="JetBrains Mono">
              {v}
            </text>
          </g>
        ))}
        <path d={area(ptsA)} fill="url(#orangeFade)" />
        <path d={area(ptsB)} fill="url(#tealFade)" />
        <path d={line(ptsA)} fill="none" stroke="#F54E00" strokeWidth={2} />
        <path d={line(ptsB)} fill="none" stroke="#36CFC9" strokeWidth={2} />
        {ptsA.map((p, i) => <circle key={"a" + i} cx={p[0]} cy={p[1]} r={3.5} fill="#F54E00" />)}
        {ptsB.map((p, i) => <circle key={"b" + i} cx={p[0]} cy={p[1]} r={3.5} fill="#36CFC9" />)}
        <text x={x0} y={H - 4} fill="rgba(244,244,242,0.4)" fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono">Atrasadas</text>
        <text x={x1} y={H - 4} fill="rgba(244,244,242,0.4)" fontSize={9} textAnchor="middle" fontFamily="JetBrains Mono">Hoje</text>
      </svg>
    </div>
  );
}

export function DonutCard(props: { overdue: number; today: number }) {
  const total = Math.max(1, props.overdue + props.today);
  const pct = Math.round((100 * props.overdue) / total);
  return (
    <div className="border border-white/[0.08] bg-surface rounded-md p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div className="font-mono font-semibold text-[11px] tracking-[0.06em] text-white/40">
          DISTRIBUIÇÃO POR ESTADO
        </div>
        <span className="font-mono font-bold text-[34px] leading-none">{props.overdue + props.today}</span>
      </div>
      <div className="flex items-center gap-5">
        <div
          className="w-[110px] h-[110px] rounded-full flex items-center justify-center flex-none"
          style={{ background: `conic-gradient(#FF5F5F 0 ${pct}%, #F54E00 ${pct}% 100%)` }}
        >
          <div className="w-[70px] h-[70px] rounded-full bg-surface flex flex-col items-center justify-center">
            <span className="font-mono font-bold text-[20px]">{props.overdue + props.today}</span>
            <span className="font-mono font-medium text-[9px] text-white/40">itens</span>
          </div>
        </div>
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2 font-sans text-[12px]">
            <span className="w-2 h-2 rounded-[1px] bg-[#FF5F5F] inline-block" />
            Atrasadas — {props.overdue}
          </div>
          <div className="flex items-center gap-2 font-sans text-[12px]">
            <span className="w-2 h-2 rounded-[1px] bg-accent inline-block" />
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
  dateColor: string;
  onComplete: (id: string) => void;
  completingIds: Set<string>;
}) {
  return (
    <div className="border rounded-md overflow-hidden bg-surface" style={{ borderColor: `${props.accentColor}40` }}>
      <div className="flex items-center justify-between px-[18px] py-[14px] border-b border-white/[0.08]">
        <span className="font-sans font-bold text-[13px]">{props.title}</span>
        <span
          className="font-mono font-bold text-[11px] px-2 py-[2px] rounded-[3px]"
          style={{ background: `${props.accentColor}26`, color: props.accentColor }}
        >
          {props.items.length}
        </span>
      </div>
      <div className="flex flex-col">
        {props.items.length === 0 && (
          <div className="px-[18px] py-4 text-[12.5px] text-white/35 font-sans">nada por aqui</div>
        )}
        {props.items.map((t) => {
          const busy = props.completingIds.has(t.id);
          return (
            <div
              key={t.id}
              className="flex items-center gap-3 px-[18px] py-[13px] border-b border-white/[0.05] last:border-none"
            >
              <input
                type="checkbox"
                checked={busy}
                onChange={() => props.onComplete(t.id)}
                disabled={busy}
                className="w-[15px] h-[15px] flex-none accent-accent"
              />
              <span
                className="font-mono font-semibold text-[10px] px-2 py-[2px] rounded flex-none"
                style={{ background: `${t.pillarColor}26`, color: t.pillarColor }}
              >
                {t.pillarLabel}
              </span>
              <span className="flex-1 min-w-0 font-sans font-medium text-[13px] truncate">{t.title}</span>
              <span className="font-mono font-medium text-[11px] flex-none" style={{ color: props.dateColor }}>
                {t.date}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
