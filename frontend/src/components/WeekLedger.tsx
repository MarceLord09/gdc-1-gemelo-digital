import { useState } from "react";
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
