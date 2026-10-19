"use client";
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "@/lib/cn";

// Graficos em SVG, sem dependencias. Regras (skill dataviz): marcas finas,
// colunas <= 24px com topo arredondado, linhas de 2px, grelha recessiva,
// texto sempre em tintas neutras, tooltip em todos os graficos com eixo.
// Paleta validada no fundo #111215 (modo escuro).

export const VIZ = {
  blue: "#3987e5",
  orange: "#d95926",
  aqua: "#199e70",
  yellow: "#c98500",
  magenta: "#d55181",
  violet: "#9085e9",
  red: "#e66767",
  grid: "rgb(var(--line) / 0.06)",
  axis: "rgb(var(--fg-3))",
} as const;

export function shortDay(date: string) {
  return new Date(date + "T12:00:00Z").toLocaleDateString("pt-PT", { day: "numeric", month: "short" }).replace(".", "");
}

export function compact(n: number) {
  if (Math.abs(n) >= 10000) return `${Math.round(n / 1000)}k`;
  if (Math.abs(n) >= 1000) return `${(n / 1000).toFixed(1).replace(".0", "")}k`;
  return String(Math.round(n));
}

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    if (!ref.current) return;
    const ro = new ResizeObserver(([e]) => setW(Math.floor(e.contentRect.width)));
    ro.observe(ref.current);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

// Escala "bonita": 0..max arredondado a 1/2/5 x 10^n, com 3 divisoes.
function niceMax(v: number) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 1.5, 2, 3, 4, 5, 6, 8, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function Tooltip(props: { x: number; width: number; children: React.ReactNode }) {
  const left = Math.min(Math.max(props.x, 70), props.width - 70);
  return (
    <div
      className="pointer-events-none absolute top-0 -translate-x-1/2 -translate-y-[calc(100%+6px)] z-10 rounded-lg border border-line/10 bg-surface-3 shadow-pop px-2.5 py-1.5 text-[11.5px] whitespace-nowrap"
      style={{ left }}
    >
      {props.children}
    </div>
  );
}

// Curva monotona (Fritsch-Carlson): suave sem passar acima/abaixo dos dados.
function smoothPath(p: (readonly [number, number])[]) {
  const n = p.length;
  if (n < 3) return p.map((q, i) => `${i ? "L" : "M"}${q[0]},${q[1]}`).join("");
  const dx = p.slice(1).map((q, i) => q[0] - p[i][0]);
  const m = p.slice(1).map((q, i) => (q[1] - p[i][1]) / (dx[i] || 1));
  const t = p.map((_, i) => (i === 0 ? m[0] : i === n - 1 ? m[n - 2] : m[i - 1] * m[i] <= 0 ? 0 : (2 * m[i - 1] * m[i]) / (m[i - 1] + m[i])));
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += `C${p[i][0] + h},${p[i][1] + t[i] * h} ${p[i + 1][0] - h},${p[i + 1][1] - t[i + 1] * h} ${p[i + 1][0]},${p[i + 1][1]}`;
  }
  return d;
}

export interface Point {
  x: string; // data YYYY-MM-DD
  y: number | null;
}

const PAD = { top: 8, right: 4, bottom: 22, left: 34 };

function XLabels({ data, at, h }: { data: Point[]; at: (i: number) => number; h: number }) {
  if (data.length === 0) return null;
  const idx = data.length <= 2 ? data.map((_, i) => i) : [0, Math.floor((data.length - 1) / 2), data.length - 1];
  return (
    <>
      {idx.map((i, k) => (
        <text
          key={i}
          x={at(i)}
          y={h - 6}
          fontSize={10.5}
          fill={VIZ.axis}
          textAnchor={k === 0 && idx.length > 1 ? "start" : k === idx.length - 1 && idx.length > 1 ? "end" : "middle"}
          className="tabular"
        >
          {data[i].x === new Date().toLocaleDateString("en-CA") ? "hoje" : shortDay(data[i].x)}
        </text>
      ))}
    </>
  );
}

function YGrid({ max, w, plotH, fmt }: { max: number; w: number; plotH: number; fmt: (n: number) => string }) {
  return (
    <>
      {[0, 0.5, 1].map((f) => {
        const y = PAD.top + plotH * (1 - f);
        return (
          <g key={f}>
            <line x1={PAD.left} x2={w - PAD.right} y1={y} y2={y} stroke={VIZ.grid} />
            <text x={PAD.left - 8} y={y + 3.5} fontSize={10.5} fill={VIZ.axis} textAnchor="end" className="tabular">
              {fmt(max * f)}
            </text>
          </g>
        );
      })}
    </>
  );
}

// Area de uma serie ao longo do tempo, com crosshair e tooltip.
export function AreaChart(props: {
  data: Point[];
  color?: string;
  height?: number;
  unit?: string;
  fmt?: (n: number) => string;
  domain?: "zero" | "auto"; // auto: ajusta ao intervalo (ex: peso)
  dots?: boolean;
  fill?: boolean;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  const color = props.color || VIZ.blue;
  const h = props.height || 200;
  const fmt = props.fmt || compact;
  const vals = props.data.map((d) => d.y).filter((v): v is number => v !== null);
  let lo = 0;
  let hi = niceMax(Math.max(0, ...vals));
  if (props.domain === "auto" && vals.length) {
    const mn = Math.min(...vals);
    const mx = Math.max(...vals);
    const pad = Math.max(1, (mx - mn) * 0.25);
    lo = Math.floor(mn - pad);
    hi = Math.ceil(mx + pad);
  }
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = h - PAD.top - PAD.bottom;
  const n = props.data.length;
  const at = (i: number) => PAD.left + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD.top + plotH * (1 - (v - lo) / (hi - lo || 1));
  const pts = props.data.map((d, i) => (d.y === null ? null : ([at(i), yAt(d.y)] as const)));
  // segmentos continuos (os dias sem dados partem a linha)
  const segs: (readonly [number, number])[][] = [];
  let cur: (readonly [number, number])[] = [];
  for (const p of pts) {
    if (p) cur.push(p);
    else if (cur.length) {
      segs.push(cur);
      cur = [];
    }
  }
  if (cur.length) segs.push(cur);
  const line = smoothPath;
  const base = PAD.top + plotH;

  function onMove(e: React.PointerEvent) {
    const r = (e.currentTarget as SVGElement).getBoundingClientRect();
    const x = e.clientX - r.left - PAD.left;
    setHover(Math.max(0, Math.min(n - 1, Math.round((x / (plotW || 1)) * (n - 1)))));
  }

  const hv = hover !== null ? props.data[hover] : null;
  return (
    <div ref={ref} className="relative w-full" style={{ height: h }}>
      {w > 0 && (
        <svg width={w} height={h} onPointerMove={onMove} onPointerLeave={() => setHover(null)} className="block touch-none">
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.22} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <YGrid max={hi} w={w} plotH={plotH} fmt={(v) => fmt(props.domain === "auto" ? lo + (v / hi) * (hi - lo) : v)} />
          {props.fill !== false &&
            segs.map((s, i) => (
              <path key={"a" + i} d={`${line(s)}L${s[s.length - 1][0]},${base}L${s[0][0]},${base}Z`} fill={`url(#${gid})`} />
            ))}
          {segs.map((s, i) =>
            s.length > 1 ? (
              <path key={"l" + i} d={line(s)} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
            ) : (
              <circle key={"l" + i} cx={s[0][0]} cy={s[0][1]} r={4} fill={color} stroke="rgb(var(--surface))" strokeWidth={2} />
            )
          )}
          {props.dots && pts.map((p, i) => p && <circle key={"d" + i} cx={p[0]} cy={p[1]} r={4} fill={color} stroke="rgb(var(--surface))" strokeWidth={2} />)}
          {/* ultimo ponto sempre marcado */}
          {(() => {
            const last = [...pts].reverse().find(Boolean);
            return last ? <circle cx={last[0]} cy={last[1]} r={4} fill={color} stroke="rgb(var(--surface))" strokeWidth={2} /> : null;
          })()}
          {hover !== null && (
            <>
              <line x1={at(hover)} x2={at(hover)} y1={PAD.top} y2={base} stroke="rgb(var(--line) / 0.18)" />
              {pts[hover] && <circle cx={pts[hover]![0]} cy={pts[hover]![1]} r={5} fill={color} stroke="rgb(var(--surface))" strokeWidth={2} />}
            </>
          )}
          <XLabels data={props.data} at={at} h={h} />
        </svg>
      )}
      {hv && hover !== null && (
        <Tooltip x={at(hover)} width={w}>
          <div className="text-fg-3">{shortDay(hv.x)}</div>
          <div className="flex items-center gap-1.5 text-fg font-medium tabular">
            <span className="w-2 h-2 rounded-full" style={{ background: color }} />
            {hv.y === null ? "sem dados" : `${fmt(hv.y)}${props.unit ? " " + props.unit : ""}`}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

// Colunas por dia, com linha de referencia (meta) opcional. O dia de hoje
// fica na cor cheia; os outros um pouco mais leves (enfase no presente).
export function ColumnChart(props: {
  data: Point[];
  color?: string;
  height?: number;
  unit?: string;
  fmt?: (n: number) => string;
  reference?: { value: number; label: string };
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const color = props.color || VIZ.blue;
  const h = props.height || 200;
  const fmt = props.fmt || compact;
  const vals = props.data.map((d) => d.y ?? 0);
  const hi = niceMax(Math.max(1, ...vals, props.reference?.value ?? 0));
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = h - PAD.top - PAD.bottom;
  const n = props.data.length;
  const slot = plotW / Math.max(1, n);
  const bw = Math.max(2, Math.min(24, slot - 2));
  const at = (i: number) => PAD.left + slot * i + slot / 2;
  const yAt = (v: number) => PAD.top + plotH * (1 - v / hi);
  const base = PAD.top + plotH;
  const r = Math.min(4, bw / 2);
  const hv = hover !== null ? props.data[hover] : null;

  return (
    <div ref={ref} className="relative w-full" style={{ height: h }}>
      {w > 0 && (
        <svg
          width={w}
          height={h}
          className="block touch-none"
          onPointerLeave={() => setHover(null)}
          onPointerMove={(e) => {
            const rect = (e.currentTarget as SVGElement).getBoundingClientRect();
            const i = Math.floor((e.clientX - rect.left - PAD.left) / (slot || 1));
            setHover(i >= 0 && i < n ? i : null);
          }}
        >
          <YGrid max={hi} w={w} plotH={plotH} fmt={fmt} />
          {props.data.map((d, i) => {
            if (!d.y) return null;
            const x = at(i) - bw / 2;
            const y = yAt(d.y);
            const hh = base - y;
            const rr = Math.min(r, hh);
            return (
              <path
                key={i}
                d={`M${x},${base}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + bw - rr}Q${x + bw},${y} ${x + bw},${y + rr}V${base}Z`}
                fill={color}
                opacity={hover === null || hover === i ? 1 : 0.4}
              />
            );
          })}
          {props.reference && (
            <g>
              <line x1={PAD.left} x2={w - PAD.right} y1={yAt(props.reference.value)} y2={yAt(props.reference.value)} stroke="rgb(var(--fg-2))" strokeWidth={1} strokeDasharray="3 3" />
              <text x={w - PAD.right} y={yAt(props.reference.value) - 5} fontSize={10.5} fill="rgb(var(--fg-2))" textAnchor="end">
                {props.reference.label}
              </text>
            </g>
          )}
          <XLabels data={props.data} at={at} h={h} />
        </svg>
      )}
      {hv && hover !== null && (
        <Tooltip x={at(hover)} width={w}>
          <div className="text-fg-3">{shortDay(hv.x)}</div>
          <div className="flex items-center gap-1.5 text-fg font-medium tabular">
            <span className="w-2 h-2 rounded-sm" style={{ background: color }} />
            {hv.y ? `${fmt(hv.y)}${props.unit ? " " + props.unit : ""}` : "sem registo"}
          </div>
        </Tooltip>
      )}
    </div>
  );
}

// Tendencia minima para os indicadores (sem eixos).
export function Sparkline({ values, color = VIZ.blue, height = 32, domain = "zero" }: { values: (number | null)[]; color?: string; height?: number; domain?: "zero" | "minmax" }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  // zero = baseline para contagens; minmax = so a variacao (ex: peso)
  const v = values.map((x) => x ?? 0);
  const lo = domain === "minmax" ? Math.min(...v) : 0;
  const span = Math.max(domain === "minmax" ? 0.5 : 1, Math.max(...v) - lo);
  const n = v.length;
  const pts = v.map((y, i) => [n <= 1 ? w / 2 : (i / (n - 1)) * (w - 4) + 2, height - 3 - ((y - lo) / span) * (height - 6)] as const);
  const d = smoothPath(pts);
  const gid = useId().replace(/:/g, "");
  return (
    <div ref={ref} className="w-full" style={{ height }}>
      {w > 0 && n > 1 && (
        <svg width={w} height={height} className="block" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.25} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={`${d}L${pts[n - 1][0]},${height}L${pts[0][0]},${height}Z`} fill={`url(#${gid})`} />
          <path d={d} fill="none" stroke={color} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
          <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r={3} fill={color} />
        </svg>
      )}
    </div>
  );
}

// Medidor de um valor contra um limite (ex: kcal vs meta). O trilho e um
// passo mais claro do mesmo tom.
export function Meter({ value, max, color = VIZ.blue, className }: { value: number; max: number; color?: string; className?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("h-1.5 w-full rounded-full overflow-hidden", className)} style={{ background: `${color}2e` }}>
      <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct}%`, background: color }} />
    </div>
  );
}

// Barra 100% segmentada (parte de um todo), com 2px de intervalo entre
// segmentos e legenda por baixo — a identidade nunca depende so da cor.
export function SegmentBar(props: { items: { label: string; value: number; color: string }[]; height?: number; unit?: string }) {
  const total = props.items.reduce((a, i) => a + i.value, 0);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <div>
      <div className="flex gap-[2px] w-full rounded-md overflow-hidden" style={{ height: props.height || 10, background: total ? undefined : "rgb(var(--line) / 0.06)" }}>
        {total > 0 &&
          props.items.map((it, i) =>
            it.value > 0 ? (
              <div
                key={it.label}
                onPointerEnter={() => setHover(i)}
                onPointerLeave={() => setHover(null)}
                className="h-full transition-opacity"
                style={{ flexGrow: it.value, flexBasis: 0, background: it.color, opacity: hover === null || hover === i ? 1 : 0.45 }}
                title={`${it.label}: ${it.value}${props.unit ? " " + props.unit : ""}`}
              />
            ) : null
          )}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
        {props.items.map((it, i) => (
          <div key={it.label} className={cn("flex items-center gap-1.5 text-[12px] transition-opacity", hover !== null && hover !== i && "opacity-50")}>
            <span className="w-2 h-2 rounded-sm" style={{ background: it.color }} />
            <span className="text-fg-2">{it.label}</span>
            <span className="text-fg font-medium tabular">
              {it.value}
              {props.unit && <span className="text-fg-3 font-normal"> {props.unit}</span>}
            </span>
            {total > 0 && <span className="text-fg-3 tabular">{Math.round((it.value / total) * 100)}%</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
