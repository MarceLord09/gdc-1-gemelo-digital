import { useElementWidth } from "../lib/useElementWidth";
import "./BarChart.css";

export interface HeatCell {
  x: string;
  y: string;
  a: number;
  b: number;
}

interface Panel {
  title: string;
  fmt: (v: number) => string;
}

interface HeatmapPairProps {
  xLabels: string[];
  yLabels: string[];
  cells: HeatCell[];
  a: Panel;
  b: Panel;
  xTitle: string;
  yTitle: string;
  ariaLabel: string;
}

/** Mezcla blanco -> azul de datos según t en [0, 1]. */
function shade(t: number): string {
  const c0 = [241, 245, 249];
  const c1 = [30, 64, 175];
  return `rgb(${c0.map((v, i) => Math.round(v + (c1[i] - v) * t)).join(",")})`;
}

/** Dos mapas de calor lado a lado sobre la misma malla de hiperparámetros:
 * a la izquierda el error y a la derecha la latencia. Más oscuro = valor mayor. */
export function HeatmapPair({ xLabels, yLabels, cells, a, b, xTitle, yTitle, ariaLabel }: HeatmapPairProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(560);
  const marginLeft = 62;
  const gap = 18;
  const top = 34;
  const bottom = 44;
  const panelW = Math.max((width - marginLeft - gap - 6) / 2, 60);
  const cellW = panelW / xLabels.length;
  const cellH = 40;
  const height = top + cellH * yLabels.length + bottom;
  const get = (x: string, y: string) => cells.find((c) => c.x === x && c.y === y);
  const range = (k: "a" | "b") => {
    const v = cells.map((c) => c[k]);
    return [Math.min(...v), Math.max(...v)];
  };
  const [aMin, aMax] = range("a");
  const [bMin, bMax] = range("b");

  const panel = (key: "a" | "b", p: Panel, x0: number, min: number, max: number) => (
    <g key={key}>
      <text className="barchart-axis-label" x={x0 + panelW / 2} y={18} textAnchor="middle" style={{ fontWeight: 600, fill: "var(--ink)" }}>
        {p.title}
      </text>
      {yLabels.map((yl, r) =>
        xLabels.map((xl, c) => {
          const cell = get(xl, yl);
          if (!cell) return null;
          const t = max > min ? (cell[key] - min) / (max - min) : 0;
          const best = cell[key] === min;
          return (
            <g key={`${xl}-${yl}`}>
              <rect
                x={x0 + c * cellW + 1}
                y={top + r * cellH + 1}
                width={cellW - 2}
                height={cellH - 2}
                rx={3}
                fill={shade(t)}
                stroke={best ? "var(--good)" : "none"}
                strokeWidth={best ? 2.4 : 0}
              />
              <text
                x={x0 + c * cellW + cellW / 2}
                y={top + r * cellH + cellH / 2 + 4}
                textAnchor="middle"
                fontSize={12}
                fontWeight={best ? 700 : 400}
                fill={t > 0.5 ? "#ffffff" : "#111827"}
                fontFamily="var(--font-ui)"
              >
                {p.fmt(cell[key])}
              </text>
            </g>
          );
        }),
      )}
      {xLabels.map((xl, c) => (
        <text key={xl} className="barchart-axis-label" x={x0 + c * cellW + cellW / 2} y={top + cellH * yLabels.length + 16} textAnchor="middle">
          {xl}
        </text>
      ))}
    </g>
  );

  return (
    <div className="barchart" ref={ref} role="group" aria-label={ariaLabel}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {yLabels.map((yl, r) => (
          <text key={yl} className="barchart-axis-label" x={marginLeft - 8} y={top + r * cellH + cellH / 2 + 4} textAnchor="end">
            {yl}
          </text>
        ))}
        <text
          className="barchart-axis-label"
          transform={`rotate(-90 12 ${top + (cellH * yLabels.length) / 2})`}
          x={12}
          y={top + (cellH * yLabels.length) / 2}
          textAnchor="middle"
        >
          {yTitle}
        </text>
        {panel("a", a, marginLeft, aMin, aMax)}
        {panel("b", b, marginLeft + panelW + gap, bMin, bMax)}
        <text className="barchart-axis-label" x={marginLeft + panelW / 2} y={height - 6} textAnchor="middle">
          {xTitle}
        </text>
        <text className="barchart-axis-label" x={marginLeft + panelW + gap + panelW / 2} y={height - 6} textAnchor="middle">
          {xTitle}
        </text>
      </svg>
    </div>
  );
}
