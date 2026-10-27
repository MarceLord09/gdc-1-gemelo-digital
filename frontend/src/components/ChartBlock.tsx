import type { ReactNode } from "react";
import { ExportMenu } from "./ExportMenu";
import { Insight } from "./Insight";
import { useExportable } from "./useExportable";
import { extractSvg, type ChartPayload, type LegendItem } from "../lib/exporter";

interface ChartBlockProps {
  title: string;
  caption?: string;
  interpretation: string;
  explanation: string;
  /** Para gráficos que no son un <svg> (p. ej. la barra de la semana). */
  exportChart?: () => ChartPayload;
  children: ReactNode;
}

function legendFromDom(root: HTMLElement): LegendItem[] {
  return [...root.querySelectorAll<HTMLElement>(".barchart-legend-item")].map((el) => ({
    label: el.textContent?.trim() ?? "",
    color: getComputedStyle(el.querySelector(".barchart-legend-swatch") ?? el).backgroundColor,
  }));
}

export function ChartBlock({
  title,
  caption,
  interpretation,
  explanation,
  exportChart,
  children,
}: ChartBlockProps) {
  const build = () => {
    const root = ref.current;
    if (!root) return null;
    let chart: ChartPayload | undefined = exportChart?.();
    if (!chart) {
      const svg = root.querySelector<SVGSVGElement>(".chart-block-body svg");
      if (!svg) return null;
      chart = extractSvg(svg, legendFromDom(root));
    }
    return { kind: "figure" as const, title, caption, interpretation, explanation, chart };
  };
  const ref = useExportable<HTMLDivElement>(build);

  return (
    <div className="chart-block" ref={ref}>
      <div className="chart-block-head">
        <div>
          <div className="chart-block-title">{title}</div>
          {caption && <div className="chart-block-caption">{caption}</div>}
        </div>
        <ExportMenu getItem={build} kind="figure" filename={title} />
      </div>
      <div className="chart-block-body">{children}</div>
      <Insight interpretation={interpretation} explanation={explanation} />
    </div>
  );
}
