import type { ReactNode } from "react";

interface ChartBlockProps {
  title: string;
  caption?: string;
  children: ReactNode;
}

export function ChartBlock({ title, caption, children }: ChartBlockProps) {
  return (
    <div className="chart-block">
      <div className="chart-block-title">{title}</div>
      {caption && <div className="chart-block-caption">{caption}</div>}
      {children}
    </div>
  );
}
