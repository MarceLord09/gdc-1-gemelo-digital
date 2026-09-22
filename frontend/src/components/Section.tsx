import type { ReactNode } from "react";

interface SectionProps {
  title: string;
  caption?: string;
  aside?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
}

export function Section({ title, caption, aside, foot, children }: SectionProps) {
  return (
    <section className="section">
      <div className="section-header">
        <div>
          <h2 className="section-title">{title}</h2>
          {caption && <p className="section-caption">{caption}</p>}
        </div>
        {aside}
      </div>
      {children}
      {foot && <div className="section-foot">{foot}</div>}
    </section>
  );
}
