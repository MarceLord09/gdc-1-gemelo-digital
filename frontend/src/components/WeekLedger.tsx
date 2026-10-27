import { useState } from "react";
import type { ChartPayload } from "../lib/exporter";
import "./WeekLedger.css";

export interface WeekSegment {
  key: string;
  label: string;
  hours: number;
  colorVar: string;
}

interface WeekLedgerProps {
  segments: WeekSegment[];
  totalHours?: number;
}

/** La firma visual de GDC-1: una semana son 168 horas, repartidas en una sola
 * barra. Cada franja es una categoría de uso del tiempo. */
export function WeekLedger({ segments, totalHours = 168 }: WeekLedgerProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const hovered = segments.find((s) => s.key === hoveredKey);

  return (
    <div className="week-ledger">
      <div className="week-ledger-bar" role="img" aria-label={`Semana de ${totalHours} horas repartida en ${segments.map((s) => `${s.label}: ${s.hours} horas`).join(", ")}`}>
        {segments.map((s) => (
          <div
            key={s.key}
            className="week-ledger-segment"
            style={{ flexGrow: Math.max(s.hours, 0.001), background: s.colorVar }}
            onMouseEnter={() => setHoveredKey(s.key)}
            onMouseLeave={() => setHoveredKey(null)}
            tabIndex={0}
            onFocus={() => setHoveredKey(s.key)}
            onBlur={() => setHoveredKey(null)}
          />
        ))}
      </div>
      <div className="week-ledger-scale">
        <span>0 h</span>
        <span>{totalHours} h</span>
      </div>
      {hovered && (
        <div className="week-ledger-tooltip" style={{ left: "50%" }}>
          {hovered.label}: {hovered.hours.toFixed(1)} h/semana
        </div>
      )}
      <div className="week-ledger-legend">
        {segments.map((s) => (
          <div className="week-ledger-legend-item" key={s.key}>
            <span className="week-ledger-legend-swatch" style={{ background: s.colorVar }} />
            <span className="week-ledger-legend-label">{s.label}</span>
            <span className="week-ledger-legend-value tabular">{s.hours.toFixed(1)} h</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Versión vectorial de la barra de la semana, para exportar. */
export function weekLedgerChart(segments: WeekSegment[], totalHours = 168): ChartPayload {
  const W = 600;
  const BAR_H = 44;
  const total = segments.reduce((a, s) => a + Math.max(s.hours, 0), 0) || totalHours;
  const gap = 2;
  const usable = W - gap * (segments.length - 1);
  let x = 0;
  let markup = "";
  segments.forEach((s) => {
    const w = (Math.max(s.hours, 0) / total) * usable;
    markup += `<rect x="${x}" y="0" width="${w}" height="${BAR_H}" fill="${getComputedStyle(document.documentElement).getPropertyValue(s.colorVar.slice(4, -1)).trim()}"/>`;
    if (w > 46) {
      markup += `<text x="${x + w / 2}" y="${BAR_H / 2 + 4}" text-anchor="middle" font-size="12" font-weight="600" fill="#ffffff" font-family="sans-serif">${s.hours.toFixed(1)} h</text>`;
    }
    x += w + gap;
  });
  markup += `<text x="0" y="${BAR_H + 18}" font-size="11" fill="#6b7280" font-family="sans-serif">0 h</text>`;
  markup += `<text x="${W}" y="${BAR_H + 18}" text-anchor="end" font-size="11" fill="#6b7280" font-family="sans-serif">${totalHours} h</text>`;
  const legend = segments.map((s) => ({
    label: `${s.label}: ${s.hours.toFixed(1)} h`,
    color: getComputedStyle(document.documentElement).getPropertyValue(s.colorVar.slice(4, -1)).trim(),
  }));
  return { markup, width: W, height: BAR_H + 26, legend };
}
