import type { ReactNode } from "react";

interface StatTileProps {
  label: string;
  value: string;
  note?: string;
}

export function StatTile({ label, value, note }: StatTileProps) {
  return (
    <div className="stat-tile">
      <div className="stat-tile-label">{label}</div>
      <div className="stat-tile-value">{value}</div>
      {note && <div className="stat-tile-note">{note}</div>}
    </div>
  );
}

export function StatGrid({ children }: { children: ReactNode }) {
  return <div className="stat-grid">{children}</div>;
}
