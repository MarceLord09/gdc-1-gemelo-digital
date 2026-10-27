interface InsightProps {
  interpretation: string;
  explanation: string;
}

/** Interpretabilidad (qué dicen estos datos) y explicabilidad (por qué y cómo
 * se calculan) que acompañan a toda figura y tabla. */
export function Insight({ interpretation, explanation }: InsightProps) {
  return (
    <div className="insight">
      <div className="insight-item">
        <div className="insight-head">Interpretación</div>
        <p>{interpretation}</p>
      </div>
      <div className="insight-item">
        <div className="insight-head">Explicación</div>
        <p>{explanation}</p>
      </div>
    </div>
  );
}
