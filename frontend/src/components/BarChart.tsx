import { useState } from "react";
import { useElementWidth } from "../lib/useElementWidth";
import "./BarChart.css";

export interface BarSeries {
  key: string;
  label: string;
  colorVar: string;
}

export interface BarCategory {
  key: string;
  label: string;
  values: Record<string, number>;
  note?: string;
  /** cuando coincide con una serie de esta categoría, esa barra usa --good */
  emphasizeSeriesKey?: string;
}

interface BarChartProps {
  series: BarSeries[];
  data: BarCategory[];
  height?: number;
  valueFormat?: (v: number) => string;
  ariaLabel: string;
}

function roundedTopPath(x: number, w: number, hRaw: number, baseline: number) {
  const h = Math.max(hRaw, 0);
  if (h <= 0.5) return "";
  const r = Math.min(4, w / 2, h);
  const top = baseline - h;
  return [
    `M ${x} ${top + r}`,
    `Q ${x} ${top} ${x + r} ${top}`,
    `L ${x + w - r} ${top}`,
    `Q ${x + w} ${top} ${x + w} ${top + r}`,
    `L ${x + w} ${baseline}`,
    `L ${x} ${baseline}`,
    "Z",
  ].join(" ");
}

export function BarChart({ series, data, height = 220, valueFormat, ariaLabel }: BarChartProps) {
  const { ref, width } = useElementWidth<HTMLDivElement>(560);
  const [hovered, setHovered] = useState<{ key: string; x: number } | null>(null);
  const fmt = valueFormat ?? ((v: number) => v.toLocaleString("es"));

  const hasNotes = data.some((d) => d.note);
  const marginTop = 26;
  const marginBottom = hasNotes ? 46 : 30;
  const marginX = 10;
  const innerWidth = Math.max(width - marginX * 2, 10);
  const innerHeight = height - marginTop - marginBottom;
  const baseline = height - marginBottom;
  const categoryWidth = innerWidth / Math.max(data.length, 1);

  const maxValue =
    Math.max(
      1e-6,
      ...data.flatMap((d) => series.map((s) => d.values[s.key] ?? 0)),
    ) * 1.2;

  const barGap = 3;
  const rawBarWidth = (categoryWidth * 0.6 - (series.length - 1) * barGap) / series.length;
  const barWidth = Math.max(6, Math.min(24, rawBarWidth));
  const groupWidth = barWidth * series.length + barGap * (series.length - 1);

  return (
    <div className="barchart" ref={ref} role="group" aria-label={ariaLabel}>
      {series.length > 1 && (
        <div className="barchart-legend">
          {series.map((s) => (
            <div className="barchart-legend-item" key={s.key}>
              <span className="barchart-legend-swatch" style={{ background: s.colorVar }} />
              {s.label}
            </div>
          ))}
        </div>
      )}
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <line
          x1={marginX}
          y1={baseline}
          x2={width - marginX}
          y2={baseline}
          stroke="var(--rule-strong)"
          strokeWidth={1}
        />
        {data.map((cat, i) => {
          const groupX = marginX + i * categoryWidth + (categoryWidth - groupWidth) / 2;
          const cx = marginX + i * categoryWidth + categoryWidth / 2;
          return (
            <g key={cat.key}>
              <rect
                x={marginX + i * categoryWidth}
                y={0}
                width={categoryWidth}
                height={baseline}
                fill="transparent"
                tabIndex={0}
                aria-label={`${cat.label}: ${series
                  .map((s) => `${s.label} ${fmt(cat.values[s.key] ?? 0)}`)
                  .join(", ")}`}
                onMouseEnter={() => setHovered({ key: cat.key, x: cx })}
                onMouseLeave={() => setHovered(null)}
                onFocus={() => setHovered({ key: cat.key, x: cx })}
                onBlur={() => setHovered(null)}
              />
              {series.map((s, si) => {
                const value = cat.values[s.key] ?? 0;
                const h = (value / maxValue) * innerHeight;
                const x = groupX + si * (barWidth + barGap);
                const color =
                  cat.emphasizeSeriesKey === s.key ? "var(--good)" : s.colorVar;
                const isDim = hovered !== null && hovered.key !== cat.key;
                return (
                  <g key={s.key} className="barchart-bar" data-dim={isDim}>
                    <path d={roundedTopPath(x, barWidth, h, baseline)} fill={color} />
                    <text
                      className="barchart-tip tabular"
                      x={x + barWidth / 2}
                      y={baseline - h - 8}
                      textAnchor="middle"
                    >
                      {fmt(value)}
                    </text>
                  </g>
                );
              })}
              <text className="barchart-axis-label" x={cx} y={baseline + 18} textAnchor="middle">
                {cat.label}
              </text>
              {cat.note && (
                <text className="barchart-note" x={cx} y={baseline + 34} textAnchor="middle">
                  {cat.note}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      {hovered &&
        (() => {
          const cat = data.find((d) => d.key === hovered.key);
          if (!cat) return null;
          return (
            <div
              className="barchart-tooltip"
              style={{ left: hovered.x, top: 4 }}
            >
              <div style={{ marginBottom: series.length > 1 ? 4 : 0 }}>{cat.label}</div>
              {series.map((s) => (
                <div className="barchart-tooltip-row" key={s.key}>
                  <span
                    className="barchart-tooltip-swatch"
                    style={{
                      background: cat.emphasizeSeriesKey === s.key ? "var(--good)" : s.colorVar,
                    }}
                  />
                  {series.length > 1 ? `${s.label}: ` : ""}
                  {fmt(cat.values[s.key] ?? 0)}
                </div>
              ))}
            </div>
          );
        })()}
    </div>
  );
}
