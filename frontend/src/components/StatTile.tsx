import type { ReactNode } from "react";
import { ExportMenu } from "./ExportMenu";
import { Insight } from "./Insight";
import { useExportable } from "./useExportable";
import type { ReportItem } from "../lib/exporter";

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

interface StatGridProps {
  title: string;
  interpretation: string;
  explanation: string;
  children: ReactNode;
}

/** Conjunto de indicadores; se exporta como tabla (indicador, valor, nota). */
export function StatGrid({ title, interpretation, explanation, children }: StatGridProps) {
  const build = (): ReportItem | null => {
    const root = ref.current;
    if (!root) return null;
    const tiles = [...root.querySelectorAll(".stat-tile")];
    const txt = (el: Element, sel: string) =>
      el.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() ?? "";
    return {
      kind: "table" as const,
      title,
      interpretation,
      explanation,
      headers: ["Indicador", "Valor", "Nota"],
      rows: tiles.map((t) => [
        txt(t, ".stat-tile-label"),
        txt(t, ".stat-tile-value"),
        txt(t, ".stat-tile-note"),
      ]),
      highlight: tiles.map(() => false),
    };
  };
  const ref = useExportable<HTMLDivElement>(build);

  return (
    <div className="chart-block table-block" ref={ref}>
      <div className="chart-block-head">
        <div className="chart-block-title">{title}</div>
        <ExportMenu getItem={build} kind="table" filename={title} />
      </div>
      <div className="stat-grid">{children}</div>
      <Insight interpretation={interpretation} explanation={explanation} />
    </div>
  );
}
