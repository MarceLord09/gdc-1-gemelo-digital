import { useElementWidth } from "../lib/useElementWidth";
import "./BarChart.css";

export interface BoxGroup {
  key: string;
  label: string;
  values: number[];
  emphasize?: boolean;
}

interface BoxPlotChartProps {
  groups: BoxGroup[];
  yLabel: string;
  valueFormat?: (v: number) => string;
  /** 0: desviación poblacional (pipeline); 1: muestral (n − 1) */
  sdDdof?: 0 | 1;
  ariaLabel: string;
  height?: number;
}

export function quantile(sorted: number[], q: number): number {
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/** Desviación estándar poblacional entre pliegues (igual que `np.std` del pipeline y la tabla de desempeño). */
export function stdev(v: number[], ddof: 0 | 1 = 0): number {
  const m = v.reduce((a, b) => a + b, 0) / v.length;
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / Math.max(v.length - ddof, 1));
}

/** Marcas redondas para un eje con rango [min, max]. */
export function axisTicks(min: number, max: number) {
  const raw = (max - min) / 5 || 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = ([1, 2, 5, 10].find((m) => m * mag >= raw) ?? 10) * mag;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const ticks: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) ticks.push(Number(v.toFixed(10)));
  return { ticks, lo, hi };
}

/** Diagrama de cajas con los puntos individuales (un punto por pliegue). */
export function BoxPlotChart({ groups, yLabel, valueFormat, sdDdof = 0, ariaLabel, height = 280 }: BoxPlotChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(560);
  const fmt = valueFormat ?? ((v: number) => v.toLocaleString("es"));
  const marginLeft = 58;
  const marginRight = 10;
  const marginTop = 16;
  const marginBottom = 52;
  const baseline = height - marginBottom;
  const innerWidth = Math.max(width - marginLeft - marginRight, 10);
  const innerHeight = baseline - marginTop;
  const all = groups.flatMap((g) => g.values);
  const { ticks, lo, hi } = axisTicks(Math.min(...all), Math.max(...all));
  const yOf = (v: number) => baseline - ((v - lo) / (hi - lo)) * innerHeight;
  const slot = innerWidth / groups.length;
  const boxW = Math.min(44, slot * 0.5);

  return (
    <div className="barchart" ref={ref} role="group" aria-label={ariaLabel}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line x1={marginLeft} y1={marginTop} x2={marginLeft} y2={baseline} stroke="var(--rule-strong)" />
        {ticks.map((t) => (
          <g key={t}>
            <line x1={marginLeft - 4} y1={yOf(t)} x2={marginLeft} y2={yOf(t)} stroke="var(--rule-strong)" />
            <line x1={marginLeft} y1={yOf(t)} x2={width - marginRight} y2={yOf(t)} stroke="var(--rule)" strokeWidth={0.6} />
            <text className="barchart-axis-label" x={marginLeft - 8} y={yOf(t) + 4} textAnchor="end">
              {t.toLocaleString("es")}
            </text>
          </g>
        ))}
        <text
          className="barchart-axis-label"
          transform={`rotate(-90 12 ${(marginTop + baseline) / 2})`}
          x={12}
          y={(marginTop + baseline) / 2}
          textAnchor="middle"
        >
          {yLabel}
        </text>
        <line x1={marginLeft} y1={baseline} x2={width - marginRight} y2={baseline} stroke="var(--rule-strong)" />
        {groups.map((g, i) => {
          const s = [...g.values].sort((a, b) => a - b);
          const cx = marginLeft + slot * i + slot / 2;
          const color = g.emphasize ? "var(--good)" : "var(--series-neutral)";
          const q1 = quantile(s, 0.25);
          const q2 = quantile(s, 0.5);
          const q3 = quantile(s, 0.75);
          return (
            <g key={g.key}>
              <line x1={cx} y1={yOf(s[0])} x2={cx} y2={yOf(s[s.length - 1])} stroke={color} strokeWidth={1.4} />
              <line x1={cx - boxW / 4} y1={yOf(s[0])} x2={cx + boxW / 4} y2={yOf(s[0])} stroke={color} strokeWidth={1.4} />
              <line x1={cx - boxW / 4} y1={yOf(s[s.length - 1])} x2={cx + boxW / 4} y2={yOf(s[s.length - 1])} stroke={color} strokeWidth={1.4} />
              <rect x={cx - boxW / 2} y={yOf(q3)} width={boxW} height={Math.max(yOf(q1) - yOf(q3), 1)} fill={color} fillOpacity={0.22} stroke={color} strokeWidth={1.4} />
              <line x1={cx - boxW / 2} y1={yOf(q2)} x2={cx + boxW / 2} y2={yOf(q2)} stroke={color} strokeWidth={2.4} />
              {g.values.map((v, k) => (
                <circle
                  key={k}
                  cx={cx + (((k * 7) % 9) - 4) * (boxW / 14)}
                  cy={yOf(v)}
                  r={2.6}
                  fill={color}
                  stroke="var(--paper)"
                  strokeWidth={0.8}
                >
                  <title>{`${g.label}, pliegue ${k + 1}: ${fmt(v)}`}</title>
                </circle>
              ))}
              <text className="barchart-axis-label" x={cx} y={baseline + 18} textAnchor="middle">
                {g.label}
              </text>
              <text className="barchart-note" x={cx} y={baseline + 34} textAnchor="middle" style={{ fill: "var(--ink-muted)" }}>
                {`σ = ${fmt(stdev(g.values, sdDdof))}`}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
