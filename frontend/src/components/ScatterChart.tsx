import { useElementWidth } from "../lib/useElementWidth";
import "./BarChart.css";

export interface ScatterPoint {
  key: string;
  label: string;
  x: number;
  y: number;
  group: string;
}

export interface ScatterGroup {
  key: string;
  label: string;
  colorVar: string;
}

interface ScatterChartProps {
  points: ScatterPoint[];
  groups: ScatterGroup[];
  xLabel: string;
  yLabel: string;
  /** puntos no dominados (minimizar x e y); se unen con la frontera de Pareto */
  frontier: ScatterPoint[];
  /** texto junto a cada punto de la frontera (p. ej. su RMSE) */
  frontierLabels?: Record<string, string>;
  /** puntos fuera del criterio de elegibilidad: se dibujan atenuados */
  dimmed?: Set<string>;
  ariaLabel: string;
  height?: number;
}

function logTicks(min: number, max: number) {
  const lo = Math.floor(Math.log10(min));
  const hi = Math.ceil(Math.log10(max));
  const t: number[] = [];
  for (let e = lo; e <= hi; e++) t.push(10 ** e);
  return { ticks: t, lo: 10 ** lo, hi: 10 ** hi };
}

/** Puntos no dominados al minimizar x e y. */
export function paretoFront(points: ScatterPoint[]): ScatterPoint[] {
  const sorted = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  const out: ScatterPoint[] = [];
  let bestY = Infinity;
  for (const p of sorted) {
    if (p.y < bestY) {
      out.push(p);
      bestY = p.y;
    }
  }
  return out;
}

export function ScatterChart({ points, groups, xLabel, yLabel, frontier, frontierLabels, dimmed, ariaLabel, height = 360 }: ScatterChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(560);
  const marginLeft = 78;
  const marginRight = 14;
  const marginTop = 14;
  const marginBottom = 46;
  const baseline = height - marginBottom;
  const innerWidth = Math.max(width - marginLeft - marginRight, 10);
  const innerHeight = baseline - marginTop;
  const xs = logTicks(Math.min(...points.map((p) => p.x)), Math.max(...points.map((p) => p.x)));
  const ys = logTicks(Math.min(...points.map((p) => p.y)), Math.max(...points.map((p) => p.y)));
  const xOf = (v: number) => marginLeft + ((Math.log10(v) - Math.log10(xs.lo)) / (Math.log10(xs.hi) - Math.log10(xs.lo))) * innerWidth;
  const yOf = (v: number) => baseline - ((Math.log10(v) - Math.log10(ys.lo)) / (Math.log10(ys.hi) - Math.log10(ys.lo))) * innerHeight;
  const colorOf = (g: string) => groups.find((x) => x.key === g)?.colorVar ?? "var(--series-neutral)";
  const onFront = new Set(frontier.map((p) => p.key));
  return (
    <div className="barchart" ref={ref} role="group" aria-label={ariaLabel}>
      <div className="barchart-legend">
        {groups.map((g) => (
          <div className="barchart-legend-item" key={g.key}>
            <span className="barchart-legend-swatch" style={{ background: g.colorVar, borderRadius: "50%" }} />
            {g.label}
          </div>
        ))}
        <div className="barchart-legend-item">
          <span className="barchart-legend-swatch" style={{ background: "var(--ink)", borderRadius: "50%" }} />
          Frontera de Pareto (cifra: RMSE)
        </div>
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {ys.ticks.map((t) => (
          <g key={`y${t}`}>
            <line x1={marginLeft} y1={yOf(t)} x2={width - marginRight} y2={yOf(t)} stroke="var(--rule)" strokeWidth={0.6} />
            <text className="barchart-axis-label" x={marginLeft - 8} y={yOf(t) + 4} textAnchor="end">
              {`${t.toLocaleString("es")} MB`}
            </text>
          </g>
        ))}
        {xs.ticks.map((t) => (
          <g key={`x${t}`}>
            <line x1={xOf(t)} y1={marginTop} x2={xOf(t)} y2={baseline} stroke="var(--rule)" strokeWidth={0.6} />
            <text className="barchart-axis-label" x={xOf(t)} y={baseline + 16} textAnchor="middle">
              {t.toLocaleString("es")}
            </text>
          </g>
        ))}
        <line x1={marginLeft} y1={marginTop} x2={marginLeft} y2={baseline} stroke="var(--rule-strong)" />
        <line x1={marginLeft} y1={baseline} x2={width - marginRight} y2={baseline} stroke="var(--rule-strong)" />
        <text className="barchart-axis-label" x={marginLeft + innerWidth / 2} y={height - 6} textAnchor="middle">
          {xLabel}
        </text>
        <text
          className="barchart-axis-label"
          transform={`rotate(-90 12 ${(marginTop + baseline) / 2})`}
          x={12}
          y={(marginTop + baseline) / 2}
          textAnchor="middle"
        >
          {yLabel}
        </text>
        {points.map((p) => (
          <circle
            key={p.key}
            cx={xOf(p.x)}
            cy={yOf(p.y)}
            r={onFront.has(p.key) ? 6.5 : 4.6}
            fill={colorOf(p.group)}
            fillOpacity={onFront.has(p.key) ? 1 : dimmed?.has(p.key) ? 0.22 : 0.7}
            stroke={onFront.has(p.key) ? "var(--ink)" : "var(--paper)"}
            strokeWidth={onFront.has(p.key) ? 2 : 0.8}
          >
            <title>{p.label}</title>
          </circle>
        ))}
        {(() => {
          // colocación voraz de etiquetas: evita que las cifras se pisen entre puntos cercanos
          const placed: { x: number; y: number }[] = [];
          return [...frontier]
            .sort((a, b) => yOf(a.y) - yOf(b.y))
            .map((p) => {
              const x = xOf(p.x) + 11;
              let y = yOf(p.y) + 4;
              const clash = (yy: number) => placed.some((q) => Math.abs(q.x - x) < 36 && Math.abs(q.y - yy) < 14);
              let tries = 0;
              while (clash(y) && tries < 8) {
                y += 14;
                tries++;
              }
              placed.push({ x, y });
              return (
                <text
                  key={`l${p.key}`}
                  className="barchart-axis-label"
                  x={x}
                  y={y}
                  style={{ fill: "var(--ink)", fontWeight: 600 }}
                >
                  {frontierLabels?.[p.key] ?? ""}
                </text>
              );
            });
        })()}
      </svg>
    </div>
  );
}
