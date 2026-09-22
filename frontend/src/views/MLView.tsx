import { useEffect, useState } from "react";
import { BarChart } from "../components/BarChart";
import { ChartBlock } from "../components/ChartBlock";
import { LedgerTable } from "../components/LedgerTable";
import { Section } from "../components/Section";
import { SpinnerLine } from "../components/SpinnerLine";
import { StatGrid, StatTile } from "../components/StatTile";
import * as api from "../lib/api";
import type { MlPerformanceResponse, ModelPerformanceRow } from "../lib/types";

function pValueLabel(p: number): string {
  if (Number.isNaN(p)) return "—";
  return p < 0.001 ? "< 0.001" : p.toFixed(3);
}

export function MLView() {
  const [data, setData] = useState<MlPerformanceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retraining, setRetraining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getMlPerformance()
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  async function retrain() {
    setRetraining(true);
    setError(null);
    try {
      await api.postMlRetrain();
      const fresh = await api.getMlPerformance();
      setData(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo reentrenar");
    } finally {
      setRetraining(false);
    }
  }

  const winner = data?.results?.winner ?? null;

  return (
    <>
      <Section
        title="Desempeño de los modelos de aprendizaje automático"
        caption="Cinco modelos entrenados para predecir horas de cuidado no remunerado, validados con 10-fold cross-validation."
      >
        {loading && <SpinnerLine>Cargando resultados guardados…</SpinnerLine>}
        {error && <p style={{ color: "var(--error)" }}>{error}</p>}

        {!loading && !data?.performance && (
          <p className="callout">
            Todavía no hay resultados guardados. Corre <code>main.py</code> al menos una vez, o usa
            "Reentrenar los 5 modelos ahora" más abajo.
          </p>
        )}

        {data?.performance && (
          <>
            <LedgerTable<ModelPerformanceRow>
              rowKey={(r) => r.model}
              rows={data.performance.rows}
              isHighlighted={(r) => r.model === winner}
              columns={[
                { key: "model", header: "Modelo", render: (r) => r.model },
                {
                  key: "rmse",
                  header: "RMSE (h/semana)",
                  render: (r) => `${r.rmse_mean.toFixed(2)} ± ${r.rmse_std.toFixed(2)}`,
                },
                {
                  key: "r2",
                  header: "R²",
                  render: (r) => `${r.r2_mean.toFixed(3)} ± ${r.r2_std.toFixed(3)}`,
                },
              ]}
            />

            <ChartBlock
              title="RMSE promedio por modelo"
              caption="Validación cruzada 10-fold. Menor es mejor; el modelo ganador se resalta."
            >
              <BarChart
                ariaLabel="RMSE promedio por modelo"
                series={[{ key: "rmse", label: "RMSE", colorVar: "var(--series-neutral)" }]}
                valueFormat={(v) => v.toFixed(2)}
                data={data.performance.rows.map((r) => ({
                  key: r.model,
                  label: r.model,
                  values: { rmse: r.rmse_mean },
                  emphasizeSeriesKey: r.model === winner ? "rmse" : undefined,
                  note: r.model === winner ? "ganador" : undefined,
                }))}
              />
            </ChartBlock>
          </>
        )}

        <div className="section-foot btn-row" style={{ border: "none", marginTop: 20, paddingTop: 0 }}>
          {retraining ? (
            <SpinnerLine>Entrenando y validando 5 modelos — puede tardar 1-3 minutos…</SpinnerLine>
          ) : (
            <button className="btn" onClick={retrain} disabled={loading}>
              Reentrenar los 5 modelos ahora
            </button>
          )}
        </div>
      </Section>

      {data?.results && (
        <Section
          title="Validación estadística"
          caption="La comparación formal entre modelos, documentada en el artículo, Secciones 2-4."
        >
          <StatGrid>
            <StatTile label="Modelo ganador" value={data.results.winner} />
            <StatTile
              label="Prueba de Friedman entre los 5 modelos"
              value={`χ² ${data.results.friedman.statistic.toFixed(2)}`}
              note={`p = ${pValueLabel(data.results.friedman.p_value)}`}
            />
            <StatTile
              label="IC bootstrap 95% del RMSE"
              value={`${data.results.bootstrap_ci_rmse_winner.lower.toFixed(2)}–${data.results.bootstrap_ci_rmse_winner.upper.toFixed(2)}`}
              note="horas/semana, modelo ganador"
            />
            <StatTile
              label="Shapiro-Wilk (residuos)"
              value={`W ${data.results.shapiro_wilk_residuals.statistic.toFixed(3)}`}
              note={`p = ${pValueLabel(data.results.shapiro_wilk_residuals.p_value)}`}
            />
            <StatTile
              label="Breusch-Pagan (residuos)"
              value={`LM ${data.results.breusch_pagan_residuals.statistic.toFixed(2)}`}
              note={`p = ${pValueLabel(data.results.breusch_pagan_residuals.p_value)}`}
            />
          </StatGrid>

          <div style={{ marginTop: 22 }}>
            <div className="chart-block-title" style={{ marginBottom: 10 }}>
              Wilcoxon post-hoc frente al ganador
            </div>
            <LedgerTable
              rowKey={(r) => r.model}
              rows={Object.entries(data.results.wilcoxon_vs_winner).map(([model, v]) => ({
                model,
                ...v,
              }))}
              columns={[
                { key: "model", header: "Modelo", render: (r) => r.model },
                { key: "stat", header: "Estadístico", render: (r) => r.statistic.toFixed(3) },
                { key: "p", header: "p-valor", render: (r) => pValueLabel(r.p_value) },
              ]}
            />
          </div>
        </Section>
      )}
    </>
  );
}
